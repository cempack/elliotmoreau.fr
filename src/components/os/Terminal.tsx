"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { claimSurface, useSurfaceYield } from "./surface";

const Welcome = dynamic(() => import("./terminal/Session").then((m) => m.Welcome), { ssr: false });
const LangHello = dynamic(() => import("./terminal/Session").then((m) => m.LangHello), { ssr: false });
const TerminalView = dynamic(() => import("./terminal/View"), { ssr: false });

/**
 * CONTRACT (owner: boot/terminal agent)
 * Global Terminal app: a draggable glass terminal window that opens over
 * any page (dock icon, Spotlight, or the ` key). Interactive commands
 * (help, whoami, ls, cd/open <app>, cat now, projects, posts, contact,
 * copy email, sky <phase>, lang fr|en, sound on|off, clear, exit, neofetch,
 * sudo hire elliot …), history with ↑/↓, tab completion. Bilingual output.
 *
 * `useTerminal()` → { open, setOpen, toggle }. Opening remembers what had
 * focus and hands it back on close. The session (scrollback + history)
 * outlives the window: close and reopen and it's all still there; `exit`
 * logs out. The dock's Terminal item is found by [data-dock-launch=
 * "terminal"] so the window can grow out of it and shrink back into it.
 */
type TerminalCtx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
const Ctx = createContext<TerminalCtx>({ open: false, setOpen: () => {}, toggle: () => {} });
export const useTerminal = () => useContext(Ctx);

export type Entry = {
  id: number;
  cwd: string;
  /** what was typed (null for system lines like the welcome) */
  input: string | null;
  node: React.ReactNode;
  interrupted?: boolean;
};

type SessionCtx = {
  entries: Entry[];
  history: string[];
  append: (e: Omit<Entry, "id">) => void;
  clear: () => void;
  /** `exit`: log out, close; the next open starts a fresh session */
  reset: () => void;
  remember: (cmd: string) => void;
  /** reopen with a hello after `lang` reloads emOS in the other language */
  resumeAfterLangSwitch: () => void;
};
const SessionContext = createContext<SessionCtx | null>(null);
export function useTerminalSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useTerminalSession outside TerminalProvider");
  return v;
}

export type WinRect = { x: number; y: number; w: number; h: number };
type WindowCtx = { rect: WinRect | null; setRect: (r: WinRect) => void };
const WindowContext = createContext<WindowCtx>({ rect: null, setRect: () => {} });
export const useTerminalWindow = () => useContext(WindowContext);

const HISTORY_KEY = "em-term-history";
const LOGIN_KEY = "em-term-login";
const RESUME_KEY = "em-term-resume";

/** Previous login time (for "Last login: …"), then stamp this one. */
function stampLogin() {
  let last: string | null = null;
  try {
    last = localStorage.getItem(LOGIN_KEY);
    localStorage.setItem(LOGIN_KEY, new Date().toISOString());
  } catch {}
  return last;
}

function isEditable(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  const { blip } = useSound();
  const [open, setOpenState] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [rect, setRect] = useState<WinRect | null>(null);
  const openRef = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const started = useRef(false);
  const nextId = useRef(0);

  const append = useCallback((e: Omit<Entry, "id">) => {
    const id = ++nextId.current;
    setEntries((es) => [...es.slice(-199), { ...e, id }]);
  }, []);

  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const id = ++nextId.current;
    const last = stampLogin();
    setEntries([{ id, cwd: "~", input: null, node: <Welcome last={last} /> }]);
  }, []);

  const setOpen = useCallback(
    (v: boolean) => {
      if (v === openRef.current) return;
      openRef.current = v;
      if (v) {
        const a = document.activeElement;
        opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
        begin();
        blip("open");
        claimSurface("terminal");
      } else {
        blip("close");
        // hand focus back to whatever opened us, if focus is still ours
        const back = opener.current;
        opener.current = null;
        const here = document.activeElement;
        const ours = !here || here === document.body || !!here.closest(".os-term");
        if (back?.isConnected && ours) requestAnimationFrame(() => back.focus({ preventScroll: true }));
      }
      setOpenState(v);
    },
    [begin, blip]
  );

  const toggle = useCallback(() => setOpen(!openRef.current), [setOpen]);

  // on a phone the Terminal is a sheet: a menu bar panel dropping down
  // replaces it (on desktop it is a window, and menus open over windows)
  useSurfaceYield("terminal", (id) => {
    if (id === "menu" && openRef.current && window.matchMedia("(max-width: 767px)").matches) setOpen(false);
    // the overview shows the app windows: the Terminal never floats over them
    if (id === "overview" && openRef.current) setOpen(false);
  });

  const clear = useCallback(() => setEntries([]), []);
  const reset = useCallback(() => {
    started.current = false;
    setEntries([]);
    setOpen(false);
  }, [setOpen]);
  const remember = useCallback((cmd: string) => {
    setHistory((h) => (h[h.length - 1] === cmd ? h : [...h.slice(-99), cmd]));
  }, []);
  const resumeAfterLangSwitch = useCallback(() => {
    try {
      sessionStorage.setItem(RESUME_KEY, String(Date.now()));
    } catch {}
  }, []);

  // history survives reloads for the tab's lifetime
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]");
        if (Array.isArray(saved) && saved.length) setHistory((h) => (h.length ? h : saved.slice(-100)));
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!history.length) return;
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  // back from a `lang` switch: reopen where we were, in the new language
  // (the flag is consumed inside the timeout, so a dev double-run of this
  // effect, which clears the first timeout, can't lose it)
  useEffect(() => {
    let at = 0;
    try {
      at = Number(sessionStorage.getItem(RESUME_KEY) ?? 0);
    } catch {}
    if (!at) return;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RESUME_KEY);
      } catch {}
      if (Date.now() - at > 30_000) return;
      setOpen(true);
      append({ cwd: "~", input: null, node: <LangHello /> });
    }, 0);
    return () => window.clearTimeout(id);
  }, [lang, setOpen, append]);

  // ` (the key under Esc, whatever the layout) toggles, Quake-style
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Backquote" && e.key !== "`") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as Element | null;
      const inTerm = !!target?.closest?.(".os-term");
      if (inTerm) {
        if ((target as HTMLInputElement).value) return; // typing a ` in a command
      } else if (isEditable(target)) return;
      if (document.querySelector("dialog[open], .em-intro")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, setOpen, toggle]);
  const session = useMemo(
    () => ({ entries, history, append, clear, reset, remember, resumeAfterLangSwitch }),
    [entries, history, append, clear, reset, remember, resumeAfterLangSwitch]
  );
  const win = useMemo(() => ({ rect, setRect }), [rect]);

  return (
    <Ctx.Provider value={value}>
      <SessionContext.Provider value={session}>
        <WindowContext.Provider value={win}>{children}</WindowContext.Provider>
      </SessionContext.Provider>
    </Ctx.Provider>
  );
}

export function Terminal() {
  const { open } = useTerminal();
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);
  return mounted ? <TerminalView /> : null;
}

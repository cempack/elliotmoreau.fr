"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { rememberLocale, switchLocaleHref, useI18n } from "@/i18n/client";
import { useSiteData } from "@/components/os/SiteData";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useToast } from "@/components/Toasts";
import { useSound } from "@/lib/sound";
import { appForPath } from "../apps";
import { useSky } from "../sky";
import { rebootOS } from "../Intro";
import { useTerminal, useTerminalSession, type Entry } from "../Terminal";
import { SILENT, complete, cwdLabel, runCommand, type RunCtx } from "./commands";
import { ActionsCtx, Prompt, fill, type Actions } from "./ui";
import { termQueue } from "./queue";
import { shortcut, useContextMenu } from "../context/ContextMenu";

/** One-tap commands for the phone sheet, where typing is the slow path. */
const CHIPS = ["help", "whoami", "projects", "posts", "now", "neofetch", "theme", "contact", "moulinette"];

/**
 * The live terminal: scrollback (an aria-live log) and the prompt line.
 * Shared by the desktop window and the phone sheet. The prompt draws its
 * own block caret and a fish-style ghost completion over a real <input>,
 * both positioned in `ch` (JetBrains Mono is strictly monospaced).
 */
export function Session({
  mobile,
  autoFocus,
  onShake,
}: {
  mobile: boolean;
  autoFocus: boolean;
  onShake: () => void;
}) {
  const term = useTerminal();
  const session = useTerminalSession();
  const { lang, t, path } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const data = useSiteData();
  const { track, playing } = useSpotifyStatus(data.spotify);
  const sky = useSky();
  const sound = useSound();
  const { notify } = useToast();

  const app = appForPath(pathname);
  const cwd = cwdLabel(app);

  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [ranged, setRanged] = useState(false);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [overflow, setOverflow] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // right-click in the Terminal: clear it, or close it
  useContextMenu(rootRef, () => ({
    items: [
      { label: t.shell.context.clear, shortcut: shortcut("L", "ctrl"), onSelect: session.clear },
      { label: t.shell.context.closeTerminal, onSelect: () => term.setOpen(false) },
    ],
  }));

  const ctx: RunCtx = {
    lang,
    d: t,
    path,
    cwd: app,
    data,
    track,
    playing,
    sky,
    sound,
    notify,
    history: session.history,
    navigate: (href) => {
      router.push(href, { transitionTypes: ["app-open"] });
      // a launcher: the app it opened comes forward and the terminal tucks
      // back into the Dock (its session stays; ` or the Dock brings it back)
      window.setTimeout(() => term.setOpen(false), mobile ? 240 : 120);
    },
    close: () => term.setOpen(false),
    exit: () => session.reset(),
    clear: () => session.clear(),
    shake: onShake,
    switchLang: (to) => {
      session.resumeAfterLangSwitch();
      rememberLocale(to);
      window.setTimeout(() => router.push(switchLocaleHref(pathname, to)), 420);
    },
    reboot: rebootOS,
  };

  const focusInput = () => inputRef.current?.focus({ preventScroll: true });

  const reset = () => {
    setValue("");
    setCaret(0);
    setRanged(false);
    setHIdx(null);
    setDraft("");
    setOverflow(false);
  };

  const submit = (raw: string) => {
    const line = raw.replace(/\s+$/, "");
    if (line.trim()) session.remember(line.trim());
    const out = runCommand(line, { ...ctx, history: line.trim() ? [...session.history, line.trim()] : session.history });
    if (out !== SILENT) session.append({ cwd, input: line, node: out });
    reset();
  };

  const put = (text: string) => {
    setValue(text);
    setCaret(text.length);
    setHIdx(null);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      // only if nothing was typed in between (fast fingers beat a frame)
      if (el.value === text) el.setSelectionRange(text.length, text.length);
    });
  };

  const actions = useRef<Actions>({ run: () => {}, fill: () => {} });
  useEffect(() => {
    actions.current.run = (cmd) => {
      submit(cmd);
      if (!mobile) focusInput();
    };
    actions.current.fill = put;
  });
  // a command queued for the open terminal (the README icon's cat README.md)
  useEffect(() => {
    if (!term.open) return;
    const go = () => {
      const c = termQueue.take();
      if (c) actions.current.run(c);
    };
    go();
    return termQueue.subscribe(go);
  }, [term.open]);
  const actionsValue = useMemo<Actions>(
    () => ({ run: (c) => actions.current.run(c), fill: (c) => actions.current.fill(c) }),
    []
  );

  // focus the prompt on open; on touch screens focus the window/sheet
  // instead, so the keyboard doesn't jump up before anyone asked to type
  // (keyed on `open` too: reopening mid-exit revives this same instance)
  useEffect(() => {
    if (!term.open) return;
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
    else scrollRef.current?.closest<HTMLElement>(".os-term")?.focus({ preventScroll: true });
  }, [autoFocus, term.open]);

  // newest output in view
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.entries]);

  const comp = focused && !ranged && caret === value.length ? complete(value, ctx) : null;
  const ghost = comp?.ghost ?? "";

  const syncCaret = (el: HTMLInputElement) => {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setCaret(start);
    setRanged(start !== end);
    setOverflow(el.scrollWidth > el.clientWidth + 1);
  };

  const recall = (dir: -1 | 1) => {
    const h = session.history;
    if (!h.length) return;
    let next: number | null;
    if (hIdx === null) {
      if (dir === 1) return;
      setDraft(value);
      next = h.length - 1;
    } else {
      next = hIdx + dir;
      if (next < 0) next = 0;
      if (next >= h.length) next = null;
    }
    setHIdx(next);
    const text = next === null ? draft : h[next];
    setValue(text);
    setCaret(text.length);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el && el.value === text) el.setSelectionRange(text.length, text.length);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      recall(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      recall(1);
    } else if (e.key === "Tab") {
      if (e.shiftKey || !value) return; // let focus move on an empty prompt
      e.preventDefault();
      const c = complete(value, ctx);
      if (c.value !== null) put(c.value);
      else if (c.list.length)
        session.append({
          cwd,
          input: value,
          node: (
            <ul className="os-term-ls os-term-ls--hint">
              {c.list.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ),
        });
    } else if (e.key === "ArrowRight" && ghost && el.selectionStart === value.length) {
      e.preventDefault();
      put(value + ghost);
    } else if (e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "l") {
        e.preventDefault();
        session.clear();
      } else if (k === "c" && el.selectionStart === el.selectionEnd) {
        e.preventDefault();
        session.append({ cwd, input: value, node: null, interrupted: true });
        reset();
      } else if (k === "u") {
        e.preventDefault();
        put("");
      }
    }
  };

  // click anywhere in the scrollback (that isn't a link or a selection) to type
  const onBodyUp = (e: React.MouseEvent) => {
    if (mobile) return;
    if ((e.target as HTMLElement).closest("a,button,input")) return;
    if (window.getSelection()?.isCollapsed === false) return;
    focusInput();
  };

  const line = (
    <form
      className="os-term-line"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
    >
      <Prompt cwd={cwd} />
      <span className={`os-term-field ${overflow ? "is-overflow" : ""}`}>
        <input
          ref={inputRef}
          className="os-term-input"
          value={value}
          aria-label={t.system.term.input}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          onChange={(e) => {
            setValue(e.target.value);
            setHIdx(null);
            syncCaret(e.target);
          }}
          onSelect={(e) => syncCaret(e.currentTarget)}
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            setFocused(true);
            syncCaret(e.currentTarget);
          }}
          onBlur={() => setFocused(false)}
        />
        <span className="os-term-overlay" aria-hidden>
          <span className="os-term-mirror">{value}</span>
          {ghost && <span className="os-term-ghost">{ghost}</span>}
        </span>
        {!overflow && !ranged && (
          <span
            key={`${caret}:${value.length}`}
            className={`os-term-caret ${focused ? "" : "is-idle"}`}
            style={{ "--x": caret } as React.CSSProperties}
            aria-hidden
          >
            {value[caret] ?? ghost[0] ?? ""}
          </span>
        )}
      </span>
    </form>
  );

  return (
    <ActionsCtx.Provider value={actionsValue}>
      <div ref={rootRef} className="os-term-session">
        <div ref={scrollRef} className="os-term-scroll" data-lenis-prevent onMouseUp={onBodyUp}>
          <div className="os-term-log" role="log" aria-live="polite" aria-relevant="additions">
            {session.entries.map((e) => (
              <EntryView key={e.id} entry={e} />
            ))}
          </div>
          {!mobile && line}
        </div>
        {mobile && (
          <div className="os-term-dockline">
            <div className="os-term-chips" role="group" aria-label={t.system.term.suggestions} data-lenis-prevent>
              {CHIPS.map((c) => (
                <button key={c} type="button" className="os-term-chip" onClick={() => submit(c)}>
                  {c}
                </button>
              ))}
            </div>
            {line}
          </div>
        )}
      </div>
    </ActionsCtx.Provider>
  );
}

function EntryView({ entry }: { entry: Entry }) {
  return (
    <div className="os-term-entry">
      {entry.input !== null && (
        <p className="os-term-echo">
          <Prompt cwd={entry.cwd} />
          <span className="os-term-typed">{entry.input}</span>
          {entry.interrupted && <span className="os-term-dim">^C</span>}
        </p>
      )}
      {entry.node != null && <div className="os-term-out">{entry.node}</div>}
    </div>
  );
}

/** First lines of a session: last login + how to start. */
export function Welcome({ last }: { last: string | null }) {
  const { lang, t } = useI18n();
  const s = t.system.term;
  const when =
    last &&
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
      timeZone: "Europe/Paris",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(last));
  const [before, after = ""] = s.welcome.split("{help}");
  return (
    <div className="os-term-welcome">
      {when && <p className="os-term-dim">{fill(s.lastLogin, { date: when })}</p>}
      <p>
        {before}
        <HelpChip />
        {after}
      </p>
    </div>
  );
}

function HelpChip() {
  return (
    <ActionsCtx.Consumer>
      {(a) => (
        <button type="button" className="os-term-cmdlink" onClick={() => a.run("help")}>
          help
        </button>
      )}
    </ActionsCtx.Consumer>
  );
}

/** Printed after a `lang` switch reloads emOS in the other language. */
export function LangHello() {
  const { t } = useI18n();
  return <p className="os-term-ok">{t.system.term.lang.hello}</p>;
}

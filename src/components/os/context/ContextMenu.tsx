"use client";

import "./context.css";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { rememberLocale, switchLocaleHref, useI18n } from "@/i18n/client";
import { usePalette } from "@/components/ui/palette";
import { useToast } from "@/components/Toasts";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { useSound } from "@/lib/sound";
import { copyText } from "@/lib/clipboard";
import { claimSurface, useSurfaceYield } from "../surface";
import { openOverview } from "../overview";
import { useTerminal } from "../Terminal";
import { SKY_PHASES, useSky, type SkyMode } from "../sky";
import { collect, shortcut, type MenuContext, type MenuItem, type MenuSection } from "./menu";

export { useContextMenu, shortcut, type MenuItem, type MenuSection, type MenuContext } from "./menu";

/** Copy, then say so the way the OS does (a banner and a chime), or say it couldn't. */
export function useCopy() {
  const { t } = useI18n();
  const { notify } = useToast();
  const { blip } = useSound();
  const failed = t.shell.context.copyFailed;
  return useCallback(
    async (text: string, done: string) => {
      if (await copyText(text)) {
        blip("success");
        notify(done);
      } else notify(failed);
    },
    [blip, notify, failed]
  );
}

function cells(rows: string[]): Cells {
  const out: Cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") out.push([x, y]);
  });
  return out;
}
const G_CHECK = cells([".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."]);
const G_MORE = cells([".......", "..#....", "...#...", "....#..", "...#...", "..#....", "......."]);

/** how long the chosen item flashes before the menu lets go (macOS does the same) */
const BLINK = 150;
/** the fade as the menu leaves */
const LEAVE = 130;
/** a right button held from the click and released over an item picks it, once it has had time to be seen */
const HOLD_PICK = 260;

type Open = {
  id: number;
  x: number;
  y: number;
  sections: MenuSection[];
  keyboard: boolean;
  path: string;
  leaving: boolean;
};

const EDITABLE = "input,textarea,select,[contenteditable]:not([contenteditable='false'])";

/**
 * emOS's right-click menu. One listener for the whole page: a right-click
 * asks the elements under the pointer what they offer (useContextMenu, see
 * ./menu), adds what every page has (Copy for a selection, Open / Copy link
 * for a link) and closes with Search. Nothing registered there (the
 * Desktop, the menu bar) gets the OS's own menu: Search, the windows, the
 * Terminal, the sky, sound and language.
 *
 * The browser keeps its own menu where it serves better: in text fields
 * (spelling, paste), with Shift held, and on touch, where a long press
 * belongs to the page. Keyboard: the menu key or Shift+F10 opens it at the
 * focused element; arrows, Home/End, a letter, Enter, → into a submenu, ←
 * and Esc back out.
 */
export function ContextMenu() {
  const { t, lang } = useI18n();
  const c = t.shell.context;
  const cc = t.shell.control;
  const router = useRouter();
  const pathname = usePathname();
  const palette = usePalette();
  const term = useTerminal();
  const sky = useSky();
  const sound = useSound();
  const copy = useCopy();
  const [menu, setMenu] = useState<Open | null>(null);
  const seq = useRef(0);
  const pointer = useRef("mouse");
  const opener = useRef<HTMLElement | null>(null);
  const live = useRef<{ build: (ctx: MenuContext) => MenuSection[]; path: string }>({ build: () => [], path: pathname });

  const linkSection = (a: HTMLAnchorElement): MenuSection => {
    const mail = a.protocol === "mailto:";
    const blank = a.target === "_blank";
    const items: MenuItem[] = [{ label: c.open, onSelect: () => a.click() }];
    if (!mail && !blank) items.push({ label: c.newTab, onSelect: () => window.open(a.href, "_blank", "noopener,noreferrer") });
    items.push(
      mail
        ? { label: c.copyAddress, onSelect: () => copy(decodeURIComponent(a.href.slice(7).split("?")[0]), c.copied) }
        : { label: c.copyLink, onSelect: () => copy(a.href, c.linkCopied) }
    );
    return { items };
  };

  const search: MenuItem = { label: c.search, shortcut: shortcut("K"), onSelect: () => palette.open() };

  /** what a right-click anywhere else gets: the OS's own menu */
  const osMenu = (): MenuSection[] => [
    {
      items: [
        search,
        { label: c.overview, shortcut: shortcut("↑", "ctrl"), onSelect: openOverview },
        { label: term.open ? c.closeTerminal : c.terminal, onSelect: () => term.setOpen(!term.open) },
      ],
    },
    {
      items: [
        {
          label: cc.appearance,
          submenu: (["auto", ...SKY_PHASES] as SkyMode[]).map((m) => ({
            label: cc[m],
            checked: sky.mode === m,
            onSelect: () => sky.setMode(m),
          })),
        },
        { label: cc.sound, checked: !sound.muted, onSelect: sound.toggle },
        {
          label: c.language,
          onSelect: () => {
            const to = lang === "en" ? "fr" : "en";
            rememberLocale(to);
            router.push(switchLocaleHref(pathname, to), { scroll: false });
          },
        },
      ],
    },
  ];

  const build = (ctx: MenuContext): MenuSection[] => {
    const { sections, coversLink, final } = collect(ctx);
    const head: MenuSection[] = [];
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    if (text && sel?.containsNode(ctx.target, true)) {
      head.push({ items: [{ label: c.copy, shortcut: shortcut("C"), onSelect: () => copy(text, c.copied) }] });
    }
    if (ctx.link && !coversLink) head.push(linkSection(ctx.link));
    const img = ctx.target.closest("img");
    if (img?.currentSrc && !ctx.link) {
      head.push({ items: [{ label: c.openImage, onSelect: () => window.open(img.currentSrc, "_blank", "noopener,noreferrer") }] });
    }
    const all = [...head, ...sections];
    if (final) return all;
    if (!all.length) return osMenu();
    return [...all, { items: [search] }];
  };

  useEffect(() => {
    live.current = { build, path: pathname };
  });

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      pointer.current = e.pointerType;
    };
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      // a right-click on the menu itself does nothing
      if (target.closest(".os-ctx-layer")) return e.preventDefault();
      const type = "pointerType" in e && typeof e.pointerType === "string" && e.pointerType ? e.pointerType : pointer.current;
      if (type === "touch") return;
      if (target.closest(EDITABLE) || target.closest(".em-intro")) return;
      // the menu key / Shift+F10: no button, and the menu opens at the focused element
      const keyboard = e.button !== 2;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      const sections = live.current.build({ target, link, keyboard });
      if (!sections.length) return;
      e.preventDefault();
      let x = e.clientX;
      let y = e.clientY;
      if (keyboard) {
        const r = target.getBoundingClientRect();
        x = r.left + Math.min(12, r.width / 2);
        y = Math.min(r.bottom, r.top + 36);
      }
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      claimSurface("context");
      setMenu({ id: ++seq.current, x, y, sections, keyboard, path: live.current.path, leaving: false });
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("contextmenu", onMenu);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("contextmenu", onMenu);
    };
  }, []);

  /** let the menu go (it fades, then unmounts); `restore` hands focus back to where it was */
  const dismiss = useCallback((restore: boolean) => {
    setMenu((m) => (m && !m.leaving ? { ...m, leaving: true } : m));
    if (restore) {
      const back = opener.current;
      if (back?.isConnected) back.focus({ preventScroll: true });
    }
    opener.current = null;
  }, []);

  const leavingId = menu?.leaving ? menu.id : null;
  useEffect(() => {
    if (leavingId == null) return;
    const id = window.setTimeout(() => setMenu((n) => (n?.id === leavingId ? null : n)), LEAVE);
    return () => window.clearTimeout(id);
  }, [leavingId]);

  useSurfaceYield("context", () => dismiss(false));

  const openId = menu && !menu.leaving ? menu.id : null;
  useEffect(() => {
    if (openId == null) return;
    const outside = (e: Event) => !(e.target instanceof Element && e.target.closest(".os-ctx-layer"));
    const onDown = (e: PointerEvent) => outside(e) && dismiss(false);
    const onWheel = (e: Event) => outside(e) && dismiss(false);
    const onGone = () => dismiss(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    window.addEventListener("touchmove", onWheel, { capture: true, passive: true });
    window.addEventListener("resize", onGone);
    window.addEventListener("blur", onGone);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("touchmove", onWheel, true);
      window.removeEventListener("resize", onGone);
      window.removeEventListener("blur", onGone);
    };
  }, [openId, dismiss]);

  // a page change takes the menu with it
  const shown = menu && menu.path === pathname ? menu : null;
  if (!shown) return null;

  return createPortal(
    <MenuView
      key={shown.id}
      open={shown}
      label={c.label}
      onPick={(item) => {
        dismiss(true);
        item.onSelect?.();
      }}
      onDismiss={dismiss}
    />,
    document.body
  );
}

type Row = { item: MenuItem; at: number } | { sep: true; key: string };

function rowsOf(sections: MenuSection[]) {
  const rows: Row[] = [];
  const items: MenuItem[] = [];
  sections.forEach((s, k) => {
    if (k > 0) rows.push({ sep: true, key: `s${k}` });
    for (const item of s.items) {
      rows.push({ item, at: items.length });
      items.push(item);
    }
  });
  return { rows, items };
}

/** the next enabled item from `from` in direction `d` (wrapping); -1 when there is none */
function step(items: MenuItem[], from: number, d: 1 | -1) {
  const n = items.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from < 0 ? (d > 0 ? -1 : 0) : from) + d * k) % n + n) % n;
    if (!items[i].disabled) return i;
  }
  return -1;
}

function MenuView({
  open,
  label,
  onPick,
  onDismiss,
}: {
  open: Open;
  label: string;
  onPick: (item: MenuItem) => void;
  onDismiss: (restore: boolean) => void;
}) {
  const base = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const opened = useRef(0);
  const subTimer = useRef(0);
  const typed = useRef({ text: "", at: 0 });
  const { rows, items } = rowsOf(open.sections);
  const [active, setActive] = useState(() => (open.keyboard ? step(items, -1, 1) : -1));
  const [sub, setSub] = useState<{ at: number; active: number } | null>(null);
  const [level, setLevel] = useState<0 | 1>(0);
  const [blink, setBlink] = useState<string | null>(null);
  const subItems = sub ? (items[sub.at]?.submenu ?? []) : [];
  const subAt = sub?.at ?? -1;

  // place it: at the pointer, flipped to stay on screen (before the first paint)
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    opened.current = performance.now();
    const r = el.getBoundingClientRect();
    const m = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = open.x;
    let top = open.y;
    let ox = "left";
    let oy = "top";
    if (left + r.width > vw - m) {
      left = Math.max(m, open.x - r.width);
      ox = "right";
    }
    if (top + r.height > vh - m) {
      top = Math.max(m, Math.min(open.y - r.height, vh - m - r.height));
      oy = "bottom";
    }
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.transformOrigin = `${ox} ${oy}`;
    el.focus({ preventScroll: true });
  }, [open.x, open.y]);

  // the submenu: beside its item, on whichever side has room
  useLayoutEffect(() => {
    const el = subRef.current;
    const root = rootRef.current;
    if (!el || !root || subAt < 0) return;
    const row = root.querySelector<HTMLElement>(`[data-at="${subAt}"]`);
    if (!row) return;
    const a = row.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const m = 8;
    const pad = 6;
    let left = a.right + 2;
    if (left + r.width > window.innerWidth - m) left = Math.max(m, a.left - r.width - 2);
    const top = Math.max(m, Math.min(a.top - pad, window.innerHeight - m - r.height));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }, [subAt]);

  useEffect(() => () => window.clearTimeout(subTimer.current), []);

  const openSub = (at: number, first: boolean) => {
    window.clearTimeout(subTimer.current);
    const list = items[at]?.submenu ?? [];
    setSub({ at, active: first ? step(list, -1, 1) : -1 });
    if (first) setLevel(1);
  };
  const closeSub = () => {
    window.clearTimeout(subTimer.current);
    setSub(null);
    setLevel(0);
  };

  const pick = (item: MenuItem, key: string, at: number) => {
    if (item.disabled || open.leaving) return;
    if (item.submenu) return openSub(at, true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onPick(item);
    setBlink(key);
    window.setTimeout(() => onPick(item), BLINK);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open.leaving || blink) return e.preventDefault();
    const inSub = level === 1 && sub != null;
    const list = inSub ? subItems : items;
    const cur = inSub ? sub.active : active;
    const set = (i: number) => (inSub ? setSub({ ...sub, active: i }) : setActive(i));
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") set(step(list, cur, k === "ArrowDown" ? 1 : -1));
    else if (k === "Home") set(step(list, -1, 1));
    else if (k === "End") set(step(list, 0, -1));
    else if (k === "ArrowRight") {
      if (!inSub && cur >= 0 && items[cur]?.submenu) openSub(cur, true);
    } else if (k === "ArrowLeft") {
      if (inSub) closeSub();
    } else if (k === "Enter" || k === " ") {
      if (cur >= 0) pick(list[cur], inSub ? `1-${cur}` : `0-${cur}`, cur);
    } else if (k === "Escape") {
      if (inSub) closeSub();
      else onDismiss(true);
    } else if (k === "Tab") onDismiss(true);
    else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // type to jump: the next item starting with what was typed
      const now = e.timeStamp;
      const t = typed.current;
      t.text = now - t.at < 700 ? t.text + k.toLowerCase() : k.toLowerCase();
      t.at = now;
      const n = list.length;
      for (let d = t.text.length > 1 ? 0 : 1; d <= n; d++) {
        const i = (Math.max(cur, 0) + d) % n;
        if (!list[i].disabled && list[i].label.toLowerCase().startsWith(t.text)) {
          set(i);
          break;
        }
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const hover = (at: number) => {
    if (blink) return;
    setActive(at);
    setLevel(0);
    window.clearTimeout(subTimer.current);
    if (items[at]?.submenu) {
      if (sub?.at !== at) subTimer.current = window.setTimeout(() => openSub(at, false), 90);
    } else if (sub) subTimer.current = window.setTimeout(closeSub, 220);
  };

  const item = (it: MenuItem, at: number, lvl: 0 | 1) => {
    const key = `${lvl}-${at}`;
    const on = lvl === 0 ? at === active || sub?.at === at : sub?.active === at;
    return (
      <div
        key={key}
        id={`${base}-${key}`}
        role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
        aria-checked={it.checked === undefined ? undefined : it.checked}
        aria-disabled={it.disabled || undefined}
        aria-haspopup={it.submenu ? "menu" : undefined}
        aria-expanded={it.submenu ? sub?.at === at : undefined}
        // the open submenu sits beside the menu in the DOM; this puts it under its item for assistive tech
        aria-owns={it.submenu && sub?.at === at ? `${base}-sub` : undefined}
        data-at={lvl === 0 ? at : undefined}
        data-active={on || undefined}
        data-blink={blink === key || undefined}
        className="os-ctx-item"
        onPointerMove={(e) => {
          if (e.pointerType === "touch") return;
          if (lvl === 0) {
            if (at !== active || level !== 0) hover(at);
          } else if (sub && (sub.active !== at || level !== 1)) {
            window.clearTimeout(subTimer.current);
            setSub({ ...sub, active: at });
            setLevel(1);
          }
        }}
        onClick={() => pick(it, key, at)}
        onPointerUp={(e) => {
          // pressed on the page, dragged here, let go: that's a pick
          if (e.button === 2 && e.timeStamp - opened.current > HOLD_PICK) pick(it, key, at);
        }}
      >
        <span className="os-ctx-check" aria-hidden>
          {it.checked && <PixelGlyph cells={G_CHECK} size={11} />}
        </span>
        <span className="os-ctx-label">{it.label}</span>
        {it.shortcut && <span className="os-ctx-kbd">{it.shortcut}</span>}
        {it.submenu && <PixelGlyph cells={G_MORE} size={11} className="os-ctx-more" />}
      </div>
    );
  };

  const activeId =
    level === 1 && sub && sub.active >= 0 ? `${base}-1-${sub.active}` : active >= 0 ? `${base}-0-${active}` : undefined;

  return (
    <div
      className="os-ctx-layer"
      data-leaving={open.leaving || undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={rootRef}
        role="menu"
        aria-label={label}
        aria-activedescendant={activeId}
        tabIndex={-1}
        className="os-ctx"
        data-checks={items.some((i) => i.checked !== undefined) || undefined}
        onKeyDown={onKeyDown}
        onPointerLeave={(e) => {
          if (e.pointerType === "touch" || blink) return;
          if (!sub) setActive(-1);
        }}
      >
        {rows.map((r) => ("sep" in r ? <div key={r.key} role="separator" className="os-ctx-sep" /> : item(r.item, r.at, 0)))}
      </div>
      {sub && subItems.length > 0 && (
        <div
          ref={subRef}
          id={`${base}-sub`}
          role="menu"
          aria-label={items[sub.at]?.label}
          className="os-ctx os-ctx--sub"
          data-checks={subItems.some((i) => i.checked !== undefined) || undefined}
          onPointerEnter={() => window.clearTimeout(subTimer.current)}
        >
          {subItems.map((it, j) => item(it, j, 1))}
        </div>
      )}
    </div>
  );
}

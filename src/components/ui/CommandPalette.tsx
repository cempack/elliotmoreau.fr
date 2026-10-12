"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { useSound } from "@/lib/sound";
import { lenisRef } from "@/lib/lenisRef";
import { spring } from "@/lib/motion";
import { claimSurface } from "@/components/os/surface";
import { useMedia, useReduced } from "@/hooks/env";
import { DeparturesBoard, type BoardRow } from "./Departures";

export type Command = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  /** the leading glyph: an app's pixel icon, or the kind of thing it is */
  icon?: React.ReactNode;
  /** a row of the departures board (shown, before everything, when nothing is typed);
      `arrival` rows go on the arrivals board beneath it (where you've been this visit) */
  board?: Omit<BoardRow, "id" | "label"> & { arrival?: boolean };
  /** a small picture of the thing (a post's sky, a repo's minimap), in place of the icon */
  thumb?: React.ReactNode;
  /** what the preview pane shows while this row is highlighted (wide screens) */
  preview?: { art?: React.ReactNode; title: string; body?: string; meta?: string };
  /** an option drawn by its owner (the dead letter); `post` runs it */
  option?: React.ComponentType<{ active: boolean; launching: boolean; post: () => void }>;
  /** ms its own exit plays before the palette closes (Enter waits for it) */
  launch?: number;
  perform: () => void;
};

type Ctx = { open: () => void; close: () => void; isOpen: boolean };
const PaletteCtx = createContext<Ctx>({ open: () => {}, close: () => {}, isOpen: false });
export const usePalette = () => useContext(PaletteCtx);

function score(c: Command, q: string) {
  if (!q) return 1;
  const hay = `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase();
  const needle = q.toLowerCase().trim();
  if (c.label.toLowerCase().startsWith(needle)) return 3;
  if (hay.includes(needle)) return 2;
  // loose subsequence match: "gh" finds "GitHub"
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length ? 1 : 0;
}

/**
 * The launcher (Walker-style) on a native modal <dialog> (top layer: no
 * containing-block traps, inert page, Esc for free). ⌘K / Ctrl+K or "/"
 * opens it; ARIA combobox + listbox; springs in from just above, and
 * leaves the way it came before the dialog actually closes.
 * Theme it with the --pal-* custom properties on any ancestor.
 */
export function CommandPalette({
  commands,
  placeholder = "Type a command or search…",
  placeholderShort,
  cancel,
  empty = "Nothing found",
  board,
  fallback,
  answers,
  arrivals,
  children,
}: {
  commands: Command[];
  placeholder?: string;
  /** phones: a placeholder that fits the narrow field */
  placeholderShort?: string;
  /** touch: the label of the button that closes it (where Esc means nothing) */
  cancel?: string;
  empty?: string;
  /** the departures board's header: its title, the airport code, the clock */
  board?: { title: string; code: string; clock: string };
  /** what to offer when nothing matches (a "did you mean", the dead letter) */
  fallback?: (query: string) => Command[];
  /** answers to the query itself ("time", "playing", a place), above the results */
  answers?: (query: string) => Command[];
  /** the arrivals board's title, under the departures (rows: board.arrival) */
  arrivals?: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  /** the chosen command, run once the dialog has really closed */
  const pending = useRef<Command | null>(null);
  const pendingTimer = useRef(0);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { blip } = useSound();
  const listId = useId();
  const reduced = useReduced();
  const narrow = useMedia("(max-width: 767px)");
  const departCmds = useMemo(() => commands.filter((c) => c.board && !c.board.arrival), [commands]);
  const arriveCmds = useMemo(() => commands.filter((c) => c.board?.arrival), [commands]);
  const boardCmds = useMemo(() => [...departCmds, ...arriveCmds], [departCmds, arriveCmds]);

  const found = useMemo(() => {
    const scored = commands.filter((c) => !c.board).map((c) => ({ c, s: score(c, query) })).filter((r) => r.s > 0);
    // groups stay contiguous; within the query, the best group leads
    const groupBest = new Map<string, number>();
    for (const r of scored) groupBest.set(r.c.group, Math.max(groupBest.get(r.c.group) ?? 0, r.s));
    const order = [...new Set(scored.map((r) => r.c.group))].sort(
      (a, b) => (groupBest.get(b) ?? 0) - (groupBest.get(a) ?? 0)
    );
    return order.flatMap((g) =>
      scored
        .filter((r) => r.c.group === g)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.c)
    );
  }, [commands, query]);
  // nothing typed: the board's rows come first, real options before Apps
  const showBoard = !!board && visible && !query.trim() && boardCmds.length > 0;
  const spare = useMemo(() => (found.length === 0 && fallback ? fallback(query) : []), [found.length, fallback, query]);
  const asked = useMemo(() => (answers && query.trim() ? answers(query) : []), [answers, query]);
  const results = useMemo(
    () => (showBoard ? [...boardCmds, ...found] : found.length ? [...asked, ...found] : [...asked, ...spare]),
    [showBoard, boardCmds, found, spare, asked]
  );
  const [launching, setLaunching] = useState<string | null>(null);
  const nBoard = showBoard ? boardCmds.length : 0;

  const open = useCallback(() => {
    const d = dialogRef.current;
    if (!d || visibleRef.current) return;
    if (!d.open) d.showModal();
    visibleRef.current = true;
    setVisible(true);
    setLaunching(null);
    setQuery("");
    setActive(0);
    lenisRef.current?.stop();
    blip("open");
    claimSurface("palette");
    // focus inside the tap itself, or iOS keeps its keyboard down
    inputRef.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [blip]);

  const close = useCallback(() => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    setVisible(false);
    lenisRef.current?.start();
    blip("close");
  }, [blip]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t?.closest?.("input,textarea,[contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (visibleRef.current) close();
        else open();
      } else if (e.key === "/" && !typing && !visibleRef.current) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * The dialog leaves first, then the command runs. A modal <dialog> makes
   * the rest of the page inert until it closes, and closing restores focus
   * to whatever had it before: anything the command focuses (the Terminal
   * prompt, a menu bar panel) has to come after both.
   */
  const finish = useCallback(() => {
    window.clearTimeout(pendingTimer.current);
    const d = dialogRef.current;
    if (d?.open && !visibleRef.current) d.close();
    const c = pending.current;
    pending.current = null;
    c?.perform();
  }, []);

  const run = (c: Command) => {
    // an option with its own exit plays it first, then posts itself
    if (c.launch && launching !== c.id) {
      setLaunching(c.id);
      return;
    }
    runNow(c);
  };
  const runNow = (c: Command) => {
    if (!visibleRef.current) return;
    pending.current = c;
    close();
    // safety net in case the exit animation never reports back
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(finish, 320);
  };
  useEffect(() => () => window.clearTimeout(pendingTimer.current), []);

  // phones: the on-screen keyboard covers the bottom of the layout viewport
  // (iOS never resizes it), so the list is sized to what is really visible
  useEffect(() => {
    const vv = window.visualViewport;
    const d = dialogRef.current;
    if (!visible || !vv || !d) return;
    const sync = () => d.style.setProperty("--em-vvh", `${Math.round(vv.height)}px`);
    sync();
    vv.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      d.style.removeProperty("--em-vvh");
    };
  }, [visible]);

  // the keyboard moves the highlight: the list follows it (the pointer
  // highlights what it's already over, so hovering never scrolls)
  const listRef = useRef<HTMLUListElement>(null);
  const byKey = useRef(false);
  const activeId = results[active]?.id;
  useEffect(() => {
    if (!byKey.current || !activeId) return;
    byKey.current = false;
    const list = listRef.current;
    const el = document.getElementById(`${listId}-${activeId}`);
    if (!list || !el) return;
    // an option's row carries its group's header, so that stays in view too
    // (a departures board row is just itself); only the list scrolls, never
    // the panel around it
    const li = el.closest("li");
    const row = li && !li.classList.contains("em-palette-board") ? li : el;
    const lr = list.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    const pad = 8;
    if (rr.top < lr.top + pad) list.scrollTop -= lr.top + pad - rr.top;
    else if (rr.bottom > lr.bottom - pad) list.scrollTop += rr.bottom - (lr.bottom - pad);
  }, [active, activeId, listId]);
  // a new query starts the list from the top
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      byKey.current = true;
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      byKey.current = true;
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) run(c);
    }
  };

  const rows = results.slice(nBoard).map((c, k) => {
    const i = k + nBoard;
    return { c, i, header: k === 0 || results[i - 1].group !== c.group ? c.group : null };
  });
  const value = useMemo(() => ({ open, close, isOpen: visible }), [open, close, visible]);
  // the highlighted result's preview pane (typed queries, wide screens: the boards fill an empty one)
  const typed = !showBoard && query.trim().length > 0;
  const preview = typed ? results[active]?.preview : undefined;

  return (
    <PaletteCtx.Provider value={value}>
      {children}
      <dialog
        ref={dialogRef}
        className="em-palette"
        data-visible={visible || undefined}
        aria-label="Command palette"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onPointerDown={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <m.div
          className="em-palette-panel"
          data-typed={typed || undefined}
          initial={false}
          animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
          // in on a spring, out quickly: a chosen command shouldn't wait
          transition={visible ? spring.snappy : { duration: 0.14, ease: [0.4, 0, 1, 1] }}
          onAnimationComplete={() => {
            if (!visibleRef.current && dialogRef.current?.open) finish();
          }}
        >
          <div className="em-palette-field">
            <span className="em-palette-prompt" aria-hidden>
              ❯
            </span>
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder={narrow && placeholderShort ? placeholderShort : placeholder}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="go"
            />
            <kbd className="em-palette-esc">esc</kbd>
            {cancel && (
              <button type="button" className="em-palette-cancel" onClick={close}>
                {cancel}
              </button>
            )}
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="em-palette-list" data-lenis-prevent>
            {results.length === 0 && <li className="em-palette-empty">{empty}</li>}
            {showBoard && board && departCmds.length > 0 && (
              <li role="presentation" className="em-palette-board">
                <DeparturesBoard
                  title={board.title}
                  code={board.code}
                  clock={board.clock}
                  rows={departCmds.map((c) => ({ ...c.board!, id: c.id, label: c.label }))}
                  active={active < departCmds.length ? active : -1}
                  reduced={reduced}
                  optionId={(r) => `${listId}-${r.id}`}
                  onHover={(i) => setActive(i)}
                  onPick={(i) => run(departCmds[i])}
                />
              </li>
            )}
            {showBoard && board && arriveCmds.length > 0 && (
              <li role="presentation" className="em-palette-board em-palette-board--arrivals">
                <DeparturesBoard
                  title={arrivals ?? "ARRIVALS"}
                  code={board.code}
                  clock=""
                  rows={arriveCmds.map((c) => ({ ...c.board!, id: c.id, label: c.label }))}
                  active={active >= departCmds.length && active < nBoard ? active - departCmds.length : -1}
                  reduced={reduced}
                  optionId={(r) => `${listId}-${r.id}`}
                  onHover={(i) => setActive(departCmds.length + i)}
                  onPick={(i) => run(arriveCmds[i])}
                />
              </li>
            )}
            {rows.map(({ c, i, header }) => {
              return (
                <li key={c.id} role="presentation">
                  {header && <div className="em-palette-group">{header}</div>}
                  <div
                    id={`${listId}-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    className="em-palette-option"
                    onPointerMove={() => setActive(i)}
                    onClick={c.option ? undefined : () => run(c)}
                    data-custom={c.option ? "" : undefined}
                  >
                    {c.option ? (
                      <>
                        <span className="sr-only">{c.label}</span>
                        <c.option active={i === active} launching={launching === c.id} post={() => runNow(c)} />
                      </>
                    ) : (
                      <>
                        {i === active && (
                          <m.span layoutId={`${listId}-hl`} className="em-palette-hl" transition={spring.snappy} />
                        )}
                        <span className="em-palette-icon" data-thumb={c.thumb ? "" : undefined} aria-hidden>
                          {c.thumb ?? c.icon}
                        </span>
                        <span className="em-palette-label">{c.label}</span>
                        {c.hint && <span className="em-palette-hint">{c.hint}</span>}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {typed && (
            <aside className="em-palette-preview" aria-hidden data-empty={preview ? undefined : ""}>
              {preview ? (
                <>
                  {preview.art && <div className="em-palette-preview-art">{preview.art}</div>}
                  <p className="em-palette-preview-title">{preview.title}</p>
                  {preview.meta && <p className="em-palette-preview-meta">{preview.meta}</p>}
                  {preview.body && <p className="em-palette-preview-body">{preview.body}</p>}
                </>
              ) : (
                <span className="em-palette-preview-none">❯</span>
              )}
            </aside>
          )}
          <div className="em-palette-foot" aria-hidden>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> select
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>esc</kbd> close
            </span>
            <span className="em-palette-count">{results.length}</span>
          </div>
        </m.div>
      </dialog>
    </PaletteCtx.Provider>
  );
}

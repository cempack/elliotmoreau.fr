"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { useSound } from "@/lib/sound";
import { lenisRef } from "@/lib/lenisRef";
import { spring } from "@/lib/motion";
import { claimSurface } from "@/components/os/surface";

export type Command = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
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
 * Spotlight-style launcher on a native modal <dialog> (top layer: no
 * containing-block traps, inert page, Esc for free). ⌘K / Ctrl+K or "/"
 * opens it; ARIA combobox + listbox; springs in from just above, and
 * leaves the way it came before the dialog actually closes.
 * Theme it with the --pal-* custom properties on any ancestor.
 */
export function CommandPalette({
  commands,
  placeholder = "Type a command or search…",
  empty = "Nothing found",
  children,
}: {
  commands: Command[];
  placeholder?: string;
  empty?: string;
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

  const results = useMemo(() => {
    const scored = commands.map((c) => ({ c, s: score(c, query) })).filter((r) => r.s > 0);
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

  const open = useCallback(() => {
    const d = dialogRef.current;
    if (!d || visibleRef.current) return;
    if (!d.open) d.showModal();
    visibleRef.current = true;
    setVisible(true);
    setQuery("");
    setActive(0);
    lenisRef.current?.stop();
    blip("open");
    claimSurface("palette");
    requestAnimationFrame(() => inputRef.current?.focus());
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
    pending.current = c;
    close();
    // safety net in case the exit animation never reports back
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(finish, 320);
  };
  useEffect(() => () => window.clearTimeout(pendingTimer.current), []);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) run(c);
    }
  };

  const rows = results.map((c, i) => ({
    c,
    i,
    header: i === 0 || results[i - 1].group !== c.group ? c.group : null,
  }));
  const value = useMemo(() => ({ open, close, isOpen: visible }), [open, close, visible]);

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
          initial={false}
          animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
          // in on a spring, out quickly: a chosen command shouldn't wait
          transition={visible ? spring.snappy : { duration: 0.14, ease: [0.4, 0, 1, 1] }}
          onAnimationComplete={() => {
            if (!visibleRef.current && dialogRef.current?.open) finish();
          }}
        >
          <div className="em-palette-field">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
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
              placeholder={placeholder}
              spellCheck={false}
              autoComplete="off"
            />
            <kbd>esc</kbd>
          </div>
          <ul id={listId} role="listbox" className="em-palette-list" data-lenis-prevent>
            {results.length === 0 && <li className="em-palette-empty">{empty}</li>}
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
                    onClick={() => run(c)}
                  >
                    {i === active && (
                      <m.span layoutId={`${listId}-hl`} className="em-palette-hl" transition={spring.snappy} />
                    )}
                    <span className="em-palette-label">{c.label}</span>
                    {c.hint && <span className="em-palette-hint">{c.hint}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </m.div>
      </dialog>
    </PaletteCtx.Provider>
  );
}

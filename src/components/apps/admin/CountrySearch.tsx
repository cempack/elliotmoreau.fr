"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Country } from "./countries";
import { findCountries } from "./findCountry";

type Place = { left: number; width: number; top?: number; bottom?: number; maxH: number };

const EDGE = 8;
const GAP = 6;

/**
 * Type a country, pick it, and the place fills itself in. An editable
 * combobox with a list (the APG's list autocomplete, first suggestion
 * active): focus stays in the field, the arrows move through the
 * suggestions, Enter picks, Esc closes then clears. The list is the
 * admin dropdown's (lib Picker), portalled under the field, above it
 * when there's no room.
 */
export function CountrySearch({
  id,
  describedBy,
  lang,
  placeholder,
  none,
  filled,
  onPick,
  tag,
}: {
  id: string;
  describedBy?: string;
  lang: "en" | "fr";
  placeholder: string;
  /** shown when nothing matches */
  none: string;
  /** read out after a pick, with {name} */
  filled: (name: string) => string;
  onPick: (c: Country) => void;
  /** a short note beside a suggestion ("On the Atlas") */
  tag?: (c: Country) => string | undefined;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const [said, setSaid] = useState("");
  const hits = useMemo(() => findCountries(query, lang), [query, lang]);
  const pos = open && query.trim() ? place : null;

  const measure = (rows: number): Place | null => {
    const el = input.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const want = Math.min(Math.max(rows, 1) * 36 + 12, 320);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < Math.min(want, 180) && above > below;
    const maxH = Math.max(96, Math.min(want, up ? above : below));
    const width = Math.min(Math.max(r.width, 220), window.innerWidth - 2 * EDGE);
    const left = Math.min(Math.max(EDGE, r.left), window.innerWidth - EDGE - width);
    return up ? { left, width, bottom: vh - r.top + GAP, maxH } : { left, width, top: r.bottom + GAP, maxH };
  };

  const show = (q: string) => {
    setPlace(measure(findCountries(q, lang).length));
    setOpen(true);
  };

  const pick = (c: Country | undefined) => {
    if (!c) return;
    onPick(c);
    setQuery("");
    setOpen(false);
    setSaid(filled(lang === "fr" ? c[2] : c[1]));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = hits.length;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!open) {
          if (query.trim()) show(query);
          return;
        }
        if (n) setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      case "Enter":
        if (open && n) {
          e.preventDefault();
          pick(hits[Math.min(active, n - 1)]);
        }
        return;
      case "Escape":
        if (open || query) {
          // the window keeps its Esc for when there's nothing left here to dismiss
          e.preventDefault();
          e.stopPropagation();
          if (open) setOpen(false);
          else setQuery("");
        }
        return;
      case "Tab":
        setOpen(false);
        return;
    }
  };

  // the active suggestion stays in view as the arrows move it
  useLayoutEffect(() => {
    if (!pos) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [pos, active]);

  // a press elsewhere, a scroll behind it or the window changing size: it closes
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => t instanceof Node && (input.current?.contains(t) || list.current?.contains(t));
    const down = (e: PointerEvent) => !inside(e.target) && setOpen(false);
    const scroll = (e: Event) => !inside(e.target) && setOpen(false);
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const expanded = Boolean(pos && hits.length);
  // one polite line for the screen reader: nothing found, or what a pick filled in
  const status = pos && !hits.length ? none : said;

  return (
    <>
      <input
        ref={input}
        id={id}
        type="text"
        role="combobox"
        className="app-admin-input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded ? `${listId}-${Math.min(active, hits.length - 1)}` : undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          const q = e.target.value;
          setQuery(q);
          setActive(0);
          setSaid("");
          if (q.trim()) show(q);
          else setOpen(false);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => query.trim() && show(query)}
      />
      <span className="sr-only" role="status">
        {status}
      </span>
      {pos &&
        createPortal(
          <div
            ref={list}
            className="app-admin-picker"
            data-up={pos.bottom != null || undefined}
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
            // a press inside never takes focus off the field
            onPointerDown={(e) => e.preventDefault()}
          >
            {hits.length ? (
              <ul id={listId} role="listbox" aria-labelledby={id} className="app-admin-picker-list">
                {hits.map((c, i) => {
                  const note = tag?.(c);
                  return (
                    <li
                      key={c[0]}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      data-i={i}
                      data-active={i === active || undefined}
                      className="app-admin-picker-opt"
                      onPointerMove={() => i !== active && setActive(i)}
                      onClick={() => pick(c)}
                    >
                      <span className="app-admin-picker-label">
                        {lang === "fr" ? c[2] : c[1]}
                        {note && <span className="app-admin-picker-note"> · {note}</span>}
                      </span>
                      <span className="app-admin-picker-code" aria-hidden>
                        {c[0]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="app-admin-picker-none" aria-hidden>
                {none}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

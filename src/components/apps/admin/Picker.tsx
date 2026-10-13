"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelGlyph, type Cells } from "@/components/glyphs";

/** the right-click menu's pixel check, for the chosen option */
const G_CHECK: Cells = [
  [6, 1],
  [5, 2],
  [0, 3],
  [4, 3],
  [1, 4],
  [3, 4],
  [2, 5],
];

type Opt<T> = { value: T; label: string };
type Place = { left: number; width: number; top?: number; bottom?: number; maxH: number };

/** room kept between the list and the screen's edges */
const EDGE = 8;
const GAP = 6;

/**
 * The admin's dropdown: a button showing the choice, and a list in the
 * right-click menu's material that opens under it (above when there's no
 * room), never the browser's own popup (white on some systems, unreadable
 * with the panel's colours). The select-only combobox pattern: focus stays
 * on the button, the list is its active descendant. Arrows, Home/End,
 * Page Up/Down, type to jump, Enter or Space picks, Esc closes; closed,
 * the arrows and letters change the choice in place, as a native select.
 */
export function Picker<T extends string>({
  id,
  value,
  options,
  onChange,
  describedBy,
  invalid,
}: {
  id: string;
  value: T;
  options: readonly Opt<T>[];
  onChange: (v: T) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const listId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const current = options.findIndex((o) => o.value === value);
  const shown = current >= 0 ? options[current].label : (options[0]?.label ?? "");

  const measure = (): Place | null => {
    const b = btn.current;
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const vh = window.innerHeight;
    const want = Math.min(options.length * 36 + 12, 320);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < Math.min(want, 180) && above > below;
    const maxH = Math.max(96, Math.min(want, up ? above : below));
    const width = Math.min(Math.max(r.width, 200), window.innerWidth - 2 * EDGE);
    const left = Math.min(Math.max(EDGE, r.left), window.innerWidth - EDGE - width);
    return up ? { left, width, bottom: vh - r.top + GAP, maxH } : { left, width, top: r.bottom + GAP, maxH };
  };

  const show = () => {
    const p = measure();
    if (!p) return;
    setPlace(p);
    setActive(current >= 0 ? current : 0);
    setOpen(true);
  };
  const hide = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus({ preventScroll: true });
  };
  const pick = (i: number) => {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    hide();
  };

  /** the next option whose label starts with what was typed (letters within a second add up) */
  const seek = (key: string, from: number, now: number) => {
    const t = typed.current;
    t.text = now - t.at < 900 ? t.text + key.toLowerCase() : key.toLowerCase();
    t.at = now;
    const n = options.length;
    const start = t.text.length > 1 ? from : from + 1;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (options[i].label.toLowerCase().startsWith(t.text)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const n = options.length;
    if (!n) return;
    const typing = e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (e.altKey || e.key === "Enter" || e.key === " ") return show();
        // closed: the arrows step through the choices in place, like a native select
        const next = Math.min(n - 1, Math.max(0, (current < 0 ? 0 : current) + (e.key === "ArrowDown" ? 1 : -1)));
        if (next !== current) onChange(options[next].value);
        return;
      }
      if (typing) {
        const i = seek(e.key, current < 0 ? -1 : current, e.timeStamp);
        if (i >= 0 && i !== current) onChange(options[i].value);
      }
      return;
    }
    const to = (i: number) => {
      e.preventDefault();
      setActive(Math.min(n - 1, Math.max(0, i)));
    };
    switch (e.key) {
      case "ArrowDown":
        return to(active + 1);
      case "ArrowUp":
        if (e.altKey) {
          e.preventDefault();
          return pick(active);
        }
        return to(active - 1);
      case "Home":
        return to(0);
      case "End":
        return to(n - 1);
      case "PageDown":
        return to(active + 8);
      case "PageUp":
        return to(active - 8);
      case "Enter":
      case " ":
        e.preventDefault();
        return pick(active);
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        return hide();
      case "Tab":
        return hide(false);
    }
    if (typing) {
      const i = seek(e.key, active, e.timeStamp);
      if (i >= 0) setActive(i);
    }
  };

  // the active option stays in view as the keys move it
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // a press elsewhere, a scroll behind it or the window changing size: it closes, as a native select does
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => t instanceof Node && (btn.current?.contains(t) || list.current?.contains(t));
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

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        className="app-admin-input app-admin-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        data-open={open || undefined}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
      >
        <span className="app-admin-select-value">{shown}</span>
        <svg className="app-admin-select-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
          <path d="M2 3.75 5 6.75l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            className="app-admin-picker"
            data-up={place.bottom != null || undefined}
            style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxH }}
            // a press inside never takes focus off the button
            onPointerDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                data-i={i}
                data-active={i === active || undefined}
                className="app-admin-picker-opt"
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => pick(i)}
              >
                <span className="app-admin-picker-check" aria-hidden>
                  {i === current && <PixelGlyph cells={G_CHECK} size={11} />}
                </span>
                <span className="app-admin-picker-label">{o.label}</span>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}

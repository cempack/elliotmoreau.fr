"use client";

import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import type { PlaceRow } from "@/lib/content";
import { distanceKm } from "./geo";
import { useAtlas } from "./useAtlas";
import { useKm } from "./fmt";

/**
 * Been (home first, marked) and Next, as one single-select listbox with
 * two labelled groups, so a screen reader announces "option, selected, 3
 * of 10" and the arrow keys it implies: one tab stop (the selected option,
 * roving tabindex), then ↑/↓ move the selection (and the globe with it),
 * Home/End jump to the ends. The active row carries a thumb that springs
 * between rows.
 */
export function PlacesList({
  selectedId,
  onSelect,
  thumbId,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  /** layoutId for the selection thumb, also the prefix of the group
      label ids (unique per mounted list) */
  thumbId: string;
}) {
  const { t, lang } = useI18n();
  const a = t.atlas;
  const fmt = useKm();
  const { home, been, next } = useAtlas();

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-place]"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    e.preventDefault();
    const to =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[to].focus();
    const id = items[to].dataset.place;
    if (id) onSelect(id);
  };

  const row = (p: PlaceRow) => {
    const active = p.id === selectedId;
    const tone = p.home ? "home" : p.status;
    return (
      <li key={p.id} role="none">
        <button
          type="button"
          role="option"
          data-place={p.id}
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          data-active={active || undefined}
          className="app-atlas-row"
          onClick={() => onSelect(p.id)}
        >
          {active && <m.span layoutId={thumbId} className="app-atlas-row-thumb" transition={spring.snappy} aria-hidden />}
          <span className="app-atlas-mark" data-tone={tone} aria-hidden />
          <span className="app-atlas-row-name">{p.name[lang]}</span>
          {p.home ? (
            <span className="app-atlas-row-home">{a.status.home}</span>
          ) : (
            <span className="app-atlas-row-km tabular">
              {fmt(distanceKm(home, p))}
              <span className="app-atlas-row-unit">{"\u00a0"}{a.km}</span>
            </span>
          )}
        </button>
      </li>
    );
  };

  const group = (key: "been" | "next", places: PlaceRow[]) => (
    <div role="group" aria-labelledby={`${thumbId}-${key}`} className="app-atlas-places-group">
      <p id={`${thumbId}-${key}`} className="app-atlas-places-h" role="presentation">
        <span>{a[key]}</span>
        <span className="app-atlas-places-n tabular" aria-hidden>
          {places.length}
        </span>
      </p>
      <ul className="app-atlas-places-list" role="none">
        {places.map(row)}
      </ul>
    </div>
  );

  return (
    <div className="app-atlas-places" role="listbox" aria-label={a.placesLabel} onKeyDown={onKeyDown}>
      {group("been", been)}
      {group("next", next)}
    </div>
  );
}

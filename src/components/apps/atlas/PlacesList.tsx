"use client";

import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { HOME, type Place } from "@/lib/places";
import { BEEN, NEXT, distanceKm } from "./geo";
import { useKm } from "./fmt";

/**
 * Been (home first, marked) and Next, as one keyboard path: a single tab
 * stop (the selected row, roving tabindex), then ↑/↓ move the selection
 * (and the globe with it), Home/End jump to the ends. The active row
 * carries a thumb that springs between rows.
 */
export function PlacesList({
  selectedId,
  onSelect,
  thumbId,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  /** layoutId for the selection thumb (unique per mounted list) */
  thumbId: string;
}) {
  const { t, lang } = useI18n();
  const a = t.atlas;
  const fmt = useKm();
  const been = [...BEEN.filter((p) => p.home), ...BEEN.filter((p) => !p.home)];

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

  const row = (p: Place) => {
    const active = p.id === selectedId;
    const tone = p.home ? "home" : p.status;
    return (
      <li key={p.id}>
        <button
          type="button"
          data-place={p.id}
          aria-pressed={active}
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
              {fmt(distanceKm(HOME, p))}
              <span className="app-atlas-row-unit"> {a.km}</span>
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <nav className="app-atlas-places" aria-label={a.placesLabel} onKeyDown={onKeyDown}>
      <h2 className="app-atlas-places-h">
        <span>{a.been}</span>
        <span className="app-atlas-places-n tabular">{BEEN.length}</span>
      </h2>
      <ul className="app-atlas-places-list" role="list">
        {been.map(row)}
      </ul>
      <h2 className="app-atlas-places-h">
        <span>{a.next}</span>
        <span className="app-atlas-places-n tabular">{NEXT.length}</span>
      </h2>
      <ul className="app-atlas-places-list" role="list">
        {NEXT.map(row)}
      </ul>
    </nav>
  );
}

"use client";

import { m } from "motion/react";
import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { spring } from "@/lib/motion";
import { PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import { KindIcon } from "./KindArt";
import { plainOf, titleOf, type ProjectKind } from "./kind";

type Shelf = { kind: ProjectKind; repos: RepoInfo[] };

/**
 * The projects on their shelves (apps, games, desktop add-ons, tools),
 * each row its icon, its name and what it does in a line.
 *
 * `select` (beside the card): one single-select listbox with a labelled
 * group per shelf, one tab stop (roving tabindex), ↑/↓ move the selection,
 * Home/End jump to the ends, and a thumb springs between rows. Otherwise
 * (phones): a plain list of buttons that each open the project's sheet.
 */
export function ProjectList({
  shelves,
  selected,
  onPick,
  select,
  thumbId,
}: {
  shelves: Shelf[];
  selected: string;
  onPick: (name: string) => void;
  select: boolean;
  /** layoutId for the selection thumb, also the prefix of the group label ids */
  thumbId: string;
}) {
  const { t, lang } = useI18n();
  const w = t.work;
  const reduced = useReduced();

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!select || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-repo]"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    e.preventDefault();
    const to = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[to].focus({ preventScroll: true });
    items[to].scrollIntoView({ block: "nearest", behavior: reduced ? "instant" : "smooth" });
    const name = items[to].dataset.repo;
    if (name) onPick(name);
  };

  const row = (r: RepoInfo, kind: ProjectKind) => {
    const active = select && r.name === selected;
    return (
      <li key={r.name} role={select ? "none" : undefined}>
        <button
          type="button"
          data-repo={r.name}
          className="app-work-row"
          data-active={active || undefined}
          onClick={() => onPick(r.name)}
          {...(select ? { role: "option", "aria-selected": active, tabIndex: active ? 0 : -1 } : { "aria-haspopup": "dialog" as const })}
        >
          {active && <m.span layoutId={thumbId} className="app-work-row-thumb" transition={spring.snappy} aria-hidden />}
          <KindIcon kind={kind} />
          <span className="app-work-row-text">
            <span className="app-work-row-name">{titleOf(r)}</span>
            <span className="app-work-row-plain">{plainOf(r, lang)}</span>
          </span>
          {!select && <PixelGlyph cells={G_CHEVRON} size={9} className="app-work-row-go" />}
        </button>
      </li>
    );
  };

  return (
    <div className="app-work-list" role={select ? "listbox" : undefined} aria-label={select ? w.listLabel : undefined} onKeyDown={onKeyDown}>
      {shelves.map(({ kind, repos }) => (
        <section key={kind} role={select ? "group" : undefined} aria-labelledby={`${thumbId}-${kind}`} className="app-work-shelf">
          <h3 id={`${thumbId}-${kind}`} className="app-work-shelf-h" role={select ? "presentation" : undefined}>
            {w.kinds[kind].group}
          </h3>
          <ul className="app-work-rows" role={select ? "none" : undefined}>
            {repos.map((r) => row(r, kind))}
          </ul>
        </section>
      ))}
    </div>
  );
}

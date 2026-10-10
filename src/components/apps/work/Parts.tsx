"use client";

import type { Source } from "@/lib/data";
import { useI18n } from "@/i18n/client";
import { SOCIALS } from "@/lib/places";
import { PixelGlyph } from "@/components/glyphs";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";
import { ART_FOLDER, ART_OFFLINE, ART_SEARCH, G_ARROW, PixelArt } from "./glyphs";
import { fmt, plural } from "./model";

const INK = {
  a: "var(--color-label-3)",
  b: "var(--color-ion)",
  c: "var(--color-ember)",
  d: "var(--color-ink-600)",
};

/**
 * Finder's status bar: how many items, how many stars, and where the
 * data comes from (honest about sample data and outages). Keyboard hints
 * on devices with a keyboard-ish pointer.
 */
export function StatusBar({
  shown,
  total,
  stars,
  source,
}: {
  shown: number;
  total: number;
  stars: number;
  source: Source;
}) {
  const { t, lang } = useI18n();
  const s = t.work.status;
  const items = plural(lang, total, s.itemsOne, s.itemsOther);
  const count = shown === total ? items : fmt(s.ofTotal, { n: shown, total: items });
  return (
    <footer className="app-work-status">
      <p className="app-work-status-main" aria-live="polite">
        <span className="tabular">{count}</span>
        <span className="app-work-status-sep" aria-hidden>
          ·
        </span>
        <span className="tabular">{plural(lang, stars, s.starsOne, s.starsOther)}</span>
        <span className="app-work-status-sep" aria-hidden>
          ·
        </span>
        <span className="app-work-source" data-source={source}>
          <span className="app-work-source-dot" aria-hidden />
          {source === "live" ? s.live : source === "sample" ? s.sample : s.offline}
        </span>
      </p>
      <p className="app-work-status-keys" aria-hidden>
        <span>
          <kbd className="app-work-kbd">␣</kbd> {s.hintQuickLook}
        </span>
        <span>
          <kbd className="app-work-kbd">↑</kbd>
          <kbd className="app-work-kbd">↓</kbd> {s.hintMove}
        </span>
        <span>
          <kbd className="app-work-kbd">/</kbd> {s.hintSearch}
        </span>
      </p>
    </footer>
  );
}

type EmptyKind = "search" | "folder" | "offline";

/** The three ways the collection can be empty, each with a way forward. */
export function EmptyState({
  kind,
  query = "",
  canWiden = false,
  onClear,
  onWiden,
  onShowAll,
}: {
  kind: EmptyKind;
  query?: string;
  /** the search has hits outside the current folder */
  canWiden?: boolean;
  onClear?: () => void;
  onWiden?: () => void;
  onShowAll?: () => void;
}) {
  const { t } = useI18n();
  const e = t.work.empty;
  const shown = query.trim().length > 32 ? query.trim().slice(0, 31) + "…" : query.trim();
  const art = kind === "search" ? ART_SEARCH : kind === "folder" ? ART_FOLDER : ART_OFFLINE;
  const title = kind === "search" ? fmt(e.searchTitle, { q: shown }) : kind === "folder" ? e.folderTitle : e.offlineTitle;
  const body = kind === "search" ? e.searchBody : kind === "folder" ? e.folderBody : e.offlineBody;

  return (
    <div className="app-work-empty" role={kind === "offline" ? undefined : "status"}>
      <PixelArt rows={art} palette={INK} cell={6} className="app-work-empty-art" />
      <h2 className="app-work-empty-title">{title}</h2>
      <p className="app-work-empty-body">{body}</p>
      <div className="app-work-empty-actions">
        {kind === "search" && canWiden && (
          <PressButton className="app-work-btn app-work-btn--primary" onClick={onWiden}>
            {e.searchAll}
          </PressButton>
        )}
        {kind === "search" && (
          <PressButton className={`app-work-btn ${canWiden ? "" : "app-work-btn--primary"}`} onClick={onClear}>
            {e.clear}
          </PressButton>
        )}
        {kind === "folder" && (
          <PressButton className="app-work-btn app-work-btn--primary" onClick={onShowAll}>
            {e.showAll}
          </PressButton>
        )}
        {kind === "offline" && (
          <PressAnchor
            href={SOCIALS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="app-work-btn app-work-btn--primary"
          >
            {e.openProfile}
            <PixelGlyph cells={G_ARROW} size={9} />
          </PressAnchor>
        )}
      </div>
    </div>
  );
}

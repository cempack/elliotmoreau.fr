"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMedia } from "@/hooks/env";
import type { RepoInfo } from "@/lib/github";
import type { Source } from "@/lib/data";
import { useI18n } from "@/i18n/client";
import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import { GLYPH_STAR, PixelGlyph } from "@/components/glyphs";
import { SOCIALS } from "@/lib/places";
import { G_ALL, G_ARROW, G_CLOCK, G_HASH } from "./glyphs";
import { type Filter, fmt, langColor, languagesOf, recentNames, sameFilter, tagsOf } from "./model";

const TAGS_SHOWN = 8;

/** The nearest ancestor that scrolls vertically on its own (not the page). */
function scrollParent(el: HTMLElement | null) {
  for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}

/**
 * Finder's source list: smart folders (All, Starred, Recent), then every
 * language and the most common topics, each with a live count. Below 1024px
 * the window turns it into a horizontal chip row (WinNav does the reflow).
 */
export function Sidebar({
  repos,
  filter,
  onFilter,
  source,
}: {
  repos: RepoInfo[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  source: Source;
}) {
  const { t } = useI18n();
  const s = t.work.side;
  const [allTags, setAllTags] = useState(false);
  // the compact chip strip scrolls sideways, so it carries every tag
  const compact = useMedia("(max-width: 1023px)");

  const langs = useMemo(() => languagesOf(repos), [repos]);
  const tags = useMemo(() => tagsOf(repos), [repos]);
  const starred = useMemo(() => repos.filter((r) => r.stars > 0).length, [repos]);
  const recent = useMemo(() => recentNames(repos).size, [repos]);

  // the active tag always stays visible, even past the fold
  const shownTags = useMemo(() => {
    if (allTags || compact) return tags;
    const head = tags.slice(0, TAGS_SHOWN);
    if (filter.kind === "tag" && !head.some(([v]) => v === filter.value)) {
      const hit = tags.find(([v]) => v === filter.value);
      if (hit) head.push(hit);
    }
    return head;
  }, [tags, allTags, compact, filter]);
  const hidden = tags.length - TAGS_SHOWN;

  const is = (f: Filter) => sameFilter(filter, f);

  // a folder chosen from elsewhere (a Quick Look topic) may sit past the
  // fold of the source list: bring it into view there, without touching
  // the page scroll (the compact strip scrolls itself, see WinNavItem)
  const rootRef = useRef<HTMLDivElement>(null);
  const key = `${filter.kind}:${"value" in filter ? filter.value : ""}`;
  useEffect(() => {
    const box = scrollParent(rootRef.current);
    const item = rootRef.current?.querySelector<HTMLElement>("[aria-pressed='true'], [aria-current]");
    if (!box || !item || box.scrollHeight <= box.clientHeight + 1) return;
    const b = box.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollBy({ top: r.top - b.top - (b.height - r.height) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [key]);

  return (
    <div ref={rootRef} className="app-work-side">
      <p className="app-work-side-h" data-win-hide-compact aria-hidden>
        {s.favorites}
      </p>
      <WinNav label={s.favoritesNav} className="app-work-nav">
        <WinNavItem
          onClick={() => onFilter({ kind: "all" })}
          active={is({ kind: "all" })}
          icon={<PixelGlyph cells={G_ALL} size={11} />}
          count={repos.length}
        >
          {s.all}
        </WinNavItem>
        {starred > 0 && (
          <WinNavItem
            onClick={() => onFilter({ kind: "starred" })}
            active={is({ kind: "starred" })}
            icon={<PixelGlyph cells={GLYPH_STAR} size={12} />}
            count={starred}
          >
            {s.starred}
          </WinNavItem>
        )}
        {repos.length > 0 && (
          <WinNavItem
            onClick={() => onFilter({ kind: "recent" })}
            active={is({ kind: "recent" })}
            icon={<PixelGlyph cells={G_CLOCK} size={12} />}
            count={recent}
          >
            {s.recent}
          </WinNavItem>
        )}
      </WinNav>

      {langs.length > 0 && (
        <>
          <p className="app-work-side-h" data-win-hide-compact aria-hidden>
            {s.languages}
          </p>
          <WinNav label={s.languagesNav} className="app-work-nav">
            {langs.map(([lang, n]) => (
              <WinNavItem
                key={lang}
                onClick={() => onFilter({ kind: "lang", value: lang })}
                active={is({ kind: "lang", value: lang })}
                icon={<span className="app-work-dot" style={{ background: langColor(lang) }} />}
                count={n}
              >
                {lang}
              </WinNavItem>
            ))}
          </WinNav>
        </>
      )}

      {tags.length > 0 && (
        <>
          <p className="app-work-side-h" data-win-hide-compact aria-hidden>
            {s.tags}
          </p>
          <WinNav label={s.tagsNav} className="app-work-nav">
            {shownTags.map(([tag, n]) => (
              <WinNavItem
                key={tag}
                onClick={() => onFilter({ kind: "tag", value: tag })}
                active={is({ kind: "tag", value: tag })}
                icon={<PixelGlyph cells={G_HASH} size={11} />}
                count={n}
              >
                {tag}
              </WinNavItem>
            ))}
          </WinNav>
          {hidden > 0 && (
            <button
              type="button"
              className="app-work-side-more"
              data-win-hide-compact
              aria-expanded={allTags}
              onClick={() => setAllTags((v) => !v)}
            >
              {allTags ? s.less : fmt(s.more, { n: hidden })}
            </button>
          )}
        </>
      )}

      <div className="app-work-side-foot" data-win-hide-compact>
        <span className="app-work-source" data-source={source}>
          <span className="app-work-source-dot" aria-hidden />
          {source === "live" ? t.work.status.live : source === "sample" ? t.work.status.sample : t.work.status.offline}
        </span>
        <a
          href={SOCIALS.github}
          target="_blank"
          rel="noopener noreferrer"
          className="app-work-side-link"
          aria-label={s.profileLabel}
        >
          {s.profile}
          <PixelGlyph cells={G_ARROW} size={9} />
        </a>
      </div>
    </div>
  );
}

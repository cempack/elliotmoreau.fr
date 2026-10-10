"use client";

import { useMemo, useState } from "react";
import type { RepoInfo } from "@/lib/github";
import type { Source } from "@/lib/data";
import { useI18n } from "@/i18n/client";
import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import { GLYPH_STAR, PixelGlyph } from "@/components/glyphs";
import { SOCIALS } from "@/lib/places";
import { G_ALL, G_ARROW, G_CLOCK, G_HASH } from "./glyphs";
import { type Filter, fmt, langColor, languagesOf, recentNames, sameFilter, tagsOf } from "./model";

const TAGS_SHOWN = 8;

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

  const langs = useMemo(() => languagesOf(repos), [repos]);
  const tags = useMemo(() => tagsOf(repos), [repos]);
  const starred = useMemo(() => repos.filter((r) => r.stars > 0).length, [repos]);
  const recent = useMemo(() => recentNames(repos).size, [repos]);

  // the active tag always stays visible, even past the fold
  const shownTags = useMemo(() => {
    if (allTags) return tags;
    const head = tags.slice(0, TAGS_SHOWN);
    if (filter.kind === "tag" && !head.some(([v]) => v === filter.value)) {
      const hit = tags.find(([v]) => v === filter.value);
      if (hit) head.push(hit);
    }
    return head;
  }, [tags, allTags, filter]);
  const hidden = tags.length - TAGS_SHOWN;

  const is = (f: Filter) => sameFilter(filter, f);

  return (
    <div className="app-work-side">
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

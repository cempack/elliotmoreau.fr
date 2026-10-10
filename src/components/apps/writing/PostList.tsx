"use client";

import { useId, useMemo } from "react";
import { m } from "motion/react";
import type { GhostPost } from "@/lib/ghost";
import type { Source } from "@/lib/data";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { PixelPlanet } from "@/components/PixelPlanet";
import { byYear, countLabel, dateLong, dateShort, fmt } from "./util";

type Props = {
  posts: GhostPost[];
  selected: string | null;
  /** folder name for the header */
  title: string;
  source: Source;
  /** mouse pressed or row tapped / clicked */
  onPress: (slug: string, via: "pointer" | "click") => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** registers each option element by slug, for focus management */
  optionRef: (slug: string, el: HTMLDivElement | null) => void;
  footer?: React.ReactNode;
};

/**
 * The middle pane: posts grouped by year, as a single-select listbox with
 * a roving tab stop. The selection is a tinted slab that springs from row
 * to row (shared layout).
 */
export function PostList({ posts, selected, title, source, onPress, onKeyDown, optionRef, footer }: Props) {
  const { t } = useI18n();
  const w = t.writing;
  const id = useId();
  const groups = useMemo(() => byYear(posts), [posts]);
  const tabStop = posts.some((p) => p.slug === selected) ? selected : posts[0]?.slug;

  return (
    <div className="app-writing-listpane">
      <header className="app-writing-listhead">
        <h2 className="app-writing-listtitle" id={`${id}-title`}>
          {title}
        </h2>
        <p className="app-writing-listcount tabular">{countLabel(w, posts.length)}</p>
      </header>

      <div
        role="listbox"
        aria-labelledby={`${id}-title`}
        aria-orientation="vertical"
        className="app-writing-listbox"
        onKeyDown={onKeyDown}
      >
        {groups.map((g) => (
          <div role="group" aria-labelledby={`${id}-y${g.year}`} key={g.year} className="app-writing-group">
            <div id={`${id}-y${g.year}`} className="app-writing-year tabular">
              {g.year}
            </div>
            {g.posts.map((p) => {
              const on = p.slug === selected;
              return (
                <div
                  key={p.slug}
                  ref={(el) => optionRef(p.slug, el)}
                  role="option"
                  aria-selected={on}
                  aria-label={`${p.title}, ${dateLong(w, p.published_at)}, ${fmt(w.minRead, { n: p.reading_time })}`}
                  tabIndex={p.slug === tabStop ? 0 : -1}
                  data-selected={on || undefined}
                  data-slug={p.slug}
                  className="app-writing-row"
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" && e.button === 0) onPress(p.slug, "pointer");
                  }}
                  onClick={() => onPress(p.slug, "click")}
                >
                  {on && <m.span layoutId="app-writing-row-thumb" className="app-writing-row-thumb" transition={spring.snappy} aria-hidden />}
                  <span className="app-writing-row-text" aria-hidden>
                    <span className="app-writing-row-meta tabular">
                      <time dateTime={p.published_at}>{dateShort(w, p.published_at)}</time>
                      <span className="app-writing-dot" />
                      <span>{fmt(w.minShort, { n: p.reading_time })}</span>
                    </span>
                    <span className="app-writing-row-title">{p.title}</span>
                    {p.excerpt && <span className="app-writing-row-excerpt">{p.excerpt}</span>}
                  </span>
                  <span className="app-writing-row-art" aria-hidden>
                    <PixelPlanet seed={p.slug} className="app-writing-row-planet" />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <footer className="app-writing-listfoot">
        <p className="app-writing-source" data-source={source}>
          <span className="app-writing-source-dot" aria-hidden />
          {source === "live" ? w.sourceLive : w.sourceSample}
        </p>
        <p className="app-writing-keys" aria-hidden>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {w.keysHint}
        </p>
      </footer>
      {footer}
    </div>
  );
}

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
  /** phones: a list of links that push the reader, not a listbox */
  compact: boolean;
  /** `?p=` link for a post, so rows can be opened in a new tab or copied */
  hrefFor: (slug: string) => string;
  /** mouse pressed, or row tapped / clicked */
  onPress: (slug: string, via: "pointer" | "click") => void;
  /** a finger came down on a row (it may become a tap) */
  onPrime?: (slug: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  /** registers each row element by slug, for focus management */
  optionRef: (slug: string, el: HTMLElement | null) => void;
  /** folder chips, under the large title */
  chips?: React.ReactNode;
  footer?: React.ReactNode;
};

const modified = (e: React.MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/**
 * The middle pane: posts grouped by year. On ≥768 a single-select listbox
 * with a roving tab stop, the selection a tinted slab that springs from
 * row to row (shared layout). On phones, where a row is a way into the
 * reader and nothing stays selected, a plain list of links.
 */
export function PostList({ posts, selected, title, source, compact, hrefFor, onPress, onPrime, onKeyDown, optionRef, chips, footer }: Props) {
  const { t } = useI18n();
  const w = t.writing;
  const id = useId();
  const groups = useMemo(() => byYear(posts), [posts]);
  const tabStop = posts.some((p) => p.slug === selected) ? selected : posts[0]?.slug;
  const label = (p: GhostPost) => `${p.title}, ${dateLong(w, p.published_at)}, ${fmt(w.minRead, { n: p.reading_time })}`;

  const body = (p: GhostPost) => (
    <>
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
    </>
  );

  return (
    <div className="app-writing-listpane">
      <header className="app-writing-listhead">
        <h2 className="app-writing-listtitle" id={`${id}-title`}>
          {title}
        </h2>
        <p className="app-writing-listcount tabular">{countLabel(w, posts.length)}</p>
        {groups[0] && (
          <p className="app-writing-listyear tabular" aria-hidden>
            {groups[0].year}
          </p>
        )}
      </header>
      {chips}

      {compact ? (
        <div className="app-writing-listbox">
          {groups.map((g) => (
            <div key={g.year} className="app-writing-group">
              <h3 id={`${id}-y${g.year}`} className="app-writing-year tabular">
                {g.year}
              </h3>
              <ul role="list" className="app-writing-rows">
                {g.posts.map((p) => (
                  <li key={p.slug}>
                    <a
                      ref={(el) => optionRef(p.slug, el)}
                      href={hrefFor(p.slug)}
                      aria-label={label(p)}
                      data-slug={p.slug}
                      className="app-writing-row"
                      onPointerDown={(e) => {
                        if (e.pointerType !== "mouse") onPrime?.(p.slug);
                      }}
                      onClick={(e) => {
                        if (modified(e)) return;
                        e.preventDefault();
                        onPress(p.slug, "click");
                      }}
                    >
                      {body(p)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
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
                    aria-label={label(p)}
                    tabIndex={p.slug === tabStop ? 0 : -1}
                    data-selected={on || undefined}
                    data-slug={p.slug}
                    className="app-writing-row"
                    onPointerDown={(e) => {
                      if (e.pointerType === "mouse" && e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey)) onPress(p.slug, "pointer");
                    }}
                    onClick={(e) => {
                      if (modified(e)) return;
                      onPress(p.slug, "click");
                    }}
                  >
                    {on && <m.span layoutId="app-writing-row-thumb" className="app-writing-row-thumb" transition={spring.snappy} aria-hidden />}
                    {body(p)}
                    {/* for the mouse only: ⌘/middle-click, "open in new tab", "copy link" */}
                    <a
                      href={hrefFor(p.slug)}
                      tabIndex={-1}
                      aria-hidden
                      className="app-writing-row-link"
                      draggable={false}
                      onClick={(e) => {
                        if (!modified(e)) e.preventDefault();
                        else e.stopPropagation();
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <footer className="app-writing-listfoot">
        <p className="app-writing-source" data-source={source}>
          <span className="app-writing-source-dot" aria-hidden />
          {source === "live" ? w.sourceLive : w.sourceSample}
        </p>
        <p className="app-writing-keys" aria-hidden>
          <span className="app-writing-key">
            <kbd>↑</kbd>
            <kbd>↓</kbd> {w.keysHint}
          </span>
          <span className="app-writing-key">
            <kbd>←</kbd>
            <kbd>→</kbd> {w.keysTurn}
          </span>
        </p>
      </footer>
      {footer}
    </div>
  );
}

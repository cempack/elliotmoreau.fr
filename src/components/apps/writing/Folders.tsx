"use client";

import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { PixelGlyph } from "@/components/glyphs";
import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import type { GhostPost } from "@/lib/ghost";
import { SubscribeForm } from "./SubscribeForm";
import { G_ALL, G_FOLDER, G_MAIL, G_RSS } from "./glyphs";
import { BLOG_URL, RSS_URL, fmt, type Folder } from "./util";

type Props = {
  folders: Folder[];
  /** active tag slug, null = all */
  active: string | null;
  total: number;
  onPick: (slug: string | null) => void;
  /** every post, for the archive calendar */
  posts?: GhostPost[];
};

/**
 * Wide windows (≥1280): the folders as a source list, the first of three
 * columns, with the feeds at its foot. Narrower, the reader needs that
 * width more, so the folders become chips in the list column instead.
 */
export function FolderColumn({ folders, active, total, onPick, posts = [] }: Props) {
  const { t } = useI18n();
  const w = t.writing;
  return (
    <aside className="app-writing-pane app-writing-pane--folders" aria-label={w.folders} data-lenis-prevent>
      <div className="app-writing-side">
        <p className="app-writing-side-k" aria-hidden>
          {w.folders}
        </p>
        <WinNav label={w.foldersLabel}>
          <WinNavItem onClick={() => onPick(null)} active={active === null} icon={<PixelGlyph cells={G_ALL} size={14} />} count={total}>
            {w.all}
          </WinNavItem>
          {folders.map((f) => (
            <WinNavItem
              key={f.slug}
              onClick={() => onPick(f.slug)}
              active={active === f.slug}
              icon={<PixelGlyph cells={G_FOLDER} size={14} />}
              count={f.count}
            >
              {f.name}
            </WinNavItem>
          ))}
        </WinNav>
        {posts.length > 0 && <Archive posts={posts} />}
        <FeedLinks className="app-writing-feeds--side" />
      </div>
    </aside>
  );
}

/**
 * The archive as a pixel calendar: a row of twelve months per year, each
 * cell lit by how many posts came out that month, then the reading time
 * all of it adds up to.
 */
function Archive({ posts }: { posts: GhostPost[] }) {
  const { t, lang } = useI18n();
  const w = t.writing;
  const byYear = new Map<number, number[]>();
  let minutes = 0;
  for (const p of posts) {
    const d = new Date(p.published_at);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    const months = byYear.get(y) ?? new Array(12).fill(0);
    months[d.getUTCMonth()]++;
    byYear.set(y, months);
    minutes += Math.max(1, p.reading_time || 1);
  }
  const years = [...byYear].sort((a, b) => b[0] - a[0]).slice(0, 3);
  const monthName = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { month: "long", timeZone: "UTC" });
  return (
    <section className="app-writing-archive" aria-label={w.archive}>
      <p className="app-writing-side-k">{w.archive}</p>
      {years.map(([y, months]) => (
        <div key={y} className="app-writing-archive-year">
          <span className="app-writing-archive-y tabular">{y}</span>
          <ol className="app-writing-archive-months">
            {months.map((n, m) => (
              <li
                key={m}
                data-n={Math.min(2, n) || undefined}
                title={`${monthName.format(new Date(Date.UTC(y, m, 1)))} ${y} · ${fmt(n === 1 ? w.countOne : w.countOther, { n })}`}
              >
                <span className="sr-only">{`${monthName.format(new Date(Date.UTC(y, m, 1)))}: ${fmt(n === 1 ? w.countOne : w.countOther, { n })}`}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="app-writing-archive-legend" aria-hidden>
        {w.monthInitials.map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </p>
      <p className="app-writing-archive-sum tabular">{fmt(w.readingTotal, { n: minutes })}</p>
    </section>
  );
}

/** RSS and the blog itself: the quiet ways to follow along. */
export function FeedLinks({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const w = t.writing;
  return (
    <p className={`app-writing-news-links ${className}`}>
      <a href={RSS_URL} target="_blank" rel="noopener" className="app-writing-news-link">
        <PixelGlyph cells={G_RSS} size={12} />
        {w.rss}
      </a>
      <a href={BLOG_URL} target="_blank" rel="noopener" className="app-writing-news-link" aria-label={w.openBlog}>
        {w.blog}
        <span aria-hidden>↗</span>
      </a>
    </p>
  );
}

/** Phones (the list screen) and the empty state: the newsletter card. */
export function Newsletter({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const w = t.writing;
  return (
    <section className={`app-writing-news ${className}`}>
      <h2 className="app-writing-news-title">
        <PixelGlyph cells={G_MAIL} size={14} className="app-writing-news-glyph" />
        {w.newsTitle}
      </h2>
      <p className="app-writing-news-body">{w.newsBody}</p>
      <SubscribeForm />
      <FeedLinks />
    </section>
  );
}

/** Below 1280: the folders as a scrollable chip row under the list's title. */
export function FolderChips({ folders, active, total, onPick }: Props) {
  const { t } = useI18n();
  const w = t.writing;
  const rowRef = useRef<HTMLUListElement>(null);

  // keep the active chip in view
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>("[data-active]");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const a = chip.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    if (a.left >= b.left + 12 && a.right <= b.right - 12) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  const items: { slug: string | null; name: string; count: number }[] = [{ slug: null, name: w.all, count: total }, ...folders];
  return (
    <nav aria-label={w.foldersLabel} className="app-writing-chips">
      <ul ref={rowRef} className="app-writing-chips-row" data-lenis-prevent>
        {items.map((f) => {
          const on = active === f.slug;
          return (
            <li key={f.slug ?? "*"}>
              <button
                type="button"
                className="app-writing-chip"
                aria-pressed={on}
                data-active={on || undefined}
                onClick={() => onPick(f.slug)}
              >
                {on && <m.span layoutId="app-writing-chip-thumb" className="app-writing-chip-thumb" transition={spring.snappy} aria-hidden />}
                <span className="app-writing-chip-label">{f.name}</span>
                <span className="app-writing-chip-count tabular">{f.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

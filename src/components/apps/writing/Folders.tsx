"use client";

import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { PixelGlyph } from "@/components/glyphs";
import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import { SubscribeForm } from "./SubscribeForm";
import { G_ALL, G_FOLDER, G_MAIL, G_RSS } from "./glyphs";
import { BLOG_URL, RSS_URL, type Folder } from "./util";

type Props = {
  folders: Folder[];
  /** active tag slug, null = all */
  active: string | null;
  total: number;
  onPick: (slug: string | null) => void;
};

/** The AppWindow sidebar: folders by tag, then the newsletter. */
export function Folders({ folders, active, total, onPick }: Props) {
  const { t } = useI18n();
  const w = t.writing;
  return (
    <div className="app-writing-side">
      <p className="app-writing-side-k" data-win-hide-compact aria-hidden>
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
      <Newsletter className="app-writing-news--side" hideCompact />
    </div>
  );
}

export function Newsletter({ className = "", hideCompact = false }: { className?: string; hideCompact?: boolean }) {
  const { t } = useI18n();
  const w = t.writing;
  return (
    <section className={`app-writing-news ${className}`} data-win-hide-compact={hideCompact || undefined}>
      <h2 className="app-writing-news-title">
        <PixelGlyph cells={G_MAIL} size={14} className="app-writing-news-glyph" />
        {w.newsTitle}
      </h2>
      <p className="app-writing-news-body">{w.newsBody}</p>
      <SubscribeForm />
      <p className="app-writing-news-links">
        <a href={RSS_URL} target="_blank" rel="noopener" className="app-writing-news-link">
          <PixelGlyph cells={G_RSS} size={12} />
          {w.rss}
        </a>
        <a href={BLOG_URL} target="_blank" rel="noopener" className="app-writing-news-link" aria-label={w.openBlog}>
          {w.blog}
          <span aria-hidden>↗</span>
        </a>
      </p>
    </section>
  );
}

/** Phones: the folders as a scrollable chip row at the top of the list screen. */
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
    row.scrollBy({ left: a.left - b.left - (b.width - a.width) / 2, behavior: "smooth" });
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

"use client";

import Link from "next/link";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import type { GhostPost } from "@/lib/ghost";
import { NOW, loc } from "@/content/now";
import { G_ARROW, G_NEXT } from "../bits";
import { fill } from "../lib";

const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.elliotmoreau.fr";

/** Drafts in progress (hand-written), then the latest published post (live). */
export function Writing({ posts }: { posts: GhostPost[] }) {
  const { t, lang, path } = useI18n();
  const w = t.now.writing;
  const mounted = useHydrated();
  const latest = posts[0];

  return (
    <div className="app-now-write">
      {NOW.drafting.length > 0 && (
        <div>
          <h3 className="app-now-label">{w.drafting}</h3>
          <ul className="app-now-drafts">
            {NOW.drafting.map((d) => (
              <li key={d.title.en}>
                {/* the section label says "drafting"; a dashed, unfinished pixel marks each */}
                <span className="app-now-draft-title">{loc(d.title, lang)}</span>
                {d.note && <span className="app-now-draft-note">{loc(d.note, lang)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="app-now-write-latest">
        <h3 className="app-now-label">{w.latest}</h3>
        {latest ? (
          <a
            href={latest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-post"
            aria-label={fill(w.read, { title: latest.title })}
          >
            <span className="app-now-post-title">{latest.title}</span>
            {latest.excerpt && <span className="app-now-post-excerpt">{latest.excerpt}</span>}
            <span className="app-now-post-meta tabular">
              {mounted ? timeAgo(latest.published_at, lang) : " "}
              {latest.reading_time ? ` · ${fill(w.minutes, { n: latest.reading_time })}` : ""}
            </span>
          </a>
        ) : (
          <a href={BLOG_URL} target="_blank" rel="noopener noreferrer" className="app-now-link">
            {w.none} {w.blog}
            <PixelGlyph cells={G_ARROW} size={8} />
          </a>
        )}
      </div>

      <Link href={path("/writing")} transitionTypes={["app-open"]} className="app-now-more">
        {w.all}
        <PixelGlyph cells={G_NEXT} size={10} />
      </Link>
    </div>
  );
}

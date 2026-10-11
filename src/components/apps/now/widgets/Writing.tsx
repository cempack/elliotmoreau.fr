"use client";

import Link from "next/link";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import type { GhostPost } from "@/lib/ghost";
import { NOW, loc } from "@/content/now";
import { PlateThumb } from "@/components/apps/writing/PlateThumb";
import { plateSeed } from "@/components/apps/writing/plate";
import { G_ARROW, G_NEXT } from "../bits";
import { fill, useNow } from "../lib";

const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.elliotmoreau.fr";

/** posts per month for the 12 months ending at `end` (UTC months, oldest first) */
function cadence(posts: GhostPost[], end: Date) {
  const ey = end.getUTCFullYear();
  const em = end.getUTCMonth();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(ey, em - 11 + i, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), n: 0 };
  });
  for (const p of posts) {
    const d = new Date(p.published_at);
    if (Number.isNaN(d.getTime())) continue;
    const hit = months.find((x) => x.y === d.getUTCFullYear() && x.m === d.getUTCMonth());
    if (hit) hit.n++;
  }
  return months;
}

/**
 * Drafts in progress (hand-written), then the latest published post (live)
 * under the same pixel sky its reader opens on. With room to spare: the
 * last twelve months as a row of cells and the posts before it.
 */
export function Writing({ posts }: { posts: GhostPost[] }) {
  const { t, lang, path } = useI18n();
  const w = t.now.writing;
  const mounted = useHydrated();
  const now = useNow(3_600_000);
  const latest = posts[0];
  const earlier = posts.slice(1, 4);
  // anchored to this month once mounted; to the latest post's before that
  const end = now ?? (latest ? new Date(latest.published_at) : null);
  const months = end && !Number.isNaN(end.getTime()) ? cadence(posts, end) : [];
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const initial = new Intl.DateTimeFormat(locale, { month: "narrow", timeZone: "UTC" });
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="app-now-write">
      {NOW.drafting.length > 0 && (
        <div className="app-now-write-drafts">
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
            <span className="app-now-post-plate" aria-hidden>
              <PlateThumb seed={plateSeed(latest)} cols={96} rows={36} className="app-now-post-plate-px" />
            </span>
            <span className="app-now-post-text">
              <span className="app-now-post-title">{latest.title}</span>
              {latest.excerpt && <span className="app-now-post-excerpt">{latest.excerpt}</span>}
              <span className="app-now-post-meta tabular">
                {mounted ? timeAgo(latest.published_at, lang) : " "}
                {latest.reading_time ? ` · ${fill(w.minutes, { n: latest.reading_time })}` : ""}
              </span>
            </span>
          </a>
        ) : (
          <a href={BLOG_URL} target="_blank" rel="noopener noreferrer" className="app-now-link">
            {w.none} {w.blog}
            <PixelGlyph cells={G_ARROW} size={8} />
          </a>
        )}
      </div>

      {(months.length > 0 || earlier.length > 0) && (
        <div className="app-now-write-side">
          {months.length > 0 && (
            <div className="app-now-cadence">
              <h3 className="app-now-label">{w.cadence}</h3>
              <ol className="app-now-cadence-row">
                {months.map((mo) => {
                  const name = monthFmt.format(new Date(Date.UTC(mo.y, mo.m, 1)));
                  const label = mo.n === 1 ? fill(w.monthOne, { month: name }) : fill(w.month, { month: name, n: mo.n });
                  return (
                    <li key={`${mo.y}-${mo.m}`} title={label}>
                      <span className="app-now-cadence-cells" aria-hidden>
                        {[2, 1, 0].map((k) => (
                          <i key={k} data-on={mo.n > k || undefined} />
                        ))}
                      </span>
                      <span className="app-now-cadence-m" aria-hidden>
                        {initial.format(new Date(Date.UTC(mo.y, mo.m, 1)))}
                      </span>
                      <span className="sr-only">{label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {earlier.length > 0 && (
            <div className="app-now-earlier">
              <h3 className="app-now-label">{w.earlier}</h3>
              <ul className="app-now-earlier-list">
                {earlier.map((p) => (
                  <li key={p.slug}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="app-now-earlier-row">
                      <span className="app-now-earlier-date tabular">{short.format(new Date(p.published_at))}</span>
                      <span className="app-now-earlier-title">{p.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Link prefetch={false} href={path("/writing")} transitionTypes={["app-open"]} className="app-now-more">
        {w.all}
        <PixelGlyph cells={G_NEXT} size={10} />
      </Link>
    </div>
  );
}

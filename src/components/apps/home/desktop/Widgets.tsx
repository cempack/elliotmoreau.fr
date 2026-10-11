"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { PixelGlyph } from "@/components/glyphs";
import { Glass } from "@/components/os/Glass";
import { useSiteData } from "@/components/os/SiteData";
import { SOCIALS } from "@/lib/places";
import { G_COMMIT, G_PEN } from "./icons";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** The widget surface: a glass tile that opens something, Sonoma-style. */
function Tile({
  size,
  className = "",
  children,
}: {
  size: "s" | "m" | "wide";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`app-home-widget app-home-widget--${size} ${className}`}>
      <Glass thickness="regular" refract={false} aria-hidden className="app-home-widget-glass" />
      {children}
    </div>
  );
}

export function LatestPostWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.post;
  const { posts } = useSiteData();
  const hydrated = useHydrated();
  const post = posts[0];

  if (!post) {
    return (
      <Tile size="s" className="app-home-widget--post">
        <Link href={path("/writing")} transitionTypes={["app-open"]} className="app-home-widget-hit" aria-label={w.ariaEmpty} />
        <div className="app-home-widget-head" aria-hidden>
          <PixelGlyph cells={G_PEN} size={14} className="app-home-post-glyph" />
          <span>{w.title}</span>
        </div>
        <div className="app-home-post app-home-post--empty" aria-hidden>
          <p className="app-home-post-title">{w.empty}</p>
          <p className="app-home-post-foot">
            <span>{w.blog}</span>
          </p>
        </div>
      </Tile>
    );
  }

  const ago = hydrated ? timeAgo(post.published_at, lang) : "";
  const n = Math.max(1, post.reading_time || 1);
  const minutes = fill(w.minutes, { n });
  const tag = post.tags[0]?.name;
  // the first sentence only, so the clamp never lands just after a full
  // stop ("regrets.…")
  const excerpt = post.excerpt?.trim().split(/(?<=[.!?…])\s+/)[0] ?? "";
  const label = fill(w.aria, { title: post.title, minutes, ago });

  return (
    <Tile size="s" className="app-home-widget--post">
      <Link
        href={`${path("/writing")}?p=${encodeURIComponent(post.slug)}`}
        transitionTypes={["app-open"]}
        className="app-home-widget-hit"
        aria-label={label}
      />
      <div className="app-home-widget-head" aria-hidden>
        <PixelGlyph cells={G_PEN} size={14} className="app-home-post-glyph" />
        <span>{w.title}</span>
        {tag && <span className="app-home-post-tag">{tag}</span>}
      </div>
      <div className="app-home-post" aria-hidden>
        <p className="app-home-post-title">{post.title}</p>
        {excerpt && <p className="app-home-post-excerpt">{excerpt}</p>}
        <p className="app-home-post-foot">
          <span className="tabular">{fill(w.minutesShort, { n })}</span>
          <span className="app-home-post-ago" suppressHydrationWarning>
            {ago}
          </span>
        </p>
      </div>
    </Tile>
  );
}

/**
 * The last push (phones, beside the clock): the commit message itself,
 * which says more about the work than a count ever could. The mini
 * player already is the now-playing widget on this screen.
 */
export function PushWidget() {
  const { t, lang } = useI18n();
  const w = t.home.widgets.push;
  const { activity } = useSiteData();
  const hydrated = useHydrated();

  if (!activity) {
    return (
      <Tile size="s" className="app-home-widget--push">
        <a href={SOCIALS.github} target="_blank" rel="noreferrer" className="app-home-widget-hit" aria-label={w.ariaEmpty} />
        <div className="app-home-widget-head" aria-hidden>
          <PixelGlyph cells={G_COMMIT} size={14} className="app-home-push-glyph" />
          <span>{w.title}</span>
        </div>
        <div className="app-home-push app-home-push--empty" aria-hidden>
          <p className="app-home-push-msg">{w.empty}</p>
          <p className="app-home-push-foot">
            <span className="app-home-push-repo">{SOCIALS.github.replace("https://", "")}</span>
          </p>
        </div>
      </Tile>
    );
  }

  const ago = hydrated ? timeAgo(activity.createdAt, lang) : "";
  return (
    <Tile size="s" className="app-home-widget--push">
      <a
        href={activity.repoUrl}
        target="_blank"
        rel="noreferrer"
        className="app-home-widget-hit"
        aria-label={fill(w.aria, { message: activity.message, repo: activity.repo, ago })}
      />
      <div className="app-home-widget-head" aria-hidden>
        <PixelGlyph cells={G_COMMIT} size={14} className="app-home-push-glyph" />
        <span>{w.title}</span>
      </div>
      <div className="app-home-push" aria-hidden>
        <p className="app-home-push-msg">{activity.message}</p>
        <p className="app-home-push-foot">
          <span className="app-home-push-repo">{activity.repo}</span>
          <span className="app-home-push-ago" suppressHydrationWarning>
            {ago}
          </span>
        </p>
      </div>
    </Tile>
  );
}

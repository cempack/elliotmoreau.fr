"use client";

import Link from "next/link";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { SOCIALS } from "@/lib/places";
import type { ActivityInfo, RepoInfo } from "@/lib/github";
import { NOW, loc } from "@/content/now";
import { G_ARROW, LiveDot } from "../bits";
import { fill, useNow } from "../lib";

/** Header: the GitHub handle. */
export function BuildingMeta() {
  return (
    <a href={SOCIALS.github} target="_blank" rel="noopener noreferrer" className="app-now-status app-now-status--mono app-now-status--link">
      @cempack
    </a>
  );
}

/**
 * The current focus (hand-written), the last public push (live, with its
 * commit message) and the most recently pushed repos.
 */
export function Building({ activity, repos }: { activity: ActivityInfo | null; repos: RepoInfo[] }) {
  const { t, lang, path } = useI18n();
  const b = t.now.building;
  const mounted = useHydrated();
  const ago = (iso: string) => (mounted ? timeAgo(iso, lang) : " ");
  const recent = [...repos].sort((a, z) => +new Date(z.pushedAt) - +new Date(a.pushedAt)).slice(0, 3);
  const now = useNow(60_000);
  const fresh = now && activity ? now.getTime() - +new Date(activity.createdAt) < 86_400_000 : false;
  const f = NOW.focus;

  return (
    <div className="app-now-build">
      <div className="app-now-build-focus">
        <p className="app-now-label">
          {b.focus}
          {f.url && (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="app-now-label-aside app-now-label-link"
              aria-label={fill(b.sourceOf, { name: f.name })}
            >
              {b.source}
              <PixelGlyph cells={G_ARROW} size={7} />
            </a>
          )}
        </p>
        <p className="app-now-build-name">{f.name}</p>
        <p className="app-now-build-title">{loc(f.title, lang)}</p>
        <p className="app-now-build-body">{loc(f.body, lang)}</p>
      </div>

      <div className="app-now-build-push">
        <p className="app-now-label">
          {b.lastPush}
          {activity && (
            <span className="app-now-label-aside tabular">
              {ago(activity.createdAt)}
            </span>
          )}
        </p>
        {activity ? (
          <a
            href={activity.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-push"
            aria-label={
              activity.message
                ? fill(b.pushLabel, { repo: activity.repo, message: activity.message })
                : fill(b.pushedTo, { repo: activity.repo })
            }
          >
            <span className="app-now-push-repo">
              <LiveDot live={fresh} />
              {activity.repo}
            </span>
            {activity.message && <span className="app-now-push-msg">{activity.message}</span>}
          </a>
        ) : (
          <p className="app-now-muted">{b.none}</p>
        )}
      </div>

      {recent.length > 0 && (
        <div className="app-now-build-repos">
          <p className="app-now-label">
            {b.recent}
            <Link href={path("/work")} transitionTypes={["app-open"]} className="app-now-label-aside app-now-label-link">
              {b.all}
              <PixelGlyph cells={G_ARROW} size={7} />
            </Link>
          </p>
          <ul className="app-now-repos">
            {recent.map((r) => (
              <li key={r.name}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="app-now-repo">
                  <i style={{ background: LANG_COLORS[r.language] ?? LANG_FALLBACK }} aria-hidden />
                  <span className="app-now-repo-name">{r.name}</span>
                  <span className="app-now-repo-ago tabular">{ago(r.pushedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

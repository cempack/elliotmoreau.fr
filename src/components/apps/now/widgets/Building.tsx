"use client";

import { useRef } from "react";
import { PixelGlyph } from "@/components/glyphs";
import { useHydrated } from "@/hooks/env";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { SOCIALS } from "@/lib/socials";
import type { ActivityInfo } from "@/lib/github";
import { loc } from "@/lib/content";
import { useNowContent } from "@/components/os/SiteData";
import { G_ARROW } from "../bits";
import { fill } from "../lib";
import { City } from "./City";

/** the focus is this site: the card shows its code as a city (and takes two columns) */
export const showsCity = (url: string) => /^https:\/\/github\.com\/cempack\/elliotmoreau\.fr\/?$/i.test(url.trim());

/** Header: the GitHub handle. */
export function BuildingMeta() {
  return (
    <a href={SOCIALS.github} target="_blank" rel="noopener noreferrer" className="app-now-status app-now-status--mono app-now-status--link">
      @cempack
    </a>
  );
}

/**
 * Two things, in order of weight: what I'm building (hand-written: its
 * name, opening its source, what it is and why), then the last public push
 * (live: its commit message when GitHub still sends one, the repo, how long
 * ago). The repos list lives in Projects. When the focus is this site,
 * its code stands between the two as a city.
 */
export function Building({ activity }: { activity: ActivityInfo | null }) {
  const { t, lang } = useI18n();
  const b = t.now.building;
  const mounted = useHydrated();
  const f = useNowContent().focus;
  const title = loc(f.title, lang);
  const body = loc(f.body, lang);
  const city = showsCity(f.url);
  const room = useRef<HTMLDivElement>(null);

  return (
    <div className="app-now-build" data-city={city || undefined}>
      <div className="app-now-build-focus">
        {f.url ? (
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-build-name"
            aria-label={fill(b.sourceOf, { name: f.name })}
          >
            {f.name}
            <PixelGlyph cells={G_ARROW} size={9} />
          </a>
        ) : (
          <p className="app-now-build-name">{f.name}</p>
        )}
        {title && <p className="app-now-build-title">{title}</p>}
        {body && <p className="app-now-build-body">{body}</p>}
      </div>
      {city && (
        <>
          <div ref={room} className="app-now-city-room" aria-hidden />
          <City room={room} />
        </>
      )}

      <div className="app-now-build-push">
        <p className="app-now-label">
          {b.lastPush}
          {activity && <span className="app-now-label-aside tabular">{mounted ? timeAgo(activity.createdAt, lang) : " "}</span>}
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
            {activity.message && <span className="app-now-push-msg">{activity.message}</span>}
            <span className="app-now-push-repo">{activity.repo}</span>
          </a>
        ) : (
          <p className="app-now-muted">{b.none}</p>
        )}
      </div>
    </div>
  );
}

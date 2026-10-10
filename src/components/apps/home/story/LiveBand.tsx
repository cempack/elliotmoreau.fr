"use client";

import { useI18n } from "@/i18n/client";
import { useSiteData } from "@/components/os/SiteData";
import { useSky } from "@/components/os/sky";
import { Marquee } from "@/components/ui/Marquee";
import { PixelEq } from "@/components/os/window/PixelEq";
import { useHydrated } from "@/hooks/env";
import { useParisTime } from "@/hooks/useParisTime";
import { timeAgo } from "@/lib/format";
import { PLACES } from "@/lib/places";
import type { Music } from "./previews";
import { fill } from "./util";

/** 5×5 pixel spark between signals. */
function Spark() {
  return (
    <svg className="app-story-band-spark" width="15" height="15" viewBox="0 0 5 5" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="2" y="0" width="1" height="5" />
      <rect x="0" y="2" width="5" height="1" />
    </svg>
  );
}

/**
 * Chapter 3, the live band: one long ticker of what is true right now:
 * the track playing, the last push, the time in Paris and its sky, the
 * places on the map, the latest post. It leans into the scroll and rests
 * under the pointer (Marquee); reduced motion lists it, still.
 */
export function LiveBand({ music }: { music: Music }) {
  const { t, lang } = useI18n();
  const s = t.story.band;
  const { posts, activity } = useSiteData();
  const { phase } = useSky();
  const { time } = useParisTime();
  const hydrated = useHydrated();
  const { track, playing } = music;
  const been = PLACES.filter((p) => p.status === "been").length;
  const next = PLACES.filter((p) => p.status === "want").length;

  const items: { key: string; label: string; value: string; live?: boolean }[] = [
    {
      key: "music",
      label: track ? (playing ? s.playing : s.played) : s.playing,
      value: track ? `${track.title} — ${track.artist}` : s.silent,
      live: playing,
    },
    ...(activity
      ? [{ key: "push", label: s.push, value: `${activity.repo}${hydrated ? ` · ${timeAgo(activity.createdAt, lang)}` : ""}` }]
      : []),
    { key: "time", label: s.paris, value: `${time ?? "––:––"} · ${t.shell.control.short[phase]}` },
    { key: "atlas", label: s.countries, value: fill(s.countriesValue, { n: been, next }) },
    ...(posts[0] ? [{ key: "post", label: s.post, value: posts[0].title }] : []),
  ];

  return (
    <section className="app-story-band" data-veil="0.8" aria-label={s.label}>
      <Marquee speed={46} className="app-story-band-marquee">
        <ul className="app-story-band-list">
          {items.map((it) => (
            <li key={it.key} className="app-story-band-item">
              <span className="app-story-band-k">
                {it.key === "music" ? <PixelEq playing={!!it.live} className="app-story-band-eq" /> : <i className="app-story-band-dot" aria-hidden />}
                {it.label}
              </span>
              <span className="app-story-band-v">{it.value}</span>
              <Spark />
            </li>
          ))}
        </ul>
      </Marquee>
    </section>
  );
}

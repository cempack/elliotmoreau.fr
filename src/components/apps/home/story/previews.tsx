"use client";

import { useI18n } from "@/i18n/client";
import { useSiteData } from "@/components/os/SiteData";
import { useSky } from "@/components/os/sky";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PixelEq } from "@/components/os/window/PixelEq";
import { Pixels, SKY_GLYPH } from "@/components/os/menubar/glyphs";
import { useHydrated } from "@/hooks/env";
import { useParisTime } from "@/hooks/useParisTime";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { PLACES, fmtCoords, HOME, SOCIALS } from "@/lib/places";
import type { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { MAP_H, MAP_W, fill, fmtDate, landDots, mapCell, selectRepos } from "./util";

export type Music = ReturnType<typeof useSpotifyStatus>;

/**
 * Live window bodies for Mission Control: each is a miniature of the real
 * app, drawn from the same data. Decorative inside a link (the link's
 * label names the app), so none of them holds anything interactive.
 */

export function ProjectsPreview() {
  const { t } = useI18n();
  const { repos, sources } = useSiteData();
  const s = t.story.mc.projects;
  const list = selectRepos(repos, 4);
  const stars = repos.reduce((n, r) => n + r.stars, 0);
  if (!list.length) return <p className="app-story-pv-empty">{s.empty}</p>;
  return (
    <div className="app-story-pv-projects">
      <div className="app-story-pv-th" aria-hidden>
        <span>{s.name}</span>
        <span>{s.stars}</span>
      </div>
      <ul className="app-story-pv-rows">
        {list.map((r) => (
          <li key={r.name} className="app-story-pv-row">
            <PixelPlanet seed={r.name} className="app-story-pv-planet" />
            <span className="app-story-pv-name">{r.name}</span>
            <span className="app-story-pv-lang">
              <i style={{ background: LANG_COLORS[r.language] ?? LANG_FALLBACK }} aria-hidden />
              {r.language || "—"}
            </span>
            <span className="app-story-pv-stars tabular">★ {r.stars}</span>
          </li>
        ))}
      </ul>
      <p className="app-story-pv-status">
        <span>{fill(s.status, { n: repos.length, stars })}</span>
        <span className="app-story-pv-live" data-live={sources.repos === "live" || undefined}>
          {sources.repos === "live" ? s.live : s.sample}
        </span>
      </p>
    </div>
  );
}

export function WritingPreview() {
  const { t, lang } = useI18n();
  const { posts } = useSiteData();
  const s = t.story.mc.writing;
  const [first, ...rest] = posts;
  if (!first) return <p className="app-story-pv-empty">{s.empty}</p>;
  return (
    <div className="app-story-pv-writing">
      <p className="app-story-pv-meta">
        <span className="app-story-pv-tag">{first.tags[0]?.name ?? s.latest}</span>
        <span>{fmtDate(first.published_at, lang)}</span>
      </p>
      <p className="app-story-pv-post">{first.title}</p>
      {first.excerpt && <p className="app-story-pv-excerpt">{first.excerpt}</p>}
      {rest.length > 0 && (
        <ul className="app-story-pv-more">
          {rest.slice(0, 2).map((p) => (
            <li key={p.slug}>
              <span>{p.title}</span>
              <span className="tabular">{fill(s.read, { n: p.reading_time })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AtlasPreview() {
  const { t, lang } = useI18n();
  const s = t.story.mc.atlas;
  const been = PLACES.filter((p) => p.status === "been");
  const next = PLACES.filter((p) => p.status === "want");
  const home = mapCell(HOME.lat, HOME.lon);
  return (
    <div className="app-story-pv-atlas">
      <svg
        className="app-story-pv-map"
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
        aria-hidden
        focusable="false"
      >
        <path d={landDots()} className="app-story-pv-land" />
        {next.map((p) => {
          const c = mapCell(p.lat, p.lon);
          return <rect key={p.id} x={c.x + 0.1} y={c.y + 0.1} width={0.8} height={0.8} className="app-story-pv-want" />;
        })}
        {been
          .filter((p) => !p.home)
          .map((p) => {
            const c = mapCell(p.lat, p.lon);
            return (
              <g key={p.id}>
                <rect x={c.x - 1} y={c.y - 1} width={3} height={3} className="app-story-pv-glow" />
                <rect x={c.x} y={c.y} width={1} height={1} className="app-story-pv-been" />
              </g>
            );
          })}
        <rect x={home.x - 1} y={home.y - 1} width={3} height={3} className="app-story-pv-ping" />
        <rect x={home.x} y={home.y} width={1} height={1} className="app-story-pv-home" />
      </svg>
      <div className="app-story-pv-legend">
        <span>
          <i className="app-story-pv-key app-story-pv-key--home" aria-hidden />
          {s.home} · {HOME.name[lang]} <span className="app-story-pv-coord">{fmtCoords(HOME.lat, HOME.lon)}</span>
        </span>
        <span>
          <i className="app-story-pv-key app-story-pv-key--been" aria-hidden />
          {fill(s.been, { n: been.length })}
        </span>
        <span>
          <i className="app-story-pv-key app-story-pv-key--want" aria-hidden />
          {fill(s.next, { n: next.length })}
        </span>
      </div>
    </div>
  );
}

export function Cover({ music, className = "" }: { music: Music; className?: string }) {
  const { track } = music;
  if (track?.image) {
    // eslint-disable-next-line @next/next/no-img-element -- remote album art, tiny and decorative
    return <img src={track.image} alt="" className={className} loading="lazy" decoding="async" />;
  }
  return <PixelPlanet seed={track ? `${track.artist}·${track.album || track.title}` : "silence"} className={className} />;
}

export function NowPreview({ music }: { music: Music }) {
  const { t, lang } = useI18n();
  const { activity } = useSiteData();
  const { phase } = useSky();
  const { time } = useParisTime();
  const hydrated = useHydrated();
  const s = t.story.mc.now;
  const { track, playing } = music;
  return (
    <div className="app-story-pv-now">
      <div className="app-story-pv-clock">
        <span className="app-story-pv-time tabular">{time ?? "––:––"}</span>
        <span className="app-story-pv-sky">
          <Pixels cells={SKY_GLYPH[phase]} size={12} />
          {s.paris} · {t.shell.control.short[phase]}
        </span>
      </div>
      <div className="app-story-pv-track">
        <Cover music={music} className="app-story-pv-cover" />
        <span className="app-story-pv-tt">
          <span className="app-story-pv-k">{track ? (playing ? s.listening : s.lastPlayed) : s.silent}</span>
          {track && (
            <>
              <span className="app-story-pv-title">{track.title}</span>
              <span className="app-story-pv-artist">{track.artist}</span>
            </>
          )}
        </span>
        <PixelEq playing={playing} className="app-story-pv-eq" />
      </div>
      {activity && (
        <p className="app-story-pv-push">
          <span className="app-story-pv-k">{s.push}</span>
          <span className="app-story-pv-msg">{activity.message}</span>
          <span className="app-story-pv-ago">
            {activity.repo}
            {hydrated && ` · ${timeAgo(activity.createdAt, lang)}`}
          </span>
        </p>
      )}
    </div>
  );
}

export function MailPreview() {
  const { t } = useI18n();
  const s = t.story.mc.mail;
  return (
    <div className="app-story-pv-mail">
      <p className="app-story-pv-field">
        <span className="app-story-pv-k">{s.to}</span>
        <span className="app-story-pv-chip">{SOCIALS.email}</span>
      </p>
      <p className="app-story-pv-field">
        <span className="app-story-pv-k">{s.subject}</span>
        <span className="app-story-pv-subject">{s.subjectValue}</span>
      </p>
      <p className="app-story-pv-body">
        {s.body}
        <span className="app-story-pv-caret" aria-hidden />
      </p>
      <span className="app-story-pv-send" aria-hidden>
        {s.send}
        <svg width="12" height="12" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor">
          <rect x="0" y="3" width="5" height="1" />
          <rect x="3" y="1" width="1" height="1" />
          <rect x="4" y="2" width="1" height="1" />
          <rect x="5" y="3" width="1" height="1" />
          <rect x="4" y="4" width="1" height="1" />
          <rect x="3" y="5" width="1" height="1" />
        </svg>
      </span>
    </div>
  );
}

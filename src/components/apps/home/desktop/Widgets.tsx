"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { GLYPH_CODE, PixelGlyph } from "@/components/glyphs";
import { PixelPlanet } from "@/components/PixelPlanet";
import { Glass } from "@/components/os/Glass";
import { useSiteData } from "@/components/os/SiteData";
import { phaseForHour, type SkyPhase } from "@/components/os/sky";
import { PixelEq } from "@/components/os/window/PixelEq";
import { PARIS, fmtOffset, hhmm, offsetMinutes, useMinute, useVisitorZone, zoned } from "./time";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/* ───────────────────────────── the sky clock ─────────────────────────────
   A 24-hour dial drawn in pixels: the ring is the day in Paris, coloured by
   the four sky phases the whole OS follows (dithered where one hands over
   to the next), noon at the top, midnight at the bottom. A pixel sun or
   moon rides the ring at the current Paris time; an ion tick marks the
   visitor's own hour when it differs. */

const N = 25; // cells across
const MID = N / 2;
const R_OUT = 12.4;
const R_IN = 9.9;

const PHASE_INK: Record<SkyPhase, string> = {
  night: "#7d72f0",
  dawn: "#f4a27c",
  day: "#8be9ff",
  dusk: "#ff7f6e",
};
/** phase starts, Paris hours (mirrors phaseForHour) */
const STARTS: [SkyPhase, number][] = [
  ["dawn", 5.5],
  ["day", 8.5],
  ["dusk", 17.5],
  ["night", 21],
];
const NEXT: Record<SkyPhase, [SkyPhase, string]> = {
  dawn: ["day", "08:30"],
  day: ["dusk", "17:30"],
  dusk: ["night", "21:00"],
  night: ["dawn", "05:30"],
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** hour on the dial for a point relative to the centre (noon up, clockwise) */
const hourAt = (dx: number, dy: number) => (((12 + (Math.atan2(dx, -dy) / (2 * Math.PI)) * 24) % 24) + 24) % 24;

/** the dial point for an hour at radius r */
function pointAt(h: number, r: number) {
  const a = ((h - 12) / 24) * 2 * Math.PI;
  return { x: MID + Math.sin(a) * r, y: MID - Math.cos(a) * r };
}

type Cell = { x: number; y: number; phase: SkyPhase };

/** ring cells, computed once: phase per cell with a Bayer-dithered handover */
const RING: Cell[] = (() => {
  const out: Cell[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - MID;
      const dy = y + 0.5 - MID;
      const r = Math.hypot(dx, dy);
      if (r < R_IN || r > R_OUT) continue;
      const h = hourAt(dx, dy);
      let phase = phaseForHour(h);
      // within 0.45h of a handover, dither between the two phases
      for (const [p, start] of STARTS) {
        const d = ((h - start + 36) % 24) - 12; // signed hours from the start
        if (Math.abs(d) < 0.45) {
          const prev = STARTS[(STARTS.findIndex(([q]) => q === p) + 3) % 4][0];
          phase = (d + 0.45) / 0.9 > bayer(x, y) ? p : prev;
        }
      }
      out.push({ x, y, phase });
    }
  }
  return out;
})();

const TICKS = [0, 6, 12, 18].map((h) => {
  const p = pointAt(h, R_IN - 1.6);
  return { h, x: Math.floor(p.x), y: Math.floor(p.y) };
});

/* 3×3 sprites (cell offsets from the centre cell) */
const SUN = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [0, 1],
];
const SUN_CORE: [number, number][] = [[0, 0]];
const MOON = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function SkyDial({ hour, phase, visitorHour }: { hour: number | null; phase: SkyPhase | null; visitorHour: number | null }) {
  const sprite = useMemo(() => {
    if (hour == null || !phase) return null;
    const p = pointAt(hour, (R_IN + R_OUT) / 2);
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const isSun = phase === "day" || phase === "dawn";
    return { cx, cy, isSun };
  }, [hour, phase]);
  const you = useMemo(() => {
    if (visitorHour == null) return null;
    const p = pointAt(visitorHour, R_IN - 1.4);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  }, [visitorHour]);

  return (
    <svg
      viewBox={`0 0 ${N} ${N}`}
      className="app-home-dial"
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
    >
      {RING.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          fill={PHASE_INK[c.phase]}
          opacity={phase == null || c.phase === phase ? 1 : 0.34}
        />
      ))}
      {TICKS.map((t) => (
        <rect key={t.h} x={t.x} y={t.y} width={1} height={1} fill="#9196a6" />
      ))}
      {you && <rect x={you.x} y={you.y} width={1} height={1} fill="#8be9ff" className="app-home-dial-you" />}
      {sprite && (
        <g transform={`translate(${sprite.cx} ${sprite.cy})`}>
          {/* a one-cell ink halo keeps the sprite legible on any arc */}
          {(sprite.isSun ? SUN : MOON).map(([dx, dy]) => (
            <rect key={`h${dx}${dy}`} x={dx - 0.5} y={dy - 0.5} width={2} height={2} fill="#05060a" opacity={0.85} />
          ))}
          {(sprite.isSun ? SUN : MOON).map(([dx, dy]) => (
            <rect key={`s${dx}${dy}`} x={dx} y={dy} width={1} height={1} fill={sprite.isSun ? "#ffb86b" : "#f5f2ec"} />
          ))}
          {sprite.isSun &&
            SUN_CORE.map(([dx, dy]) => <rect key="core" x={dx} y={dy} width={1} height={1} fill="#ffe2b8" />)}
        </g>
      )}
    </svg>
  );
}

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

export function ClockWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.clock;
  const now = useMinute();
  const zone = useVisitorZone();

  let hour: number | null = null;
  let phase: SkyPhase | null = null;
  let time = "--:--";
  let visitorHour: number | null = null;
  let offset = 0;
  let visitorTime = "";
  if (now) {
    const p = zoned(now, PARIS);
    hour = p.h + p.m / 60;
    phase = phaseForHour(hour);
    time = hhmm(now, lang);
    offset = offsetMinutes(now, zone) - offsetMinutes(now, PARIS);
    if (offset !== 0) {
      const v = zoned(now, zone);
      visitorHour = v.h + v.m / 60;
      visitorTime = hhmm(now, lang, zone);
    }
  }
  const [nextPhase, nextAt] = phase ? NEXT[phase] : ["night" as SkyPhase, "21:00"];
  const next = fill(w.next[nextPhase], { time: nextAt });
  const label = now
    ? `${fill(w.aria, { time, phase: phase ? w.phase[phase] : "", next })}${
        offset !== 0 ? ` ${fill(w.ariaYou, { time: visitorTime, offset: fmtOffset(offset) })}` : ""
      }`
    : w.title;

  return (
    <Tile size="s" className="app-home-widget--clock">
      <Link
        href={path("/now")}
        transitionTypes={["app-open"]}
        className="app-home-widget-hit"
        aria-label={`${label} ${w.open}`}
      />
      {offset !== 0 && (
        <span className="app-home-clock-you" aria-hidden>
          <i />
          {fmtOffset(offset)}
        </span>
      )}
      <div className="app-home-clock-face" aria-hidden>
        <SkyDial hour={hour} phase={phase} visitorHour={visitorHour} />
        <span className="app-home-clock-center">
          <span className="app-home-clock-time tabular" suppressHydrationWarning>
            {time}
          </span>
          <span className="app-home-clock-city">{w.title}</span>
        </span>
      </div>
      <p className="app-home-clock-phase" aria-hidden>
        <span className="app-home-clock-phase-name" data-phase={phase ?? undefined}>
          {phase ? w.phase[phase] : " "}
        </span>
        <span className="app-home-clock-next">{phase ? next : " "}</span>
      </p>
    </Tile>
  );
}

export function PushWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.push;
  const { activity, repos } = useSiteData();
  const hydrated = useHydrated();
  const repo = activity ? repos.find((r) => r.name === activity.repo) : undefined;
  const ago = activity && hydrated ? timeAgo(activity.createdAt, lang) : "";
  const label = activity ? fill(w.aria, { repo: activity.repo, ago, message: activity.message }) : w.ariaEmpty;

  return (
    <Tile size="s" className="app-home-widget--push">
      <Link href={path("/work")} transitionTypes={["app-open"]} className="app-home-widget-hit" aria-label={label} />
      <div className="app-home-widget-head" aria-hidden>
        <PixelGlyph cells={GLYPH_CODE} size={14} className="app-home-push-glyph" />
        <span>{w.title}</span>
      </div>
      {activity ? (
        <div className="app-home-push" aria-hidden>
          <p className="app-home-push-repo">{activity.repo}</p>
          <p className="app-home-push-msg">{activity.message}</p>
          <p className="app-home-push-foot">
            {repo?.language ? (
              <span className="app-home-push-lang">
                <i style={{ background: LANG_COLORS[repo.language] ?? LANG_FALLBACK }} />
                {repo.language}
              </span>
            ) : (
              <span />
            )}
            <span className="app-home-push-ago" suppressHydrationWarning>
              {ago}
            </span>
          </p>
        </div>
      ) : (
        <div className="app-home-push app-home-push--empty" aria-hidden>
          <p className="app-home-push-msg">{w.empty}</p>
          <p className="app-home-push-foot">
            <span>{w.profile}</span>
          </p>
        </div>
      )}
    </Tile>
  );
}

export function MusicWidget() {
  const { t } = useI18n();
  const w = t.home.widgets.music;
  const { spotify } = useSiteData();
  const { track, playing } = useSpotifyStatus(spotify);

  if (!track) {
    return (
      <Tile size="s" className="app-home-widget--music">
        <div className="app-home-music app-home-music--empty">
          <span className="app-home-music-art" aria-hidden>
            <PixelPlanet seed="silence" className="app-home-music-planet" />
          </span>
          <p className="app-home-music-title">{w.nothing}</p>
          <p className="app-home-music-artist">{w.quiet}</p>
        </div>
      </Tile>
    );
  }

  const inner = (
    <div className="app-home-music">
      <div className="app-home-music-top">
        <span className="app-home-music-art" aria-hidden>
          {track.image ? (
            // remote Spotify art, already small
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.image} alt="" draggable={false} />
          ) : (
            <PixelPlanet seed={`${track.title} · ${track.artist}`} className="app-home-music-planet" />
          )}
        </span>
        <PixelEq playing={playing} className="app-home-music-eq" />
      </div>
      <p className="app-home-music-state" data-live={playing || undefined}>
        {playing ? w.nowPlaying : w.lastPlayed}
      </p>
      <p className="app-home-music-title">{track.title}</p>
      <p className="app-home-music-artist">{track.artist}</p>
    </div>
  );

  return (
    <Tile size="s" className="app-home-widget--music">
      {track.url ? (
        <a
          href={track.url}
          target="_blank"
          rel="noreferrer"
          className="app-home-widget-hit"
          aria-label={fill(w.open, { title: track.title, artist: track.artist })}
        />
      ) : null}
      {inner}
    </Tile>
  );
}

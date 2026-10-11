"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { GLYPH_PIN, PixelGlyph } from "@/components/glyphs";
import { Glass } from "@/components/os/Glass";
import { useSiteData } from "@/components/os/SiteData";
import { phaseForHour, useSky, type SkyPhase } from "@/components/os/sky";
import { SOCIALS } from "@/lib/places";
import { G_COMMIT, G_PEN } from "./icons";
import { PARIS, fmtOffset, hhmm, offsetMinutes, useMinute, useVisitorZone, zoned } from "./time";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/* ───────────────────────────── the sky clock ─────────────────────────────
   A 24-hour dial drawn in pixels: the ring is the day in Paris, coloured by
   the four sky phases the whole OS follows (dithered where one hands over
   to the next), noon at the top, midnight at the bottom. A paper-white
   playhead cuts the ring at the current Paris time, the sun (or the moon
   at night) sits in the middle above the clock, and an ion tick marks the
   visitor's own hour when it differs. One cell is 4 CSS px. */

const N = 25; // cells across
const MID = N / 2;
const R_OUT = 12.2;
const R_IN = 9.6;

const PHASE_INK: Record<SkyPhase, string> = {
  night: "#8fa3b8",
  dawn: "#e6c08e",
  day: "#b0cc86",
  dusk: "#e2906b",
};
/** the other phases, dimmed but still themselves (a flat opacity turned
    dawn and dusk to mud on the navy glass) */
const PHASE_DIM: Record<SkyPhase, string> = {
  night: "#46535f",
  dawn: "#7a6a52",
  day: "#5a6e48",
  dusk: "#7a5444",
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
/** shortest signed distance between two dial hours */
const hourGap = (a: number, b: number) => ((a - b + 36) % 24) - 12;

/** the dial point for an hour at radius r */
function pointAt(h: number, r: number) {
  const a = ((h - 12) / 24) * 2 * Math.PI;
  return { x: MID + Math.sin(a) * r, y: MID - Math.cos(a) * r };
}

type Cell = { x: number; y: number; h: number; r: number; phase: SkyPhase };

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
        const d = hourGap(h, start);
        if (Math.abs(d) < 0.45) {
          const prev = STARTS[(STARTS.findIndex(([q]) => q === p) + 3) % 4][0];
          phase = (d + 0.45) / 0.9 > bayer(x, y) ? p : prev;
        }
      }
      out.push({ x, y, h, r, phase });
    }
  }
  return out;
})();

/** the playhead's cells for an hour: a short spoke across the ring */
function playhead(hour: number) {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - MID;
      const dy = y + 0.5 - MID;
      const r = Math.hypot(dx, dy);
      if (r < R_IN - 0.5 || r > R_OUT + 0.6) continue;
      // ~one cell wide at the ring's middle radius
      if (Math.abs(hourGap(hourAt(dx, dy), hour)) * ((2 * Math.PI * r) / 24) < 0.62) out.push({ x, y });
    }
  }
  return out;
}

/* 5×5 sun (a disc with rays) and moon (a disc with its shadow side) */
const SUN: [number, number, string][] = [
  [0, 0, "#e8893d"], [2, 0, "#e0bd6e"], [4, 0, "#e8893d"],
  [1, 1, "#e0bd6e"], [2, 1, "#e0bd6e"], [3, 1, "#e0bd6e"],
  [0, 2, "#e0bd6e"], [1, 2, "#e0bd6e"], [2, 2, "#ffe2b8"], [3, 2, "#e0bd6e"], [4, 2, "#e0bd6e"],
  [1, 3, "#e0bd6e"], [2, 3, "#e0bd6e"], [3, 3, "#e0bd6e"],
  [0, 4, "#e8893d"], [2, 4, "#e0bd6e"], [4, 4, "#e8893d"],
];
const MOON: [number, number, string][] = [
  [1, 0, "#8f988f"], [2, 0, "#ebe9e1"], [3, 0, "#ebe9e1"],
  [0, 1, "#8f988f"], [1, 1, "#8f988f"], [2, 1, "#ebe9e1"], [3, 1, "#bcc2ba"], [4, 1, "#ebe9e1"],
  [0, 2, "#8f988f"], [1, 2, "#8f988f"], [2, 2, "#ebe9e1"], [3, 2, "#ebe9e1"], [4, 2, "#ebe9e1"],
  [0, 3, "#8f988f"], [1, 3, "#8f988f"], [2, 3, "#bcc2ba"], [3, 3, "#ebe9e1"], [4, 3, "#ebe9e1"],
  [1, 4, "#8f988f"], [2, 4, "#ebe9e1"], [3, 4, "#ebe9e1"],
];

function SkyDial({
  hour,
  phase,
  glyphPhase,
  visitorHour,
}: {
  hour: number | null;
  /** the real phase in Paris (the lit arc) */
  phase: SkyPhase | null;
  /** the sky on screen (pinned or real): sun or moon */
  glyphPhase: SkyPhase | null;
  visitorHour: number | null;
}) {
  const head = useMemo(() => (hour == null ? [] : playhead(hour)), [hour]);
  const you = useMemo(() => {
    if (visitorHour == null) return null;
    // two cells along the ring's tangent, just inside it
    const p = pointAt(visitorHour, R_IN - 1.5);
    const a = ((visitorHour - 12) / 24) * 2 * Math.PI;
    const along = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a));
    return { x: Math.floor(p.x - (along ? 0.5 : 0)), y: Math.floor(p.y - (along ? 0 : 0.5)), w: along ? 2 : 1, h: along ? 1 : 2 };
  }, [visitorHour]);
  const glyph = glyphPhase === "night" ? MOON : SUN;

  return (
    <svg viewBox={`0 0 ${N} ${N}`} className="app-home-dial" shapeRendering="crispEdges" aria-hidden focusable="false">
      {RING.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          fill={phase == null || c.phase === phase ? PHASE_INK[c.phase] : PHASE_DIM[c.phase]}
        />
      ))}
      {you && <rect x={you.x} y={you.y} width={you.w} height={you.h} fill="#89b4a8" className="app-home-dial-you" />}
      {head.map((c) => (
        <rect key={`h${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill="#ebe9e1" />
      ))}
      {glyphPhase && (
        <g transform="translate(10 5)">
          {glyph.map(([x, y, c]) => (
            <rect key={`g${x}-${y}`} x={x} y={y} width={1} height={1} fill={c} />
          ))}
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
  // Control Center can pin the sky: the dial stays true to Paris, the
  // phase line and the sun or moon follow the sky you are looking at
  const { mode } = useSky();

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
  const pinned = phase && mode !== "auto" ? mode : null;
  const shown = pinned ?? phase;
  const [nextPhase, nextAt] = phase ? NEXT[phase] : ["night" as SkyPhase, "21:00"];
  const next = fill(w.next[nextPhase], { time: nextAt });
  const real = phase ? fill(w.real, { phase: w.phase[phase].toLocaleLowerCase(lang) }) : "";
  const label = now
    ? `${
        pinned && phase
          ? fill(w.ariaPinned, { time, pinned: w.phase[pinned], phase: w.phase[phase] })
          : fill(w.aria, { time, phase: phase ? w.phase[phase] : "", next })
      }${offset !== 0 ? ` ${fill(w.ariaYou, { time: visitorTime, offset: fmtOffset(offset) })}` : ""}`
    : w.title;

  return (
    <Tile size="s" className="app-home-widget--clock">
      <Link
        href={path("/now")}
        transitionTypes={["app-open"]}
        className="app-home-widget-hit"
        aria-label={`${label} ${fill(w.open, { app: t.shell.apps.now })}`}
      />
      {offset !== 0 && (
        <span className="app-home-clock-you" aria-hidden>
          <span className="app-home-clock-you-k">
            <i />
            {w.you}
          </span>
          <span className="tabular">{fmtOffset(offset)}</span>
        </span>
      )}
      <div className="app-home-clock-face" aria-hidden>
        <SkyDial hour={hour} phase={phase} glyphPhase={shown} visitorHour={visitorHour} />
        <span className="app-home-clock-center">
          <span className="app-home-clock-time tabular" suppressHydrationWarning>
            {time}
          </span>
        </span>
      </div>
      <p className="app-home-clock-phase" aria-hidden>
        <span className="app-home-clock-phase-line">
          {pinned && <PixelGlyph cells={GLYPH_PIN} size={9} className="app-home-clock-pin" />}
          <span className="app-home-clock-phase-name" data-phase={shown ?? undefined}>
            {shown ? w.phase[shown] : " "}
          </span>
          <span className="app-home-clock-city">{pinned ? w.pinned : w.title}</span>
        </span>
        <span className="app-home-clock-next">{phase ? (pinned ? real : next) : " "}</span>
      </p>
    </Tile>
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

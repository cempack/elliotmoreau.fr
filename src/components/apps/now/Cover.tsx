"use client";

import { memo, useMemo, useRef } from "react";
import { useReduced } from "@/hooks/env";
import { hashString, useOnScreen, useTabHidden } from "./lib";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** sleeve palettes: a sky that darkens downward, a lead ink and a light one */
const THEMES = [
  { top: "#1b1726", bottom: "#4a3554", a: "#e2786b", b: "#e0bd6e" },
  { top: "#0d1716", bottom: "#24433f", a: "#89b4a8", b: "#ebe9e1" },
  { top: "#121710", bottom: "#36452a", a: "#b0cc86", b: "#ebe9e1" },
  { top: "#1d150d", bottom: "#4b3421", a: "#e0bd6e", b: "#ebe9e1" },
  { top: "#11131f", bottom: "#2c3352", a: "#aea3c8", b: "#89b4a8" },
] as const;
type Theme = (typeof THEMES)[number];

const MOTIFS = ["sun", "rings", "peaks", "bars"] as const;

export function themeFor(seed: string): Theme {
  return THEMES[hashString(seed) % THEMES.length];
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An n×n grid of inks (null: the sky shows) for a seed. */
function paint(seed: string, n: number) {
  const h = hashString(seed);
  const th = THEMES[h % THEMES.length];
  const motif = MOTIFS[(h >>> 4) % MOTIFS.length];
  const r = rng(h);
  const g: string[][] = [];
  for (let y = 0; y < n; y++) {
    const row: string[] = [];
    // the sky: two inks, Bayer-dithered from top to bottom
    for (let x = 0; x < n; x++) row.push(y / (n - 1) > bayer(x, y) ? th.bottom : th.top);
    g.push(row);
  }
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < n && y < n) g[y][x] = c;
  };

  if (motif === "sun") {
    // a striped sun going down behind a dark floor
    const cx = n / 2 - 0.5 + Math.round((r() - 0.5) * n * 0.2);
    const cy = Math.round(n * 0.56);
    const R = n * 0.3;
    const horizon = Math.round(cy + R * 0.55);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (y >= horizon) {
          put(x, y, (y - horizon) % 3 === 0 || (x - cx) % 6 === 0 ? th.bottom : "#0d0f0e");
          continue;
        }
        if (Math.hypot(x - cx, y - cy) > R) continue;
        const below = y - cy;
        if (below > 0 && below % 3 === 1) continue;
        put(x, y, (y - (cy - R)) / (2 * R) > bayer(x, y) * 0.9 + 0.1 ? th.a : th.b);
      }
    }
  } else if (motif === "rings") {
    const cx = n / 2 - 0.5;
    const cy = n / 2 - 0.5;
    const step = 2 + Math.floor(r() * 2);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < 1.6) put(x, y, th.b);
        else if (Math.floor(d) % step === 0 && d < n * 0.48) put(x, y, d < n * 0.24 ? th.b : th.a);
      }
    }
  } else if (motif === "peaks") {
    const peaks = Array.from({ length: 3 }, () => ({ x: r() * n, h: n * (0.32 + r() * 0.34) }));
    for (let x = 0; x < n; x++) {
      const top = Math.max(...peaks.map((p) => p.h - Math.abs(x - p.x) * 0.9));
      const y0 = Math.round(n - top);
      for (let y = Math.max(0, y0); y < n; y++) put(x, y, y - y0 < 2 ? th.b : (x + y) % 4 === 0 ? th.bottom : th.a);
    }
    // a small moon
    const mx = Math.round(n * (0.2 + r() * 0.2));
    const my = Math.round(n * 0.2);
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x * y === 0) put(mx + x, my + y, th.b);
  } else {
    // an equaliser at rest
    const w = 2;
    const cols = Math.floor((n - 2) / (w + 1));
    const x0 = Math.floor((n - cols * (w + 1) + 1) / 2);
    for (let c = 0; c < cols; c++) {
      const hgt = Math.round(n * (0.16 + r() * 0.58));
      for (let y = n - 2; y > n - 2 - hgt; y--) {
        for (let k = 0; k < w; k++) put(x0 + c * (w + 1) + k, y, y === n - 1 - hgt ? th.b : th.a);
      }
    }
  }
  return g;
}

/**
 * A sleeve for music with no artwork: a pixel cover seeded by the track or
 * artist, so the same song always gets the same sleeve. Painted as merged
 * row runs (a few dozen rects, server-rendered, crisp at any size).
 */
export const PixelCover = memo(function PixelCover({ seed, n = 24, className = "" }: { seed: string; n?: number; className?: string }) {
  const runs = useMemo(() => {
    const g = paint(seed, n);
    const out: { x: number; y: number; w: number; c: string }[] = [];
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        const c = g[y][x];
        let w = 1;
        while (x + w < n && g[y][x + w] === c) w++;
        out.push({ x, y, w, c });
        x += w;
      }
    }
    return out;
  }, [seed, n]);
  return (
    <svg className={className} viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden>
      {runs.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
});

const VN = 24;
/** the record's grooves and a fixed sheen (the light doesn't turn with it) */
const DISC = (() => {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  const c = VN / 2 - 0.5;
  for (let y = 0; y < VN; y++) {
    let run: { x: number; c: string } | null = null;
    for (let x = 0; x <= VN; x++) {
      let ink: string | null = null;
      if (x < VN) {
        const d = Math.hypot(x - c, y - c);
        if (d <= VN / 2 && d > 4.6) {
          const a = Math.atan2(y - c, x - c);
          const sheen = Math.abs(Math.sin(a * 2 + 0.6)) > 0.94 && d > 6;
          const rim = d > VN / 2 - 1;
          ink = rim ? "#3f4842" : sheen ? "#4a544d" : Math.floor(d) % 2 ? "#141816" : "#232925";
        }
      }
      if (run && ink !== run.c) {
        out.push({ x: run.x, y, w: x - run.x, c: run.c });
        run = null;
      }
      if (ink && !run) run = { x, c: ink };
    }
  }
  return out;
})();

/**
 * The record behind the sleeve. It slides out while something plays and
 * its label turns (stepped, like a pixel animation would); it tucks back in
 * and stops when paused, off screen, hidden, or under reduced motion.
 */
export function Vinyl({ seed, playing }: { seed: string; playing: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const on = useOnScreen(ref, "40px");
  const hidden = useTabHidden();
  const reduced = useReduced();
  const th = themeFor(seed);
  return (
    <span
      ref={ref}
      className="app-now-vinyl"
      data-out={playing || undefined}
      data-spin={(playing && on && !hidden && !reduced) || undefined}
      aria-hidden
    >
      <svg className="app-now-vinyl-disc" viewBox={`0 0 ${VN} ${VN}`} shapeRendering="crispEdges">
        {DISC.map((r) => (
          <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
        ))}
      </svg>
      <svg className="app-now-vinyl-label" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <rect x={3} y={0} width={4} height={10} fill={th.a} />
        <rect x={0} y={3} width={10} height={4} fill={th.a} />
        <rect x={1} y={1} width={8} height={8} fill={th.a} />
        <rect x={2} y={1} width={3} height={1} fill={th.b} />
        <rect x={1} y={2} width={1} height={2} fill={th.b} />
        <rect x={4} y={4} width={2} height={2} fill="#0a0c0b" />
      </svg>
    </span>
  );
}

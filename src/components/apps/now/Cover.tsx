"use client";

import { byFill, pxPath } from "@/lib/pxpath";

import { memo, useMemo } from "react";
import { hashString } from "./lib";

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

/** the sleeve as an n×n grid of hex inks, for painting into other pixels */
export { paint as sleeveGrid };

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
      {[...byFill(runs, (r) => r.c)].map(([fill, rs]) => (
        <path key={fill} d={pxPath(rs)} fill={fill} />
      ))}
    </svg>
  );
});

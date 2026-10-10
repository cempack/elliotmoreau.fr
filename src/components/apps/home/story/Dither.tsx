"use client";

import { memo, useMemo } from "react";

/** Ordered 4×4 Bayer thresholds, the wallpaper's own dither. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const lit = (x: number, y: number, density: number) => density > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** One path of unit squares for every cell whose density clears its threshold. */
function cells(cols: number, rows: number, density: (x: number, y: number) => number) {
  let d = "";
  for (let y = 0; y < rows; y++) {
    let run = -1;
    for (let x = 0; x <= cols; x++) {
      const on = x < cols && lit(x, y, density(x, y));
      if (on && run < 0) run = x;
      if (!on && run >= 0) {
        d += `M${run} ${y}h${x - run}v1h${run - x}z`;
        run = -1;
      }
    }
  }
  return d;
}

/**
 * A dithered pixel sun: an ember disc whose lower half is cut by
 * synthwave bands that thicken toward the horizon, inside a sparse flare
 * halo. Static SVG, drawn once, crisp at `cell` CSS px per pixel.
 */
export const DitherSun = memo(function DitherSun({
  size = 64,
  cell = 4,
  className = "",
}: {
  size?: number;
  cell?: number;
  className?: string;
}) {
  const { core, halo, rim } = useMemo(() => {
    const c = size / 2 - 0.5;
    const r = size * 0.3;
    const dist = (x: number, y: number) => Math.hypot(x - c, y - c);
    // bands: gaps in the lower half, wider as they near the horizon
    const cut = (y: number) => {
      const t = (y - c) / r;
      if (t <= 0.05) return false;
      const period = 5;
      const gap = Math.max(1, Math.round(t * 3));
      return (Math.floor(y) % period) < gap;
    };
    const core = cells(size, size, (x, y) => {
      const k = dist(x, y) / r;
      if (k > 1 || cut(y)) return 0;
      // brighter toward the top of the disc
      return 1 - Math.max(0, (y - (c - r)) / (2 * r)) * 0.32;
    });
    const rim = cells(size, size, (x, y) => {
      const k = dist(x, y) / r;
      if (k > 1 || cut(y)) return 0;
      return Math.max(0, (y - c) / r) * 0.9;
    });
    const halo = cells(size, size, (x, y) => {
      const k = dist(x, y) / r;
      if (k <= 1.02) return 0;
      return Math.max(0, 1 - (k - 1) / 0.75) * 0.42;
    });
    return { core, halo, rim };
  }, [size]);

  return (
    <svg
      aria-hidden
      focusable="false"
      width={size * cell}
      height={size * cell}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <path d={halo} fill="var(--color-flare)" opacity="0.55" />
      <path d={core} fill="var(--color-ember)" />
      <path d={rim} fill="var(--color-flare)" />
    </svg>
  );
});

/**
 * A dithered band: density ramps from `from` at the top to `to` at the
 * bottom, with a soft horizontal falloff toward both ends. For horizons
 * and glows behind type.
 */
export const DitherBand = memo(function DitherBand({
  cols = 160,
  rows = 28,
  cell = 4,
  from = 0,
  to = 0.85,
  color = "var(--color-lilac)",
  className = "",
}: {
  cols?: number;
  rows?: number;
  cell?: number;
  from?: number;
  to?: number;
  color?: string;
  className?: string;
}) {
  const d = useMemo(
    () =>
      cells(cols, rows, (x, y) => {
        const v = from + (to - from) * (y / Math.max(1, rows - 1));
        const edge = Math.min(x, cols - 1 - x) / (cols * 0.22);
        return v * Math.min(1, edge);
      }),
    [cols, rows, from, to]
  );
  return (
    <svg
      aria-hidden
      focusable="false"
      width={cols * cell}
      height={rows * cell}
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
    >
      <path d={d} fill={color} />
    </svg>
  );
});

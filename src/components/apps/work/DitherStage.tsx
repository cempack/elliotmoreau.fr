"use client";

import { useEffect, useRef } from "react";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** cheap deterministic hash → [0, 1) for star placement (no Math.random) */
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type RGB = [number, number, number];

/** inks from deepest to brightest; level 0 stays transparent */
const TONES: Record<"ion" | "lilac", RGB[]> = {
  ion: [
    [16, 24, 44],
    [21, 37, 66],
    [27, 55, 92],
    [36, 78, 118],
  ],
  lilac: [
    [22, 19, 46],
    [33, 27, 70],
    [48, 37, 98],
    [66, 52, 128],
  ],
};

/**
 * A dithered pool of light, painted once (and again only when its box
 * changes size): an ordered Bayer 4×4 dither over a soft radial falloff,
 * chunky pixels, a few still stars. The stage a project's PixelPlanet
 * sits on. Static: it never animates.
 */
export function DitherStage({
  tone = "ion",
  cell = 4,
  className = "",
}: {
  tone?: "ion" | "lilac";
  /** CSS px per pixel */
  cell?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const inks = TONES[tone];
    let lastKey = "";
    const paint = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 4 || h < 4) return;
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const key = `${cols}x${rows}`;
      if (key === lastKey) return;
      lastKey = key;
      canvas.width = cols;
      canvas.height = rows;
      const img = ctx.createImageData(cols, rows);
      const d = img.data;
      const cx = cols * 0.5;
      const cy = rows * 0.5;
      const rx = cols * 0.62;
      const ry = rows * 0.62;
      const levels = inks.length;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          const dist = Math.sqrt(nx * nx + ny * ny);
          const v = Math.max(0, 1 - dist) ** 1.35;
          const lvl = Math.min(levels, Math.floor(v * levels + bayer(x, y)));
          const i = (y * cols + x) * 4;
          if (lvl > 0) {
            const c = inks[lvl - 1];
            d[i] = c[0];
            d[i + 1] = c[1];
            d[i + 2] = c[2];
            d[i + 3] = 255;
          }
          // a sparse, still starfield in the dark outer ring
          const s = hash(x, y);
          if (lvl < 2 && s < 0.006) {
            const bright = s < 0.0015;
            d[i] = bright ? 245 : 145;
            d[i + 1] = bright ? 242 : 150;
            d[i + 2] = bright ? 236 : 166;
            d[i + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [tone, cell]);

  return <canvas ref={ref} aria-hidden className={`app-work-dither ${className}`} />;
}

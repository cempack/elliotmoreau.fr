"use client";

import { GLYPH_H, WORDMARK_LINES, rasterizePixelLine } from "@/lib/pixelword";
import { PixelWordmark } from "@/components/PixelWordmark";
import type { Rect } from "./physics";

/**
 * Where the letters sit inside a HeroNameFx box of w × h px: the same
 * stamping it does (8 px cells, two lines as big as fit, centred), so a
 * click or a hover can tell the name from the empty field around it.
 */
export function letterRects(w: number, h: number): Rect[] {
  const cols = Math.max(44, Math.min(150, Math.round(w / 8)));
  const rows = Math.max(30, Math.min(80, Math.round(h / 8)));
  const lines = WORDMARK_LINES.map((l) => rasterizePixelLine(l));
  const nativeW = Math.max(...lines.map((l) => l.cols));
  const gapFor = (s: number) => Math.max(2, Math.round(s * 0.85));
  let s = Math.max(1, Math.floor((cols * 0.97) / nativeW));
  while (s > 1 && 2 * GLYPH_H * s + gapFor(s) > rows) s--;
  const top = Math.floor((rows - (2 * GLYPH_H * s + gapFor(s))) / 2);
  const cx = w / cols;
  const cy = h / rows;
  return lines.map((line, i) => {
    const y0 = top + i * (GLYPH_H * s + gapFor(s));
    const x0 = Math.floor((cols - line.cols * s) / 2);
    return {
      left: x0 * cx,
      top: y0 * cy,
      right: (x0 + line.cols * s) * cx,
      bottom: (y0 + GLYPH_H * s) * cy,
    };
  });
}

/**
 * The wordmark at rest: exactly what HeroNameFx paints before its canvas
 * takes over (same boxes, same SSR pixel wordmark), so the server HTML and
 * the reduced-motion page show the name with no live loop, no heading and
 * no tooltip of its own, and the hand-over to the live field is seamless.
 */
export function StillWordmark() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <div className="absolute inset-0 flex items-center justify-center">
          <PixelWordmark className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}

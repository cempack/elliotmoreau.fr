"use client";

import { memo } from "react";

/**
 * Tiny 3x5 pixel micro-label rendered as crisp SVG rects.
 * Original glyph set for this site; used for kickers and eyebrows.
 */
export const PIXEL_GLYPHS: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "010", "001"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["000", "000", "000", "000", "010"],
  ",": ["000", "000", "000", "010", "100"],
  "'": ["010", "010", "000", "000", "000"],
  "/": ["001", "001", "010", "100", "100"],
  ":": ["000", "010", "000", "010", "000"],
  "-": ["000", "000", "111", "000", "000"],
};

const W = 3;
const H = 5;
const TRACKING = 1;
const SPACE_W = 2;

type Props = {
  text: string;
  /** Size of one pixel in CSS px. */
  cell?: number;
  className?: string;
};

/** Fold accents onto their base letter — pixel caps never had diacritics. */
export const PIXEL_FOLD: Record<string, string> = {
  À: "A",
  Á: "A",
  Â: "A",
  Ä: "A",
  Ç: "C",
  È: "E",
  É: "E",
  Ê: "E",
  Ë: "E",
  Î: "I",
  Ï: "I",
  Ô: "O",
  Ö: "O",
  Ù: "U",
  Û: "U",
  Ü: "U",
  Ÿ: "Y",
};

/** Crisp pixel micro-label. Pure SVG, no fonts, SSR-safe. */
export const PixelLabel = memo(function PixelLabel({ text, cell = 3, className }: Props) {
  const rects: { x: number; y: number }[] = [];
  let x = 0;
  for (const raw of text.toUpperCase()) {
    const ch = PIXEL_FOLD[raw] ?? raw;
    if (ch === " ") {
      x += SPACE_W + TRACKING;
      continue;
    }
    const glyph = PIXEL_GLYPHS[ch];
    if (!glyph) {
      x += W + TRACKING;
      continue;
    }
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (glyph[r][c] === "1") rects.push({ x: x + c, y: r });
      }
    }
    x += W + TRACKING;
  }
  const width = Math.max(0, x - TRACKING);
  if (width === 0) return null;
  return (
    <svg
      role="img"
      aria-label={text}
      width={width * cell}
      height={H * cell}
      viewBox={`0 0 ${width} ${H}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
      aria-hidden={false}
    >
      {rects.map((rc) => (
        <rect key={`${rc.x}-${rc.y}`} x={rc.x} y={rc.y} width={1} height={1} />
      ))}
    </svg>
  );
});

import { SNAPSHOT_THEME, artPalette, mix, type ArtPalette } from "./theme";

/**
 * Hand-drawn bold pixel wordmark ("Elliot Moreau").
 * Original variable-width glyphs for this site — '#' is ink, '.' is empty.
 * Strokes run two pixels thick, omarchy-style; capitals run full height,
 * x-height letters live in rows 2-6.
 */
const GLYPHS: Record<string, string[]> = {
  E: [
    "######",
    "##....",
    "##....",
    "#####.",
    "##....",
    "##....",
    "######",
  ],
  M: [
    "##...##",
    "###.###",
    "#######",
    "##...##",
    "##...##",
    "##...##",
    "##...##",
  ],
  a: [
    "......",
    "......",
    ".####.",
    "....##",
    ".#####",
    "##..##",
    ".####.",
  ],
  e: [
    "......",
    ".####.",
    "##..##",
    "##..##",
    "######",
    "##....",
    ".####.",
  ],
  i: [
    "##.",
    "...",
    "##.",
    "##.",
    "##.",
    "##.",
    "##.",
  ],
  m: [
    "........",
    "........",
    "#######.",
    "##.##.##",
    "##.##.##",
    "##.##.##",
    "##.##.##",
  ],
  s: [
    "......",
    "......",
    ".#####",
    "##....",
    ".####.",
    "....##",
    "#####.",
  ],
  l: [
    "##.",
    "##.",
    "##.",
    "##.",
    "##.",
    "##.",
    "##.",
  ],
  o: [
    "......",
    "......",
    ".####.",
    "##..##",
    "##..##",
    "##..##",
    ".####.",
  ],
  r: [
    "......",
    "......",
    "#####.",
    "##.###",
    "##....",
    "##....",
    "##....",
  ],
  t: [
    "..##..",
    "..##..",
    "######",
    "..##..",
    "..##..",
    "..##..",
    "..##..",
  ],
  u: [
    "......",
    "......",
    "##..##",
    "##..##",
    "##..##",
    "##..##",
    ".####.",
  ],
};

export const GLYPH_H = 7;
const TRACKING = 1;
const SPACE_W = 4;

export type PixelLine = { grid: Uint8Array; cols: number; rows: number };

/** Rasterize one line into a 1-bit grid (row-major). Unknown chars are skipped. */
export function rasterizePixelLine(text: string): PixelLine {
  const rows = GLYPH_H;
  const items = [...text].map((ch) => {
    if (ch === " ") return { w: SPACE_W, glyph: null as string[] | null };
    const glyph = GLYPHS[ch] ?? null;
    return { w: glyph ? glyph[0].length : SPACE_W, glyph };
  });
  const cols = Math.max(
    0,
    items.reduce((n, it) => n + it.w + TRACKING, 0) - TRACKING
  );
  const grid = new Uint8Array(Math.max(1, cols * rows));
  let x = 0;
  for (const { w, glyph } of items) {
    if (glyph) {
      for (let r = 0; r < rows; r++) {
        const row = glyph[r] ?? "";
        for (let c = 0; c < w && c < row.length; c++) {
          if (row[c] === "#") grid[r * cols + x + c] = 1;
        }
      }
    }
    x += w + TRACKING;
  }
  return { grid, cols, rows };
}

/** The OS's own name, as the boot screen and the emOS menu draw it. */
export const EMOS_LINES = ["emos"] as const;

/* Canonical wordmark band stack, in omarchy's laser-band proportions,
 * wearing the theme's inks: a paper-white crest, the signal band, a
 * signal-to-ion seafoam middle cooling into lilac, and a deep foot that
 * sinks into the night.
 * Both the canvas engine and the SSR wordmark read these, so first paint
 * and live frames wear one gradient: pass both the same palette. */
const BAND_COUNTS = [5, 3, 4, 3, 4] as const;
export type WordmarkBands = [number, string][];

/** The band stack in a palette's inks (counts are fixed). */
export function wordmarkBands(p: ArtPalette): WordmarkBands {
  const cool = mix(p.ion, p.lilac, 0.35);
  const inks = [p.paper, p.signal, mix(p.signal, p.ion, 0.7), mix(cool, p.ink900, 0.25), mix(cool, p.ink900, 0.62)];
  return BAND_COUNTS.map((n, k) => [n, inks[k]] as [number, string]);
}

/** The stack in the snapshot theme's inks: the default where no palette is passed. */
export const WORDMARK_BANDS: WordmarkBands = wordmarkBands(artPalette(SNAPSHOT_THEME.tokens));
export const WORDMARK_BAND_ROWS = BAND_COUNTS.reduce<number>((n, c) => n + c, 0);

/** Fractional position 0..1 (top → bottom of the band span) → band index. */
export function bandIndexFor(f: number): number {
  const clamped = Math.max(0, Math.min(1, f));
  return Math.min(WORDMARK_BAND_ROWS - 1, Math.floor(clamped * WORDMARK_BAND_ROWS));
}

/** Ink for a band index (clamped to the foot for out-of-range input), from
    `bands` (wordmarkBands(palette)) or the snapshot stack. */
export function bandInk(band: number, bands: WordmarkBands = WORDMARK_BANDS): string {
  let acc = 0;
  for (const [count, ink] of bands) {
    acc += count;
    if (band < acc) return ink;
  }
  return bands[bands.length - 1][1];
}

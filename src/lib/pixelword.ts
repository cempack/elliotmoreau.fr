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

export const WORDMARK_LINES = ["Elliot", "Moreau"] as const;

/* Canonical wordmark band stack, in omarchy's laser-band proportions,
 * wearing Moss inks: a paper-white crest, the signal-lime band, a
 * lime-to-ion seafoam middle cooling into lilac, and an indigo foot that
 * sinks into the night.
 * Both the canvas engine and the SSR wordmark read these, so first paint
 * and live frames wear one gradient. */
export const WORDMARK_BANDS: [number, string][] = [
  [5, "#EBE9E1"],
  [3, "#B0CC86"],
  [4, "#8FC2A8"],
  [3, "#6F8FA0"],
  [4, "#3B4F5A"],
];
export const WORDMARK_BAND_ROWS = WORDMARK_BANDS.reduce((n, [c]) => n + c, 0);

/** Fractional position 0..1 (top → bottom of the band span) → band index. */
export function bandIndexFor(f: number): number {
  const clamped = Math.max(0, Math.min(1, f));
  return Math.min(WORDMARK_BAND_ROWS - 1, Math.floor(clamped * WORDMARK_BAND_ROWS));
}

/** Ink for a band index (clamped to the foot for out-of-range input). */
export function bandInk(band: number): string {
  let acc = 0;
  for (const [count, ink] of WORDMARK_BANDS) {
    acc += count;
    if (band < acc) return ink;
  }
  return WORDMARK_BANDS[WORDMARK_BANDS.length - 1][1];
}

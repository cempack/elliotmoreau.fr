import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getDict, type Locale } from "@/i18n";
import { SITE_URL, localePath } from "@/i18n/config";
import { GLYPH_H, bandIndexFor, bandInk, rasterizePixelLine } from "@/lib/pixelword";
import { SNAPSHOT_THEME, artPalette } from "@/lib/theme";
import { getTheme } from "@/lib/theme-source";

/**
 * emOS share images and app icons, drawn for ImageResponse (Satori +
 * resvg): a night sky with pixel stars, a dithered horizon glow and two
 * stepped ridges; the pixel wordmark in its laser bands and voxel relief
 * (the same geometry as PixelWordmark); each app's 16×16 Dock glyph on its
 * tinted squircle; and the emOS mark. Everything pixel is integer-sized
 * rects with crisp edges, so nothing blurs. Every colour is the live
 * theme's (the same tones as the site's pixel art): each card and icon
 * reads it first (withTheme), so a theme change recolours them too.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export type OgApp = "work" | "writing" | "atlas" | "now" | "contact";

const W = OG_SIZE.width;
const H = OG_SIZE.height;

/** the theme's pixel-art tones: the snapshot until withTheme() has read the live theme */
const C = { ...artPalette(SNAPSHOT_THEME.tokens) };

/** read the live theme into C (every card and icon starts here) */
async function withTheme() {
  try {
    Object.assign(C, artPalette((await getTheme()).tokens));
  } catch {
    // the snapshot stands
  }
}

/** the night the cards are set in, from the theme's darkest inks to its night */
const sky = () => `linear-gradient(180deg, ${mix(C.ink950, "#000000", 0.55)} 0%, ${mix(C.ink950, C.night, 0.55)} 54%, ${C.night} 100%)`;

/* ───────────────────────────── fonts ───────────────────────────── */

type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" };
let fontsPromise: Promise<OgFont[]> | null = null;

async function font(file: Promise<Buffer>, name: string, weight: 500 | 600): Promise<OgFont | null> {
  try {
    const b = await file;
    return { name, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight, style: "normal" };
  } catch {
    return null; // the default font stands in
  }
}

/** Inter Display SemiBold, Inter Medium, JetBrains Mono Medium (subset TTFs, OFL; see src/assets/og). */
function loadFonts() {
  fontsPromise ??= Promise.all([
    font(readFile(join(process.cwd(), "src/assets/og/InterDisplay-SemiBold.ttf")), "Inter Display", 600),
    font(readFile(join(process.cwd(), "src/assets/og/Inter-Medium.ttf")), "Inter", 500),
    font(readFile(join(process.cwd(), "src/assets/og/JetBrainsMono-Medium.ttf")), "JetBrains Mono", 500),
  ]).then((list) => list.filter((f): f is OgFont => f != null));
  return fontsPromise;
}

/* ───────────────────────────── helpers ───────────────────────────── */

type Rect = { x: number; y: number; w: number; h: number; fill: string; o?: number };

function rects(list: Rect[], key: string) {
  return list.map((r, i) => (
    <rect key={`${key}${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} fillOpacity={r.o} />
  ));
}

/** deterministic PRNG: the same sky on every build */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────────── the sky ───────────────────────────── */

type Box = { x: number; y: number; w: number; h: number };
const inBox = (x: number, y: number, b: Box) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Stars, a dithered horizon glow and two stepped ridges. `quiet` boxes
    (where text sits) only get the faintest stars. */
function Scenery({ seed, quiet }: { seed: number; quiet: Box[] }) {
  const rnd = mulberry32(seed);
  const P = 3; // star pixel
  const stars: Rect[] = [];
  const tints = [C.paper, C.paper, C.paper, C.ion, C.lilac, C.ember];
  for (let i = 0; i < 150; i++) {
    const x = Math.floor((rnd() * W) / P) * P;
    const y = Math.floor((rnd() * (H - 150)) / P) * P;
    const fill = tints[Math.floor(rnd() * tints.length)];
    const hush = quiet.some((b) => inBox(x, y, b));
    const o = hush ? 0.14 + rnd() * 0.12 : 0.28 + rnd() * 0.6;
    stars.push({ x, y, w: P, h: P, fill, o });
  }
  // a few sparkles: a lit centre with four arms
  const sparkles: Rect[] = [];
  for (let i = 0; i < 7; i++) {
    const x = Math.floor((rnd() * W) / P) * P;
    const y = Math.floor((rnd() * (H - 200)) / P) * P;
    if (quiet.some((b) => inBox(x, y, b))) continue;
    const fill = i % 3 === 0 ? C.ion : C.paper;
    sparkles.push({ x, y, w: P, h: P, fill, o: 1 });
    sparkles.push({ x: x - P, y, w: P, h: P, fill, o: 0.55 });
    sparkles.push({ x: x + P, y, w: P, h: P, fill, o: 0.55 });
    sparkles.push({ x, y: y - P, w: P, h: P, fill, o: 0.55 });
    sparkles.push({ x, y: y + P, w: P, h: P, fill, o: 0.55 });
  }

  // horizon glow: 4px Bayer dither, denser toward the ridges
  const D = 4;
  const glow: Rect[] = [];
  const g0 = Math.floor((H - 128) / D) * D;
  for (let y = g0; y < H; y += D) {
    const t = (y - g0) / (H - g0);
    let x = 0;
    while (x < W) {
      const on = BAYER4[(y / D) % 4][(x / D) % 4] / 16 < t * 0.66;
      if (!on) {
        x += D;
        continue;
      }
      // merge runs to keep the node count down
      let w = D;
      while (x + w < W && BAYER4[(y / D) % 4][((x + w) / D) % 4] / 16 < t * 0.66) w += D;
      glow.push({ x, y, w, h: D, fill: mix(C.night, C.signal, 0.32), o: 0.85 });
      x += w;
    }
  }

  // ridges: stepped columns, far then near
  const S = 6;
  const ridge = (base: number, amp: number, f: number, phase: number, fill: string): Rect[] => {
    const out: Rect[] = [];
    for (let x = 0; x < W; x += S) {
      const u = x / W;
      const h =
        amp * (0.55 * Math.sin(u * f + phase) + 0.3 * Math.sin(u * f * 2.3 + phase * 1.7) + 0.15 * Math.sin(u * f * 5.1 + phase * 0.6));
      const top = Math.round((base - h) / S) * S;
      out.push({ x, y: top, w: S, h: H - top, fill });
    }
    return out;
  };
  const far = ridge(H - 52, 34, 7.5, 1.3, mix(C.ink900, C.night, 0.5));
  const near = ridge(H - 22, 20, 11, 4.1, C.ink950);
  // a few village lights on the near ridge
  const lights: Rect[] = [];
  for (let i = 0; i < 9; i++) {
    const col = near[Math.floor(rnd() * near.length)];
    lights.push({ x: col.x + 1, y: col.y + 6 + Math.floor(rnd() * 3) * 3, w: 3, h: 3, fill: C.ember, o: 0.55 + rnd() * 0.4 });
  }

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {rects(glow, "g")}
      {rects(stars, "s")}
      {rects(sparkles, "k")}
      {rects(far, "f")}
      {rects(near, "n")}
      {rects(lights, "l")}
    </svg>
  );
}

/** a pixel crescent, the wallpaper's moon */
function Moon({ x, y, cell = 6 }: { x: number; y: number; cell?: number }) {
  const R = 6;
  const out: Rect[] = [];
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const inMoon = i * i + j * j <= R * R;
      const inBite = (i - 3) * (i - 3) + (j + 1.5) * (j + 1.5) <= (R - 0.5) * (R - 0.5);
      if (inMoon && !inBite) {
        out.push({ x: (i + R) * cell, y: (j + R) * cell, w: cell, h: cell, fill: i < -3 ? C.emberLight : C.ember });
      }
    }
  }
  const size = (R * 2 + 1) * cell;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      style={{ position: "absolute", left: x, top: y }}
    >
      {rects(out, "m")}
    </svg>
  );
}

/* ─────────────────────────── the wordmark ─────────────────────────── */

const SOLID_FAR = "#0B100E";
const SOLID_NEAR = "#1D2B27";
const TOP_FACE = "#FBF9F4";

/** The pixel wordmark as rects: band inks, voxel relief and lit lips,
    exactly as PixelWordmark draws it (one or two lines). */
function Wordmark({
  lines,
  cell,
  x = 0,
  y = 0,
  inline = false,
}: {
  lines: string[];
  cell: number;
  /** where the ink starts (the relief reaches 3 cells beyond it) */
  x?: number;
  y?: number;
  /** in the flow (relief padding pulled back with negative margins) */
  inline?: boolean;
}) {
  const GAP = 2;
  const rows = lines.map((l) => rasterizePixelLine(l));
  const width = Math.max(...rows.map((r) => r.cols));
  const height = lines.length * GLYPH_H + (lines.length - 1) * GAP;
  const span = lines.length * GLYPH_H + (lines.length - 1);
  const pitch = GLYPH_H + 1;
  const occ = new Uint8Array(width * height);
  // a left-aligned lockup: both lines start at the same column
  const offs = rows.map((_, li) => ({ ox: 0, oy: li * (GLYPH_H + GAP) }));
  rows.forEach((r, li) => {
    for (let ry = 0; ry < GLYPH_H; ry++)
      for (let c = 0; c < r.cols; c++) if (r.grid[ry * r.cols + c]) occ[(offs[li].oy + ry) * width + offs[li].ox + c] = 1;
  });
  // open air, flooded from the borders (counters get no relief)
  const sky = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let c = 0; c < width; c++) stack.push(c, (height - 1) * width + c);
  for (let r = 0; r < height; r++) stack.push(r * width, r * width + width - 1);
  while (stack.length) {
    const i = stack.pop() as number;
    if (i < 0 || i >= width * height || sky[i] || occ[i]) continue;
    sky[i] = 1;
    const cc = i % width;
    const rr = (i / width) | 0;
    if (cc > 0) stack.push(i - 1);
    if (cc < width - 1) stack.push(i + 1);
    if (rr > 0) stack.push(i - width);
    if (rr < height - 1) stack.push(i + width);
  }
  const isSky = (gx: number, gy: number) => gx < 0 || gx >= width || gy < 0 || gy >= height || sky[gy * width + gx] === 1;
  const far: Rect[] = [];
  const near: Rect[] = [];
  const faces: Rect[] = [];
  const lips: Rect[] = [];
  const P = 3; // relief padding, cells
  rows.forEach((r, li) => {
    const { ox, oy } = offs[li];
    for (let ry = 0; ry < GLYPH_H; ry++) {
      const fill = bandInk(bandIndexFor((li * pitch + ry) / (span - 1)));
      for (let c = 0; c < r.cols; c++) {
        if (!r.grid[ry * r.cols + c]) continue;
        const gx = ox + c;
        const gy = oy + ry;
        const px = (gx + P) * cell;
        const py = (gy + P) * cell;
        faces.push({ x: px, y: py, w: cell, h: cell, fill });
        if (isSky(gx + 2, gy - 2)) far.push({ x: px + Math.round(1.6 * cell), y: py - 2 * cell, w: cell, h: cell, fill: SOLID_FAR });
        if (isSky(gx + 1, gy - 1)) near.push({ x: px + Math.round(0.8 * cell), y: py - cell, w: cell, h: cell, fill: SOLID_NEAR });
        if (isSky(gx, gy - 1)) lips.push({ x: px, y: py, w: cell, h: Math.max(1, Math.round(cell / 2)), fill: TOP_FACE, o: 0.85 });
      }
    }
  });
  const vw = (width + P * 2) * cell;
  const vh = (height + P * 2) * cell;
  return (
    <svg
      width={vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
      shapeRendering="crispEdges"
      style={
        inline
          ? { display: "flex", margin: -P * cell }
          : { position: "absolute", left: x - P * cell, top: y - P * cell }
      }
    >
      {rects(far, "f")}
      {rects(near, "n")}
      {rects(faces, "c")}
      {rects(lips, "l")}
    </svg>
  );
}

/* ───────────────────────────── the mark ───────────────────────────── */

/** The emOS mark on a 16 grid (the menu bar's 9×9 tile, with two-pixel
    strokes): "#" the accent tile, "e" the letter, "." transparent corner. */
export const MARK16 = [
  "..############..",
  ".##############.",
  "################",
  "#####eeeeee#####",
  "#####eeeeee#####",
  "###ee######ee###",
  "###ee######ee###",
  "###eeeeeeeeee###",
  "###eeeeeeeeee###",
  "###ee###########",
  "###ee###########",
  "#####eeeeeeee###",
  "#####eeeeeeee###",
  "################",
  ".##############.",
  "..############..",
];

function markRects(cell: number, ox = 0, oy = 0, letter: string = C.ink950): Rect[] {
  const out: Rect[] = [];
  MARK16.forEach((row, y) => {
    let x = 0;
    while (x < 16) {
      const ch = row[x];
      let w = 1;
      while (x + w < 16 && row[x + w] === ch) w++;
      if (ch !== ".") out.push({ x: ox + x * cell, y: oy + y * cell, w: w * cell, h: cell, fill: ch === "#" ? C.signal : letter });
      x += w;
    }
  });
  return out;
}

function Mark({ size }: { size: number }) {
  const cell = Math.max(1, Math.floor(size / 16));
  const s = cell * 16;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} shapeRendering="crispEdges" style={{ display: "flex" }}>
      {rects(markRects(cell), "m")}
    </svg>
  );
}

/* ─────────────────────────── app glyphs ─────────────────────────── */

type Glyph = { pal: Record<string, string>; rows: readonly string[] };

/* the Dock's 16×16 app glyphs (components/os/icons.tsx), copied: that
   module is client-only */
const glyphs = (): Record<OgApp | "home", Glyph> => ({
  home: {
    pal: { W: C.paper, n: C.night, E: C.ember, Y: C.emberLight, S: C.signal, s: C.signalDeep, F: C.flare },
    rows: [
      "................",
      "................",
      ".WWWWWWWWWWWWWW.",
      ".WFWEWSWWWWWWWW.",
      ".WWWWWWWWWWWWWW.",
      ".WnnnnnnnnnnnnW.",
      ".WnWnnnnEEEnnnW.",
      ".WnnnnnEYEEEnnW.",
      ".WnnnnnEEEEEnnW.",
      ".WSSnnnEEEEEnnW.",
      ".WSSSSnnEEESSSW.",
      ".WsSSSSSSSSSSSW.",
      ".WsssSSSSSSsssW.",
      ".WWWWWWWWWWWWWW.",
      "................",
      "................",
    ],
  },
  work: {
    pal: { d: C.ionDeep, I: C.ion, J: C.ionLight, w: C.paper, k: C.ink900 },
    rows: [
      "................",
      "................",
      ".ddddd..........",
      ".dddddddddddddd.",
      ".ddwwwwwwwwwwdd.",
      ".JJJJJJJJJJJJJJ.",
      ".IIIIIIIIIIIIII.",
      ".IIIIkIIIkIkIII.",
      ".IIIkIIIIkIIkII.",
      ".IIkIIIIkIIIIkI.",
      ".IIIkIIkIIIIkII.",
      ".IIIIkIkIIIkIII.",
      ".IIIIIIIIIIIIII.",
      ".dddddddddddddd.",
      "................",
      "................",
    ],
  },
  writing: {
    pal: { W: C.paper, g: C.paper3, F: C.flare, E: C.ember, e: C.emberDeep, k: C.ink900, w: C.paper },
    rows: [
      "................",
      "..k.k.k.k.......",
      ".WkWkWkWkWW.kk..",
      ".WWWWWWWWWWkFFk.",
      ".WWFggggggkEEk..",
      ".WWFWWWWWkEEk...",
      ".WWFggggkEEk....",
      ".WWFWWWkEEk.....",
      ".WWFggkwwk......",
      ".WWFWWkWk.......",
      ".WWFWWkk........",
      ".WWFWWWWWW......",
      ".WWFWWWWWW......",
      ".WWWWWWWWW......",
      "................",
      "................",
    ],
  },
  atlas: {
    pal: { L: C.lilac, l: C.lilacDeep, S: C.signal, F: C.flare, W: C.paper },
    rows: [
      "..........FFF...",
      ".........FWFFF..",
      ".........FFFFF..",
      ".....LLLL.FFF...",
      "...LWSSLLLLF....",
      "..LSSSSLLSSW....",
      "..LLSSLLSSSl....",
      ".LLLSLLLSSSLl...",
      ".LLLLSLLSSLll...",
      ".LLLLSSLLSSll...",
      ".LLLLSSLLSlll...",
      "..LLLSSLLLll....",
      "..LLLLSLLlll....",
      "...LLLLllll.....",
      ".....llll.......",
      "................",
    ],
  },
  now: {
    pal: { F: C.flare, E: C.ember, S: C.signal, W: C.paper },
    rows: [
      "................",
      "................",
      "................",
      "..........FF....",
      "..........FF....",
      "....FF....FF....",
      "....FF....FF....",
      "....FF.FF.FF....",
      "....EE.EE.EE.EE.",
      ".EE.EE.EE.EE.EE.",
      ".EE.EE.EE.EE.EE.",
      ".SS.SS.SS.SS.SS.",
      ".SS.SS.SS.SS.SS.",
      ".SS.SS.SS.SS.SS.",
      "................",
      "................",
    ],
  },
  contact: {
    pal: { W: C.paper, w: C.paper2, g: C.paper3, S: C.signal, s: C.signalDeep },
    rows: [
      "................",
      "................",
      "................",
      ".WWWWWWWWWWWWWW.",
      ".gWWWWWWWWWWWWg.",
      ".wgWWWWWWWWWWgw.",
      ".wwgWWWWWWWWgww.",
      ".wwwgWWWWWWgwww.",
      ".wwwwgWSSWgwwww.",
      ".wwwwwSSSSwwwww.",
      ".wwwwwsSSswwwww.",
      ".wwwwwwsswwwwww.",
      ".gggggggggggggg.",
      "................",
      "................",
      "................",
    ],
  },
});

const accentOf = (app: OgApp | "home") =>
  ({ home: C.signal, work: C.ion, writing: C.ember, atlas: C.lilac, now: C.flare, contact: C.signal })[app];

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(m(16))}${hex(m(8))}${hex(m(0))}`;
}

/** iOS-style continuous-corner squircle (the Dock tiles' curve) */
function squircle(size: number, inset = 0) {
  const a = inset;
  const b = size - inset;
  const p = (b - a) * 0.34;
  const h = p * 0.3;
  const f = (n: number) => +n.toFixed(2);
  return (
    `M${f(a + p)} ${f(a)}H${f(b - p)}` +
    `C${f(b - h)} ${f(a)} ${f(b)} ${f(a + h)} ${f(b)} ${f(a + p)}V${f(b - p)}` +
    `C${f(b)} ${f(b - h)} ${f(b - h)} ${f(b)} ${f(b - p)} ${f(b)}H${f(a + p)}` +
    `C${f(a + h)} ${f(b)} ${f(a)} ${f(b - h)} ${f(a)} ${f(b - p)}V${f(a + p)}` +
    `C${f(a)} ${f(a + h)} ${f(a + h)} ${f(a)} ${f(a + p)} ${f(a)}Z`
  );
}

/** The app's pixel glyph on its tinted squircle, with a soft accent halo. */
function AppTile({
  app,
  size,
  x,
  y,
  halo: withHalo = true,
}: {
  app: OgApp | "home";
  size: number;
  x: number;
  y: number;
  halo?: boolean;
}) {
  const g = glyphs()[app];
  const accent = accentOf(app);
  const cell = Math.floor((size * 0.7) / 16);
  const gp = cell * 16;
  const off = Math.round((size - gp) / 2);
  const halo = withHalo ? size * 0.9 : Math.ceil(size * 0.12);
  const box = size + halo * 2;
  const runs: Rect[] = [];
  const shadow: Rect[] = [];
  g.rows.forEach((row, ry) => {
    let cx = 0;
    while (cx < 16) {
      const ch = row[cx];
      let w = 1;
      while (cx + w < 16 && row[cx + w] === ch) w++;
      if (ch !== ".") {
        runs.push({ x: halo + off + cx * cell, y: halo + off + ry * cell, w: w * cell, h: cell, fill: g.pal[ch] ?? C.paper });
        shadow.push({ x: halo + off + cx * cell, y: halo + off + (ry + 1) * cell, w: w * cell, h: cell, fill: C.ink950, o: 0.42 });
      }
      cx += w;
    }
  });
  const shape = squircle(size);
  return (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      style={{ position: "absolute", left: x - halo, top: y - halo }}
    >
      <defs>
        <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={accent} stopOpacity="0.3" />
          <stop offset="0.45" stopColor={accent} stopOpacity="0.08" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(C.ink600, accent, 0.25)} />
          <stop offset="1" stopColor={mix(C.ink900, accent, 0.09)} />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="1.12" r="0.78">
          <stop offset="0" stopColor={accent} stopOpacity="0.34" />
          <stop offset="0.6" stopColor={accent} stopOpacity="0.1" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.035" />
          <stop offset="0.62" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.22" stopColor="#ffffff" stopOpacity="0.13" />
          <stop offset="0.65" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="1" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {withHalo && <circle cx={box / 2} cy={box / 2} r={box / 2} fill="url(#halo)" />}
      <g transform={`translate(${halo} ${halo + size * 0.06})`}>
        <path d={shape} fill="#000000" fillOpacity="0.45" />
      </g>
      <g transform={`translate(${halo} ${halo})`}>
        <path d={shape} fill="url(#bg)" />
        <path d={shape} fill="url(#glow)" />
      </g>
      <g shapeRendering="crispEdges">
        {rects(shadow, "s")}
        {rects(runs, "r")}
      </g>
      <g transform={`translate(${halo} ${halo})`}>
        <path d={shape} fill="url(#spec)" />
        <path d={squircle(size, 1)} fill="none" stroke="url(#rim)" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** The Dock, in miniature: the six app tiles on a dark glass shelf, a
    dot in the accent under the app the card is about. */
const DOCK_APPS: (OgApp | "home")[] = ["home", "work", "writing", "atlas", "now", "contact"];

function MiniDock({ active }: { active: OgApp | "home" }) {
  const tile = 50;
  const gap = 12;
  const pad = 12;
  const w = DOCK_APPS.length * tile + (DOCK_APPS.length - 1) * gap + pad * 2;
  const h = tile + pad * 2;
  const x = Math.round((W - w) / 2);
  const y = H - h - 26;
  return (
    <>
      <svg width={w} height={h + 2} viewBox={`0 0 ${w} ${h + 2}`} style={{ position: "absolute", left: x, top: y }}>
        <defs>
          <linearGradient id="shelf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#262a3f" stopOpacity="0.82" />
            <stop offset="1" stopColor="#11131f" stopOpacity="0.86" />
          </linearGradient>
        </defs>
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={22} fill="url(#shelf)" stroke="#ffffff" strokeOpacity="0.14" />
        <rect x={22} y={1} width={w - 44} height={1} fill="#ffffff" fillOpacity="0.22" />
      </svg>
      {DOCK_APPS.map((a, i) => (
        <AppTile key={a} app={a} size={tile} x={x + pad + i * (tile + gap)} y={y + pad} halo={false} />
      ))}
      <svg
        width={4}
        height={4}
        viewBox="0 0 4 4"
        style={{ position: "absolute", left: x + pad + DOCK_APPS.indexOf(active) * (tile + gap) + tile / 2 - 2, top: y + h - 7 }}
      >
        <rect width={4} height={4} fill={C.signal} />
      </svg>
    </>
  );
}

/* ─────────────────────────── the cards ─────────────────────────── */

const MONO = "JetBrains Mono";
const SANS = "Inter";
const DISPLAY = "Inter Display";

function TopBar({ left, right }: { left: React.ReactNode; right: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: MONO,
        fontSize: 22,
        color: C.paper3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>{left}</div>
      <div style={{ display: "flex", color: C.paper2 }}>{right}</div>
    </div>
  );
}

const host = SITE_URL.replace(/^https?:\/\//, "");

/** Typographer's apostrophes for copy that arrives with straight ones
    ("d'Elliot" → "d’Elliot"): the cards and their alt text are set type. */
const curly = (text: string) => text.replace(/(\p{L})'(?=\p{L})/gu, "$1’");

/** For the set type on the cards: one- and two-letter words ("à", "La",
    "Et", "by") stay with the word after them, so no line ends on one. */
const bind = (text: string) => text.replace(/(?<=^|[\s«(])(\p{L}{1,2}) /gu, "$1\u00a0");

/** The home card: the wordmark is the hero, the meta description beneath. */
export async function homeCard(lang: Locale) {
  await withTheme();
  const t = getDict(lang).meta;
  const fonts = await loadFonts();
  const tagline = bind(curly(t.description));
  const cell = 14;
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, backgroundImage: sky() }}>
        <Scenery seed={7} quiet={[{ x: 60, y: 36, w: 1080, h: 56 }, { x: 60, y: 100, w: 760, h: 410 }]} />
        <Moon x={968} y={118} />
        <TopBar
          left={
            <>
              <Mark size={32} />
              <span style={{ marginLeft: 16, color: C.paper }}>emOS</span>
              <span style={{ marginLeft: 12 }}>26</span>
            </>
          }
          right={host + (lang === "fr" ? "/fr" : "")}
        />
        <Wordmark lines={["Elliot", "Moreau"]} cell={cell} x={80} y={122} />
        <div
          style={{
            position: "absolute",
            left: 80,
            top: 122 + 16 * cell + 34,
            width: 740,
            display: "flex",
            fontFamily: SANS,
            fontSize: 29,
            lineHeight: 1.38,
            color: C.paper2,
            textWrap: "balance",
          }}
        >
          {tagline}
        </div>
        <MiniDock active="home" />
      </div>
    ),
    { ...OG_SIZE, fonts }
  );
}

const APP_PATH: Record<OgApp, string> = {
  work: "/work",
  writing: "/writing",
  atlas: "/atlas",
  now: "/now",
  contact: "/contact",
};

/** An app's card: its Dock icon, its name in display type, its page description. */
export async function appCard(lang: Locale, app: OgApp) {
  await withTheme();
  const d = getDict(lang);
  const fonts = await loadFonts();
  const name = d.meta.pages[app];
  const description = bind(curly(d.meta.pageDescriptions[app]));
  const path = APP_PATH[app];
  const tile = 216;
  const nameSize = name.length > 9 ? 96 : 116;
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: W, height: H, backgroundImage: sky() }}>
        <Scenery seed={11 + path.length} quiet={[{ x: 60, y: 36, w: 1080, h: 56 }, { x: 60, y: 150, w: 1080, h: 330 }]} />
        <TopBar
          left={<Wordmark lines={["Elliot Moreau"]} cell={4} inline />}
          right={host + localePath(lang, path)}
        />
        <AppTile app={app} size={tile} x={80} y={196} />
        <div
          style={{
            position: "absolute",
            left: 80 + tile + 56,
            top: 178,
            width: W - (80 + tile + 56) - 72,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 24, color: accentOf(app) }}>~{path}</div>
          <div
            style={{
              display: "flex",
              marginTop: 6,
              fontFamily: DISPLAY,
              fontSize: nameSize,
              lineHeight: 1.02,
              letterSpacing: -nameSize * 0.035,
              color: C.paper,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontFamily: SANS,
              fontSize: 30,
              lineHeight: 1.38,
              color: C.paper2,
              textWrap: "balance",
            }}
          >
            {description}
          </div>
        </div>
        <MiniDock active={app} />
      </div>
    ),
    { ...OG_SIZE, fonts }
  );
}

/** Localized alt text for a card (generateImageMetadata). */
export function cardAlt(lang: Locale, app?: OgApp) {
  const d = getDict(lang);
  if (!app) return d.notfound.seo.homeAlt.replace("{tagline}", curly(d.meta.description));
  return d.notfound.seo.appAlt.replace("{app}", d.meta.pages[app]).replace("{description}", curly(d.meta.pageDescriptions[app]));
}

/* ───────────────────────────── icons ───────────────────────────── */

/** Browser-tab icon: the mark in the theme's accent, full bleed, its letter in ink so it
    reads on light and dark tab strips alike. */
export async function markIcon(size: number) {
  await withTheme();
  const cell = Math.max(1, Math.floor(size / 16));
  const s = cell * 16;
  const off = Math.floor((size - s) / 2);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
          {rects(markRects(cell, off, off), "m")}
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}

/** Home-screen icon (Apple touch, manifest): the menu bar's mark as it sits
    on the dark bar, the accent tile with its "e" cut through to the night,
    on a full-bleed ink field (iOS and Android cut their own corners). At
    ~52% the mark sits inside the maskable safe circle, so the 512 serves
    as both `any` and `maskable`. */
export async function tileIcon(size: number, letter = 0.62) {
  await withTheme();
  const cell = Math.max(1, Math.round((size * letter) / 16));
  const s = cell * 16;
  const o = Math.round((size - s) / 2);
  const mark = markRects(cell, o, o, mix(C.ink950, C.ink900, 0.5));
  // a one-cell bevel under the tile: the pixel art's own depth
  const drop = mark
    .filter((r) => r.fill === C.signal)
    .map((r) => ({ ...r, y: r.y + Math.max(1, Math.round(cell / 2)), fill: C.signalDeep, o: 0.6 }));
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          backgroundImage: `linear-gradient(180deg, ${mix(C.ink800, C.night, 0.5)} 0%, ${C.ink950} 100%)`,
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
          {rects(drop, "d")}
          {rects(mark, "m")}
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}

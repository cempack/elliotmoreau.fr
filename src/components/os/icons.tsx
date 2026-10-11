"use client";

import { useId } from "react";
import type { AppId } from "./apps";

/**
 * CONTRACT (owner: dock agent)
 * Pixel app icons: hand-drawn 16×16 cell maps rendered as crisp SVG rects
 * (shapeRendering crispEdges), sitting on a glass squircle tile tinted by
 * the app accent. `size` in CSS px. Decorative (aria-hidden): labels
 * live on the button/link.
 *
 * The cell size snaps to whole or half CSS px for the tile size you ask
 * for, so the pixels stay square and even at 28 (menu bar, Spotlight),
 * 32 (tab bar), 48 (dock) and 64–72 (magnified).
 */

export type IconId = AppId | "terminal" | "spotlight" | "more";

// Moss, plus a few shading tones derived from its accents.
const C = {
  paper: "#ebe9e1",
  paper2: "#bcc2ba",
  paper3: "#8f988f",
  ink950: "#0a0c0b",
  ink900: "#101311",
  ink800: "#161a17",
  ink700: "#1f2420",
  ink600: "#2b322d",
  ink500: "#3f4842",
  signal: "#b0cc86",
  signalDeep: "#86a35c",
  ion: "#89b4a8",
  ionLight: "#cdf6ff",
  ionDeep: "#3fb4dc",
  lilac: "#aea3c8",
  lilacDeep: "#7a68e6",
  ember: "#e0bd6e",
  emberDeep: "#e8893d",
  emberLight: "#ffe2b8",
  flare: "#e2786b",
  night: "#1d1a45",
} as const;

/** Tile tint per icon (the app accent); other agents can reuse it. */
export const ICON_ACCENT: Record<IconId, string> = {
  home: C.signal,
  work: C.ion,
  writing: C.ember,
  atlas: C.lilac,
  now: C.flare,
  contact: C.signal,
  terminal: C.paper3,
  spotlight: C.lilac,
  more: C.paper3,
};

type Glyph = {
  pal: Record<string, string>;
  rows: readonly string[];
  /** phosphor bloom around the cells, for the terminal */
  bloom?: string;
};

/* Each map is 16×16. "." is empty; every other character is a palette key.
   Shapes are centred on the 16 grid (even widths) and keep a one-cell
   margin so the drop shadow never clips. */
const GLYPHS: Record<IconId, Glyph> = {
  // Desktop: a window onto the emOS night, a low sun setting behind hills
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
  // Projects: a folder, a sheet peeking out, </> on the front
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
  // Writing: a spiral notepad with a French red margin, a pen across it
  writing: {
    pal: { W: C.paper, g: C.paper3, F: C.flare, E: C.ember, e: C.emberDeep, k: C.ink900 },
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
  // Atlas: a pixel globe, land and sea, with a map pin
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
  // Now: a live dot and a pixel level meter
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
  // Mail: an envelope sealed in lime
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
  // Terminal: a prompt and a cursor, with phosphor glow
  terminal: {
    pal: { S: C.signal, W: C.paper },
    bloom: C.signal,
    rows: [
      "................",
      "................",
      "................",
      "................",
      "..SS............",
      "...SS...........",
      "....SS..........",
      ".....SS.........",
      "....SS..........",
      "...SS...........",
      "..SS....WWWWWW..",
      "........WWWWWW..",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  // Spotlight: a magnifier over a glint of sky
  spotlight: {
    pal: { W: C.paper, I: C.ion, J: C.ionLight, g: C.paper3, k: C.ink900 },
    rows: [
      "................",
      "................",
      "....WWWWW.......",
      "...WIIIIIW......",
      "..WIJJIIIIW.....",
      "..WIJIIIIIW.....",
      "..WIIIIIIIW.....",
      "..WIIIIIIIW.....",
      "..WIIIIIIIW.....",
      "...WIIIIIWg.....",
      "....WWWWWggg....",
      "..........gggg..",
      "...........gggg.",
      "............ggg.",
      "................",
      "................",
    ],
  },
  // More: four tiny app tiles
  more: {
    pal: { S: C.signal, I: C.ion, E: C.ember, L: C.lilac },
    rows: [
      "................",
      "................",
      "...SSSS..IIII...",
      "..SSSSSSIIIIII..",
      "..SSSSSSIIIIII..",
      "..SSSSSSIIIIII..",
      "..SSSSSSIIIIII..",
      "...SSSS..IIII...",
      "...EEEE..LLLL...",
      "..EEEEEELLLLLL..",
      "..EEEEEELLLLLL..",
      "..EEEEEELLLLLL..",
      "..EEEEEELLLLLL..",
      "...EEEE..LLLL...",
      "................",
      "................",
    ],
  },
};

type Run = { x: number; y: number; w: number; fill: string };
type Prepared = { runs: Run[]; shadow: Run[]; bloom: Run[] };

const prepared = new Map<IconId, Prepared>();

/** Merge each row into horizontal runs: fewer nodes, no hairline seams. */
function prepare(id: IconId): Prepared {
  const hit = prepared.get(id);
  if (hit) return hit;
  const g = GLYPHS[id];
  const runs: Run[] = [];
  const shadow: Run[] = [];
  const filled = g.rows.map((r) => Array.from(r.padEnd(16, ".").slice(0, 16)).map((ch) => ch !== "."));
  g.rows.forEach((row, y) => {
    const cells = Array.from(row.padEnd(16, ".").slice(0, 16));
    let x = 0;
    while (x < 16) {
      const ch = cells[x];
      let w = 1;
      while (x + w < 16 && cells[x + w] === ch) w++;
      if (ch !== ".") runs.push({ x, y, w, fill: g.pal[ch] ?? C.paper });
      x += w;
    }
    // the shadow is the silhouette dropped one cell, only where it shows
    x = 0;
    while (x < 16) {
      if (!filled[y][x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && filled[y][x + w]) w++;
      shadow.push({ x, y: y + 1, w, fill: "" });
      x += w;
    }
  });
  const bloom: Run[] = [];
  if (g.bloom) {
    // dilate the silhouette by one cell for a soft phosphor halo
    for (let y = 0; y < 16; y++) {
      let x = 0;
      while (x < 16) {
        const near = (cx: number) =>
          [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => filled[y + dy]?.[cx + dx]));
        if (!near(x)) {
          x++;
          continue;
        }
        let w = 1;
        while (x + w < 16 && near(x + w)) w++;
        bloom.push({ x, y, w, fill: g.bloom });
        x += w;
      }
    }
  }
  const out = { runs, shadow, bloom };
  prepared.set(id, out);
  return out;
}

/** Whole or half CSS px per cell, glyph ≈ 68% of the tile. */
export function glyphCell(size: number) {
  let c = Math.round(((size * 0.68) / 16) * 2) / 2;
  if (c * 16 > size * 0.8) c -= 0.5;
  if (c * 16 < size * 0.52) c += 0.5;
  return Math.max(0.5, c);
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `rgb(${m(16)} ${m(8)} ${m(0)})`;
}

/**
 * A continuous-corner squircle (iOS-style): flat sides and long, smooth
 * corner onsets instead of circular arcs.
 */
function squircle(size: number, inset = 0) {
  const a = inset;
  const b = size - inset;
  const p = (b - a) * 0.34; // where the corner curve begins
  const h = p * 0.3; // handle distance from the corner
  const f = (n: number) => +n.toFixed(2);
  return (
    `M${f(a + p)} ${f(a)}H${f(b - p)}` +
    `C${f(b - h)} ${f(a)} ${f(b)} ${f(a + h)} ${f(b)} ${f(a + p)}V${f(b - p)}` +
    `C${f(b)} ${f(b - h)} ${f(b - h)} ${f(b)} ${f(b - p)} ${f(b)}H${f(a + p)}` +
    `C${f(a + h)} ${f(b)} ${f(a)} ${f(b - h)} ${f(a)} ${f(b - p)}V${f(a + p)}` +
    `C${f(a)} ${f(a + h)} ${f(a + h)} ${f(a)} ${f(a + p)} ${f(a)}Z`
  );
}

function GlyphRects({ id }: { id: IconId }) {
  const { runs, shadow, bloom } = prepare(id);
  return (
    <>
      {bloom.length > 0 && (
        <g fill={GLYPHS[id].bloom} opacity={0.16}>
          {bloom.map((r) => (
            <rect key={`b${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} />
          ))}
        </g>
      )}
      <g fill={C.ink950} opacity={0.42}>
        {shadow.map((r) => (
          <rect key={`s${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} />
        ))}
      </g>
      {runs.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </>
  );
}

/** Just the pixels, no tile: for tiny OS labels. `size` = glyph box in px. */
export function AppGlyph({ app, size = 16, className = "" }: { app: IconId; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      style={{ display: "block", flex: "none" }}
    >
      <GlyphRects id={app} />
    </svg>
  );
}

export function AppIcon({
  app,
  size = 48,
  className = "",
}: {
  app: IconId;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const accent = ICON_ACCENT[app];
  const cell = glyphCell(size);
  const gp = cell * 16;
  const off = Math.round((size - gp) / 2);
  const shape = squircle(size);
  const rimShape = squircle(size, 0.5);
  const id = (n: string) => `ai-${uid}-${n}`;
  const neutral = app === "terminal" || app === "more";

  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        position: "relative",
        flex: "none",
        width: size,
        height: size,
        borderRadius: size * 0.24,
        boxShadow: `0 ${Math.max(1, size / 48).toFixed(1)}px ${Math.max(1.5, size / 32).toFixed(1)}px rgb(0 0 0 / 0.38), 0 ${(size / 8).toFixed(1)}px ${(size / 4).toFixed(1)}px -${(size / 10).toFixed(1)}px rgb(0 0 0 / 0.55)`,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} focusable="false" style={{ display: "block" }}>
        <defs>
          <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mix(C.ink600, accent, neutral ? 0.14 : 0.25)} />
            <stop offset="1" stopColor={mix(C.ink900, accent, neutral ? 0.04 : 0.09)} />
          </linearGradient>
          <radialGradient id={id("glow")} cx="0.5" cy="1.12" r="0.78">
            <stop offset="0" stopColor={accent} stopOpacity={neutral ? 0.16 : 0.34} />
            <stop offset="0.6" stopColor={accent} stopOpacity={neutral ? 0.04 : 0.1} />
            <stop offset="1" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("vig")} cx="0.5" cy="0.4" r="0.75">
            <stop offset="0.6" stopColor={C.ink950} stopOpacity="0" />
            <stop offset="1" stopColor={C.ink950} stopOpacity="0.26" />
          </radialGradient>
          <linearGradient id={id("spec")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="0.4" stopColor="#fff" stopOpacity="0.035" />
            <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.22" stopColor="#fff" stopOpacity="0.13" />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0.03" />
            <stop offset="1" stopColor={accent} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <path d={shape} fill={`url(#${id("bg")})`} />
        <path d={shape} fill={`url(#${id("glow")})`} />
        <path d={shape} fill={`url(#${id("vig")})`} />
        <svg x={off} y={off} width={gp} height={gp} viewBox="0 0 16 16" shapeRendering="crispEdges" overflow="visible">
          <GlyphRects id={app} />
        </svg>
        <path d={shape} fill={`url(#${id("spec")})`} />
        <path d={rimShape} fill="none" stroke={`url(#${id("rim")})`} strokeWidth="1" />
      </svg>
    </span>
  );
}

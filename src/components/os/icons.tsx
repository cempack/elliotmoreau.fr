"use client";

import type { AppId } from "./apps";

/**
 * CONTRACT (owner: dock agent)
 * Pixel app icons: hand-drawn 16×16 cell maps rendered as crisp SVG rects
 * (shapeRendering crispEdges), on a flat dark tile with a thin border,
 * barely tinted by the app accent. `size` in CSS px. Decorative
 * (aria-hidden): labels live on the button/link.
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
  ionLight: "#d5e6df",
  ionDeep: "#5f8f84",
  lilac: "#aea3c8",
  lilacDeep: "#7d7699",
  ember: "#e0bd6e",
  emberDeep: "#c99645",
  emberLight: "#f1dfb8",
  flare: "#e2786b",
  night: "#16211f",
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
  // Atlas: a folded map, a dashed route, a pin where it ends
  atlas: {
    pal: { A: C.paper2, B: C.paper3, r: C.signalDeep, F: C.flare, W: C.paper },
    rows: [
      "..........FFF...",
      ".........FWFFF..",
      ".........FFFFF..",
      "..........FFF...",
      ".AAAA......F....",
      ".AAAABBBBBAAAAA.",
      ".AAAABBBBBArAAA.",
      ".AAAABBBBBrAAAA.",
      ".AAAABBBrBAAAAA.",
      ".AAAABBrBBAAAAA.",
      ".AAArBBBBBAAAAA.",
      ".ArAABBBBBAAAAA.",
      ".AAAABBBBBAAAAA.",
      ".....BBBBB......",
      "................",
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
  const accent = ICON_ACCENT[app];
  const cell = glyphCell(size);
  const gp = cell * 16;
  const off = Math.round((size - gp) / 2);
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
        borderRadius: Math.round(size * 0.2),
        background: mix(C.ink800, accent, neutral ? 0.03 : 0.08),
        boxShadow: `inset 0 0 0 1px rgb(196 206 194 / 0.16), 0 ${(size / 10).toFixed(1)}px ${(size / 5).toFixed(1)}px -${(size / 10).toFixed(1)}px rgb(0 0 0 / 0.6)`,
      }}
    >
      <svg
        width={gp}
        height={gp}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        focusable="false"
        style={{ position: "absolute", left: off, top: off, display: "block", overflow: "visible" }}
      >
        <GlyphRects id={app} />
      </svg>
    </span>
  );
}

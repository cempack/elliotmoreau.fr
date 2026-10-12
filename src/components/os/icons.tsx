"use client";

import type { AppId } from "./apps";
import { byFill, pxPath } from "@/lib/pxpath";
import { useArtPalette } from "@/hooks/useTheme";
import type { ArtPalette } from "@/lib/theme";

/**
 * CONTRACT (owner: dock agent)
 * Pixel app icons: hand-drawn 16×16 cell maps rendered as crisp SVG rects
 * (shapeRendering crispEdges), on a dark tile lit from above by the app
 * accent, with a hairline rim and a top highlight. `size` in CSS px. Decorative
 * (aria-hidden): labels live on the button/link.
 *
 * The cell size snaps to whole or half CSS px for the tile size you ask
 * for, so the pixels stay square and even at 28 (menu bar, Spotlight),
 * 32 (tab bar), 48 (dock) and 64–72 (magnified).
 */

export type IconId = AppId | "terminal" | "spotlight" | "more";

// The theme's pixel-art tones (artPalette), by role: resolved at render so
// the icons follow the live Dos Moos palette.
type Role = keyof ArtPalette;

/** Tile tint per icon (the app accent), as a CSS colour that follows the
    live theme; other agents can reuse it. */
export const ICON_ACCENT: Record<IconId, string> = {
  home: "var(--color-signal)",
  work: "var(--color-ion)",
  writing: "var(--color-ember)",
  atlas: "var(--color-lilac)",
  now: "var(--color-flare)",
  contact: "var(--color-signal)",
  admin: "var(--color-ember)",
  terminal: "var(--color-label-3)",
  spotlight: "var(--color-lilac)",
  more: "var(--color-label-3)",
};

type Glyph = {
  pal: Record<string, Role>;
  rows: readonly string[];
  /** phosphor bloom around the cells, for the terminal */
  bloom?: Role;
};

/* Each map is 16×16. "." is empty; every other character is a palette key.
   Shapes are centred on the 16 grid (even widths) and keep a one-cell
   margin so the drop shadow never clips. */
const GLYPHS: Record<IconId, Glyph> = {
  // Desktop: a window onto the emOS night, a low sun setting behind hills
  home: {
    pal: { W: "paper", n: "night", E: "ember", Y: "emberLight", S: "signal", s: "signalDeep", F: "flare" },
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
  // Projects: a folder, a sheet peeking out, </> on the front in ink
  work: {
    pal: { d: "ionDeep", I: "ion", J: "ionLight", w: "paper", k: "ink900" },
    rows: [
      "................",
      "................",
      ".ddddd..........",
      ".dddddddddddddd.",
      ".ddwwwwwwwwwwdd.",
      ".IIIIIIIIIIIIII.",
      ".JJJJJJJJJJJJJJ.",
      ".JJJJkJJJkJkJJJ.",
      ".JJJkJJJJkJJkJJ.",
      ".JJkJJJJkJJJJkJ.",
      ".JJJkJJkJJJJkJJ.",
      ".JJJJkJkJJJkJJJ.",
      ".JJJJJJJJJJJJJJ.",
      ".dddddddddddddd.",
      "................",
      "................",
    ],
  },
  // Writing: a spiral notepad with a French red margin, a pen across it
  writing: {
    pal: { W: "paper", g: "paper3", F: "flare", E: "ember", e: "emberDeep", k: "ink900" },
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
  // Atlas: the pixel globe, a pin stuck in it
  atlas: {
    pal: { d: "lilacDeep", L: "lilac", l: "lilacLight", F: "flare", W: "paper" },
    rows: [
      "...........FFF..",
      "..........FFWFF.",
      "......ddddFFFFF.",
      "....ddLLdddFFF..",
      "...ddlLLddLLF...",
      "...dllLLddLLL...",
      "..dddLLdddLLLd..",
      "..ddddLdddLLdd..",
      "..dddddLLddLdd..",
      "..ddddLLLLddLd..",
      "...dddLLLLdLd...",
      "...ddddLLdddd...",
      "....dddLdddd....",
      "......dddd......",
      "................",
      "................",
    ],
  },
  // Now: a live dot and a pixel level meter
  now: {
    pal: { F: "flare", E: "ember", S: "signal", W: "paper" },
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
  // Mail: an envelope sealed in the accent
  contact: {
    pal: { W: "paper", w: "paper2", g: "paper3", S: "signal", s: "signalDeep" },
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
  // Admin: a brass key
  admin: {
    pal: { E: "ember", J: "emberLight", d: "emberDeep" },
    rows: [
      "................",
      "................",
      "................",
      "................",
      "...EEEE.........",
      "..EJJEEE........",
      ".EJE..EEE.......",
      ".EE....EEEEEEEE.",
      ".EE....EEEEEEEE.",
      ".EEE..EEd.EE.EE.",
      "..EEEEEd..EE.E..",
      "...EEEd...dd....",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  // Terminal: a prompt and a cursor, with phosphor glow
  terminal: {
    pal: { S: "signal", W: "paper" },
    bloom: "signal",
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
    pal: { W: "paper", I: "ion", J: "ionLight", g: "paper3", k: "ink900" },
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
    pal: { S: "signal", I: "ion", E: "ember", L: "lilac" },
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

type Run<F = string> = { x: number; y: number; w: number; fill: F };
type Prepared = { runs: Run<Role>[]; shadow: Run[]; bloom: Run[] };

const prepared = new Map<IconId, Prepared>();

/** Merge each row into horizontal runs: fewer nodes, no hairline seams. */
function prepare(id: IconId): Prepared {
  const hit = prepared.get(id);
  if (hit) return hit;
  const g = GLYPHS[id];
  const runs: Run<Role>[] = [];
  const shadow: Run[] = [];
  const filled = g.rows.map((r) => Array.from(r.padEnd(16, ".").slice(0, 16)).map((ch) => ch !== "."));
  g.rows.forEach((row, y) => {
    const cells = Array.from(row.padEnd(16, ".").slice(0, 16));
    let x = 0;
    while (x < 16) {
      const ch = cells[x];
      let w = 1;
      while (x + w < 16 && cells[x + w] === ch) w++;
      if (ch !== ".") runs.push({ x, y, w, fill: g.pal[ch] ?? "paper" });
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

function GlyphRects({ id }: { id: IconId }) {
  const P = useArtPalette();
  const { runs, shadow, bloom } = prepare(id);
  const glow = GLYPHS[id].bloom;
  return (
    <>
      {glow && bloom.length > 0 && (
        <g fill={P[glow]} opacity={0.16}>
          <path d={pxPath(bloom)} />
        </g>
      )}
      <g fill={P.ink950} opacity={0.42}>
        <path d={pxPath(shadow)} />
      </g>
      {[...byFill(runs, (r) => P[r.fill])].map(([fill, rs]) => (
        <path key={fill} d={pxPath(rs)} fill={fill} />
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
        borderRadius: Math.round(size * 0.22),
        // lit from above: the accent glows in at the top and sinks into ink at the bottom
        background: `linear-gradient(180deg, color-mix(in srgb, var(--color-ink-700), ${accent} ${neutral ? 5 : 16}%) 0%, color-mix(in srgb, var(--color-ink-900), ${accent} ${neutral ? 2 : 6}%) 100%)`,
        boxShadow: [
          "inset 0 1px 0 rgb(255 255 255 / 0.09)",
          `inset 0 0 0 1px color-mix(in srgb, var(--color-border-active) 14%, transparent)`,
          `inset 0 -${Math.max(1, Math.round(size / 24))}px 0 rgb(0 0 0 / 0.22)`,
          `0 ${(size / 10).toFixed(1)}px ${(size / 5).toFixed(1)}px -${(size / 10).toFixed(1)}px rgb(0 0 0 / 0.6)`,
        ].join(", "),
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

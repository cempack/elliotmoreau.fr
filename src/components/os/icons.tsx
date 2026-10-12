"use client";

import type { AppId } from "./apps";
import { byFill, pxPath } from "@/lib/pxpath";
import { useArtPalette } from "@/hooks/useTheme";
import type { ArtPalette } from "@/lib/theme";
import {
  baseFills,
  useHomeGlyph,
  useMailGlyph,
  useNowGlyph,
  useTerminalGlyph,
  useWorkGlyph,
  useWritingGlyph,
  type Fills,
  type LiveGlyph,
} from "./liveIcons";

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

type Run = { x: number; y: number; w: number; fill: string };
type Prepared = { runs: Run[]; shadow: Run[]; bloom: Run[] };

/** prepared glyphs by key: the static drawings, plus the live ones as they change */
const prepared = new Map<string, Prepared>();

/**
 * A glyph's 256 fills as row runs: equal neighbours merged (fewer nodes, no
 * hairline seams), the silhouette dropped one cell for the shadow and, for
 * the terminal, its bright cells dilated by one for a phosphor halo.
 */
function prepare(key: string, make: () => Fills, glow?: Role): Prepared {
  const hit = prepared.get(key);
  if (hit) return hit;
  const fills = make();
  const filled = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && fills[y * 16 + x] != null;
  // only the bright cells glow (the glow role and paper), not dim scrollback
  const lit = (x: number, y: number) => filled(x, y) && (fills[y * 16 + x] === glow || fills[y * 16 + x] === "paper");
  const runs: Run[] = [];
  const shadow: Run[] = [];
  const bloom: Run[] = [];
  /** runs of consecutive cells in row y that pass `test` */
  const scan = (y: number, test: (x: number) => boolean, push: (x: number, w: number) => void) => {
    let x = 0;
    while (x < 16) {
      if (!test(x)) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && test(x + w)) w++;
      push(x, w);
      x += w;
    }
  };
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const f = fills[y * 16 + x];
      let w = 1;
      while (x + w < 16 && fills[y * 16 + x + w] === f) w++;
      if (f != null) runs.push({ x, y, w, fill: f });
      x += w;
    }
    scan(y, (cx) => filled(cx, y), (sx, w) => shadow.push({ x: sx, y: y + 1, w, fill: "" }));
    if (glow)
      scan(
        y,
        (cx) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => lit(cx + dx, y + dy))),
        (sx, w) => bloom.push({ x: sx, y, w, fill: glow })
      );
  }
  const out = { runs, shadow, bloom };
  // live keys come and go (the sky moves each quarter hour): keep the cache small
  if (prepared.size >= 64) prepared.delete(prepared.keys().next().value!);
  prepared.set(key, out);
  return out;
}

/** Whole or half CSS px per cell, glyph ≈ 68% of the tile. */
export function glyphCell(size: number) {
  let c = Math.round(((size * 0.68) / 16) * 2) / 2;
  if (c * 16 > size * 0.8) c -= 0.5;
  if (c * 16 < size * 0.52) c += 0.5;
  return Math.max(0.5, c);
}

function GlyphRects({ id, live }: { id: IconId; live?: LiveGlyph | null }) {
  const P = useArtPalette();
  const g = GLYPHS[id];
  const { runs, shadow, bloom } = live
    ? prepare(live.key, () => live.fills, g.bloom)
    : prepare(`@${id}`, () => baseFills(g), g.bloom);
  // a fill is a palette role, or a colour sampled from live data
  const color = (f: string) => (f.startsWith("#") ? f : (P[f as Role] ?? P.paper));
  return (
    <>
      {g.bloom && bloom.length > 0 && (
        <g fill={P[g.bloom]} opacity={0.16}>
          <path d={pxPath(bloom)} />
        </g>
      )}
      <g fill={P.ink950} opacity={0.42}>
        <path d={pxPath(shadow)} />
      </g>
      {[...byFill(runs, (r) => color(r.fill))].map(([fill, rs]) => (
        <path key={fill} d={pxPath(rs)} fill={fill} />
      ))}
    </>
  );
}

/* The icons that show their app's state (liveIcons.ts): each reads only
   its own source. */
const HomeRects = () => <GlyphRects id="home" live={useHomeGlyph(GLYPHS.home)} />;
const WorkRects = () => <GlyphRects id="work" live={useWorkGlyph(GLYPHS.work)} />;
const WritingRects = () => <GlyphRects id="writing" live={useWritingGlyph(GLYPHS.writing)} />;
const NowRects = () => <GlyphRects id="now" live={useNowGlyph()} />;
const MailRects = () => <GlyphRects id="contact" live={useMailGlyph()} />;
const TerminalRects = () => <GlyphRects id="terminal" live={useTerminalGlyph()} />;
const LIVE: Partial<Record<IconId, () => React.ReactElement>> = {
  home: HomeRects,
  work: WorkRects,
  writing: WritingRects,
  now: NowRects,
  contact: MailRects,
  terminal: TerminalRects,
};

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

/**
 * The app's tile. `live` (the default) lets the glyph show its app's state;
 * pass false where the drawing should stay put.
 */
export function AppIcon({
  app,
  size = 48,
  className = "",
  live = true,
}: {
  app: IconId;
  size?: number;
  className?: string;
  live?: boolean;
}) {
  const Live = live ? LIVE[app] : undefined;
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
        {Live ? <Live /> : <GlyphRects id={app} />}
      </svg>
    </span>
  );
}

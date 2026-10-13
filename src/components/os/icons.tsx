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
  useWorkGlyph,
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

export type IconId = AppId | "terminal" | "spotlight" | "more" | "overview";

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
  overview: "var(--color-ion)",
};

type Glyph = {
  pal: Record<string, Role>;
  rows: readonly string[];
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
  // Writing: la plume, a quill writing a line in red ink
  writing: {
    pal: { W: "paper", w: "paper2", c: "emberLight", e: "emberDeep", n: "flare", I: "flare" },
    rows: [
      "............WW..",
      "..........WWWWw.",
      ".........WWWWcw.",
      "........WWWWcww.",
      ".......WWWWcww..",
      "......W.WWcww...",
      ".....WWWWcw.w...",
      "....WWWWcww.....",
      "....W.Wcw.......",
      ".....WWc........",
      ".....cc.........",
      "....c...........",
      "...e............",
      "..n...II...II...",
      "...III..III..I..",
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
  // Now: headphones (liveIcons tints the cups with the album cover and,
  // while music plays, puts a note between them)
  now: {
    pal: { A: "paper2", a: "paper3", L: "flare", l: "flareDeep" },
    rows: [
      "................",
      "................",
      ".....AAAAAA.....",
      "...AAaaaaaaAA...",
      "..Aaa......aaA..",
      "..Aa........aA..",
      ".Aa..........aA.",
      ".Aa..........aA.",
      ".LLL........LLL.",
      "LLLLl......lLLLL",
      "LLLLl......lLLLL",
      "LLLLl......lLLLL",
      "LLLLl......lLLLL",
      ".LLL........LLL.",
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
  // Terminal: a terminal window, a prompt and its cursor on the dark screen
  // Open windows: three windows floating over the river, the one you're in picked out
  overview: {
    pal: { W: "paper", k: "ink900", E: "ember", I: "ion", J: "ionLight", d: "ionDeep" },
    rows: [
      "................",
      "................",
      "................",
      "......EEEE......",
      ".WWWW.EkkE.WWWW.",
      ".WkkW.EkkE.WkkW.",
      ".WkkW.EEEE.WkkW.",
      ".WWWW......WWWW.",
      "................",
      "................",
      ".IIIIIIIIIIIIII.",
      ".IJJIIIJJIIIJJI.",
      ".IIIIIIIIIIIIII.",
      "..dddddddddddd..",
      "................",
      "................",
    ],
  },
  terminal: {
    pal: { B: "paper3", F: "flare", E: "ember", S: "signal", k: "ink950", C: "ember", U: "paper" },
    rows: [
      "................",
      "................",
      "..BBBBBBBBBBBB..",
      ".BFBEBSBBBBBBBB.",
      ".BBBBBBBBBBBBBB.",
      ".BkkkkkkkkkkkkB.",
      ".BkCCkkkkkkkkkB.",
      ".BkkCCkkkkkkkkB.",
      ".BkkkCCkkkkkkkB.",
      ".BkkCCkkkkkkkkB.",
      ".BkCCkkkUUUkkkB.",
      ".BkkkkkkkkkkkkB.",
      ".BBBBBBBBBBBBBB.",
      "..BBBBBBBBBBBB..",
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
type Prepared = { runs: Run[]; shadow: Run[] };

/** prepared glyphs by key: the static drawings, plus the live ones as they change */
const prepared = new Map<string, Prepared>();

/**
 * A glyph's 256 fills as row runs: equal neighbours merged (fewer nodes, no
 * hairline seams) and the silhouette dropped one cell for the shadow.
 */
function prepare(key: string, make: () => Fills): Prepared {
  const hit = prepared.get(key);
  if (hit) return hit;
  const fills = make();
  const filled = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && fills[y * 16 + x] != null;
  const runs: Run[] = [];
  const shadow: Run[] = [];
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const f = fills[y * 16 + x];
      let w = 1;
      while (x + w < 16 && fills[y * 16 + x + w] === f) w++;
      if (f != null) runs.push({ x, y, w, fill: f });
      x += w;
    }
    // the shadow: the silhouette's runs, a cell lower
    x = 0;
    while (x < 16) {
      if (!filled(x, y)) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && filled(x + w, y)) w++;
      shadow.push({ x, y: y + 1, w, fill: "" });
      x += w;
    }
  }
  const out = { runs, shadow };
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

/** each drawing's roles by cell, at rest (what a live glyph recolours) */
const rest = new Map<IconId, Fills>();
const restOf = (id: IconId) => {
  let f = rest.get(id);
  if (!f) rest.set(id, (f = baseFills(GLYPHS[id])));
  return f;
};

/** an icon's drawing at rest: a palette role per cell of its 16×16 (null where empty) */
export const glyphFills = (id: IconId): Fills => restOf(id);

function GlyphRects({ id, live }: { id: IconId; live?: LiveGlyph | null }) {
  const P = useArtPalette();
  const g = GLYPHS[id];
  const { runs, shadow } = live ? prepare(live.key, () => live.fills) : prepare(`@${id}`, () => baseFills(g));
  // a fill is a palette role, or a colour sampled from live data
  const color = (f: string) => (f.startsWith("#") ? f : (P[f as Role] ?? P.paper));
  // Each colour's path is keyed by what its cells are in the drawing at
  // rest, not by the colour itself: when the colours change (a new cover
  // tints the headphones, the sky relights the theme) it is the same path
  // changing fill, which eases (globals.css), instead of a new one popping
  // in. What only a live state adds (the note while music plays) fades in.
  const at = restOf(id);
  const used = new Set<string>();
  return (
    <>
      <g fill={P.ink950} opacity={0.42}>
        <path d={pxPath(shadow)} />
      </g>
      {[...byFill(runs, (r) => color(r.fill))].map(([fill, rs]) => {
        const role = at[rs[0].y * 16 + rs[0].x] ?? "+";
        let key = role;
        for (let i = 1; used.has(key); i++) key = `${role}${i}`;
        used.add(key);
        return <path key={key} d={pxPath(rs)} fill={fill} className={role === "+" ? "os-glyph-px os-glyph-px--added" : "os-glyph-px"} />;
      })}
    </>
  );
}

/* The icons that show their app's state (liveIcons.ts): each reads only
   its own source. */
const HomeRects = () => <GlyphRects id="home" live={useHomeGlyph(GLYPHS.home)} />;
const WorkRects = () => <GlyphRects id="work" live={useWorkGlyph(GLYPHS.work)} />;
const NowRects = () => <GlyphRects id="now" live={useNowGlyph(GLYPHS.now)} />;
const MailRects = () => <GlyphRects id="contact" live={useMailGlyph()} />;
const LIVE: Partial<Record<IconId, () => React.ReactElement>> = {
  home: HomeRects,
  work: WorkRects,
  now: NowRects,
  contact: MailRects,
};

/** Just the pixels, no tile: for tiny OS labels. `size` = glyph box in px.
    Live like the tiles, so an app looks the same in the menu bar, Spotlight
    and the Dock. */
export function AppGlyph({ app, size = 16, className = "", live = true }: { app: IconId; size?: number; className?: string; live?: boolean }) {
  const Live = live ? LIVE[app] : undefined;
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
      {Live ? <Live /> : <GlyphRects id={app} />}
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

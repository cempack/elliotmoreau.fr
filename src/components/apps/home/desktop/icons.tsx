"use client";

import { byFill, pxPath } from "@/lib/pxpath";

import { AppIcon, glyphCell } from "@/components/os/icons";
import type { AppId } from "@/components/os/apps";
import type { Cells } from "@/components/glyphs";

/** 7×7 pencil, for the latest post (widget and chip). */
export const G_PEN: Cells = [
  [5, 0], [6, 0],
  [4, 1], [5, 1], [6, 1],
  [3, 2], [4, 2], [5, 2],
  [2, 3], [3, 3], [4, 3],
  [1, 4], [2, 4], [3, 4],
  [1, 5], [2, 5],
  [0, 6],
];

/** 7×7 commit (a node on a line), for the last push. */
export const G_COMMIT: Cells = [
  [3, 0], [3, 1], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5], [3, 6],
];

/** 7×7 plane heading right (top view), for the places chip. */
export const G_PLANE: Cells = [
  [3, 0],
  [3, 1], [4, 1],
  [0, 2], [3, 2], [4, 2], [5, 2],
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
  [0, 4], [3, 4], [4, 4], [5, 4],
  [3, 5], [4, 5],
  [3, 6],
];

/** What can sit on the desktop. The apps live in the Dock, so only the
    README (it opens hello.txt) is out on the desk, and a Mail draft while
    one is waiting to be sent. */
export type DesktopIconId = Exclude<AppId, "home" | "admin"> | "readme" | "draft";
export const DESKTOP_ICONS: DesktopIconId[] = ["readme", "draft"];

const C = {
  paper: "#ebe9e1",
  paper2: "#bcc2ba",
  paper3: "#8f988f",
  ink: "#0a0c0b",
  signal: "#b0cc86",
  ion: "#89b4a8",
  ember: "#e0bd6e",
  emberDeep: "#c99645",
};

/* A text file with a dog-eared corner, a lime heading and ruled lines. 16×16,
   same cell grammar as the app icons so they share one pixel size. */
const README_ROWS = [
  "................",
  "...WWWWWWWw.....",
  "...WWWWWWWww....",
  "...WWWWWWWwww...",
  "...WWWWWWWWWW...",
  "...WSSSSWWWWW...",
  "...WWWWWWWWWW...",
  "...WggggggggW...",
  "...WWWWWWWWWW...",
  "...WgggggIIWW...",
  "...WWWWWWWWWW...",
  "...WgggggggWW...",
  "...WWWWWWWWWW...",
  "...WWWWWWWWWW...",
  "................",
  "................",
];
const README_PAL: Record<string, string> = { W: C.paper, w: C.paper2, g: C.paper3, S: C.signal, I: C.ion };

type Run = { x: number; y: number; w: number; fill: string };

/** a 16×16 map as runs of colour, plus its one-cell drop shadow */
function build(rows: readonly string[], pal: Record<string, string>) {
  const runs: Run[] = [];
  const shadow: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < 16) {
      const ch = row[x];
      let w = 1;
      while (x + w < 16 && row[x + w] === ch) w++;
      if (ch !== ".") runs.push({ x, y, w, fill: pal[ch] });
      x += w;
    }
    x = 0;
    while (x < 16) {
      if (row[x] === ".") {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && row[x + w] !== ".") w++;
      shadow.push({ x: x + 1, y: y + 1, w, fill: "" });
      x += w;
    }
  });
  return { runs, shadow };
}

const README = build(README_ROWS, README_PAL);

/* The Mail draft: the same page with a sealed envelope on it, ember flap. */
const EML_ROWS = [
  "................",
  "...WWWWWWWw.....",
  "...WWWWWWWww....",
  "...WWWWWWWwww...",
  "...WWWWWWWWWW...",
  "...WEEEEEEEEW...",
  "...WEeEEEEeEW...",
  "...WEWeEEeWEW...",
  "...WEWWeeWWEW...",
  "...WEWWWWWWEW...",
  "...WEEEEEEEEW...",
  "...WWWWWWWWWW...",
  "...WgggggWWWW...",
  "...WWWWWWWWWW...",
  "................",
  "................",
];
const EML = build(EML_ROWS, { W: C.paper, w: C.paper2, g: C.paper3, E: C.ember, e: C.emberDeep });

/**
 * A document, not an app: no tile, just the page, drawn a little larger
 * than an app glyph (documents on a desktop read by their silhouette).
 */
function DocGlyph({ size, art }: { size: number; art: ReturnType<typeof build> }) {
  // whole or half px per cell, so the page stays as crisp as the app glyphs
  const cell = Math.round(glyphCell(size) * 1.25 * 2) / 2;
  const gp = cell * 16;
  return (
    <span aria-hidden className="app-home-doc" style={{ width: size, height: size }}>
      <svg
        width={gp}
        height={gp}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        focusable="false"
        style={{ display: "block", overflow: "visible" }}
      >
        <g fill={C.ink} opacity={0.5}>
          <path d={pxPath(art.shadow)} />
        </g>
        {[...byFill(art.runs, (r) => r.fill)].map(([fill, rs]) => (
          <path key={fill} d={pxPath(rs)} fill={fill} />
        ))}
      </svg>
    </span>
  );
}

export function DesktopGlyph({ id, size }: { id: DesktopIconId; size: number }) {
  if (id === "readme") return <DocGlyph size={size} art={README} />;
  if (id === "draft") return <DocGlyph size={size} art={EML} />;
  return <AppIcon app={id} size={size} />;
}

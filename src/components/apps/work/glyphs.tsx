import { byFill, pxPath } from "@/lib/pxpath";
import type { Cells } from "@/components/glyphs";

/** Parse a 7×7 (or any) grid of "#"/"." rows into PixelGlyph cells. */
function cells(rows: string[]): Cells {
  const out: Cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") out.push([x, y]);
  });
  return out;
}

export const G_ALL = cells(["###.###", "###.###", "###.###", ".......", "###.###", "###.###", "###.###"]);
/** two peaks: the Years view */
export const G_PEAKS = cells([".......", "..#....", ".###...", "####.#.", "######.", "#######", "......."]);
export const G_LIST = cells([".......", "#.#####", ".......", "#.#####", ".......", "#.#####", "......."]);
export const G_HASH = cells(["..#.#..", "..#.#..", "#######", "..#.#..", "#######", "..#.#..", "..#.#.."]);
export const G_SEARCH = cells([".###...", "#...#..", "#...#..", "#...#..", ".####..", ".....#.", "......#"]);
export const G_SORT = cells([".......", "#######", ".......", "#####..", ".......", "###....", "......."]);
export const G_CHEVRON = cells([".......", ".......", "#.....#", ".#...#.", "..#.#..", "...#...", "......."]);
export const G_ARROW = cells([".......", "..####.", ".....#.", "....##.", "...#.#.", "..#....", ".#....."]);
export const G_FORK = cells(["#...#..", "#...#..", "#...#..", ".#.#...", "..#....", "..#....", "..#...."]);
export const G_EYE = cells([".......", "..###..", ".#...#.", "#..#..#", ".#...#.", "..###..", "......."]);
export const G_COPY = cells(["####...", "#..#...", "#.####.", "###..#.", "..#..#.", "..####.", "......."]);
export const G_CHECK = cells([".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."]);
export const G_CLOSE = cells(["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"]);

/**
 * Small multi-colour pixel illustration from string rows; each character
 * maps to a fill in `palette` ("." is empty). Crisp SVG, SSR-safe.
 */
export function PixelArt({
  rows,
  palette,
  cell = 6,
  className = "",
}: {
  rows: string[];
  palette: Record<string, string>;
  cell?: number;
  className?: string;
}) {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run++;
      rects.push({ x, y, w: run, fill: palette[ch] });
      x += run;
    }
  });
  return (
    <svg
      aria-hidden
      focusable="false"
      width={w * cell}
      height={h * cell}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={className}
    >
      {[...byFill(rects, (r) => r.fill)].map(([fill, rs]) => (
        <path key={fill} d={pxPath(rs, 0.02)} fill={fill} />
      ))}
    </svg>
  );
}

/** a magnifier over an empty field: no results */
export const ART_SEARCH = [
  "....aaaa......",
  "...a....a.....",
  "..a.bb...a....",
  "..a.b....a....",
  "..a......a....",
  "..a......a....",
  "...a....a.....",
  "....aaaac.....",
  ".........cc...",
  "..........cc..",
  "...........cc.",
  "............c.",
];

/** a little open folder: empty smart folder */
export const ART_FOLDER = [
  ".aaaa.........",
  "abbbba........",
  "abbbbbaaaaaaa.",
  "abbbbbbbbbbbba",
  "accccccccccccc",
  "acddddddddddc.",
  "acdddddddddc..",
  "acddddddddddc.",
  ".cccccccccccc.",
];

/** a cloud with a broken link: GitHub unreachable */
export const ART_OFFLINE = [
  ".....aaaa.......",
  "...aabbbbaa.....",
  "..abbbbbbbba....",
  ".aabbbbbbbbbaaa.",
  "abbbbbbbbbbbbbba",
  "abbbbbbbbbbbbbba",
  ".aaaaaaaaaaaaaa.",
  "................",
  "....cc....dd....",
  "...c..c..d..d...",
  "...c..c..d..d...",
  "....cc....dd....",
];

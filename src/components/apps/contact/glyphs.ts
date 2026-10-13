import type { Cells } from "@/components/glyphs";

/** Parse "#"/"." rows into PixelGlyph cells (7 × 7 unless noted). */
function cells(rows: string[]): Cells {
  const out: Cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "#") out.push([x, y]);
  });
  return out;
}

/* mailboxes */
export const G_PEN = cells(["....##.", "...#.##", "..#.##.", ".#.##..", "#.##...", "##.....", "#######"]);
export const G_AT = cells([".#####.", "#.....#", "#.###.#", "#.#.#.#", "#.####.", "#......", ".#####."]);
export const G_KEY = cells([".###...", "#...#..", "#.#.#..", "#...###", ".###.##", "......#", "......."]);
/** a sealed envelope: Sent */
export const G_LETTER = cells([".......", "#######", "##...##", "#.#.#.#", "#..#..#", "#.....#", "#######"]);

/* actions */
export const G_COPY = cells(["####...", "#..#...", "#.####.", "###..#.", "..#..#.", "..####.", "......."]);
export const G_CHECK = cells([".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."]);
/** paper plane in profile (macOS Mail's Send) */
export const G_SEND = cells(["#......", "###....", ".####..", "..#####", ".####..", "###....", "#......"]);
/** up arrow for the lime disc in the phone header (iOS Mail's Send) */
export const G_SEND_UP = cells(["...#...", "..###..", ".#####.", "###.###", "...#...", "...#...", "...#..."]);
/** out to another app */
export const G_OPEN = cells(["..#####", "....###", "...####", "..###.#", ".###...", "###....", ".#....."]);
export const G_DOWN = cells(["...#...", "...#...", "...#...", "#..#..#", ".#.#.#.", "..###..", "...#..."]);
export const G_ARROW = cells([".......", "..####.", ".....#.", "....##.", "...#.#.", "..#....", ".#....."]);
export const G_BACK = cells(["....#..", "...#...", "..#....", ".#.....", "..#....", "...#...", "....#.."]);
export const G_CHEVRON = cells([".......", ".......", "#.....#", ".#...#.", "..#.#..", "...#...", "......."]);
export const G_TERM = cells([".......", "#......", ".#.....", "..#....", ".#.....", "#..####", "......."]);
export const G_RETRY = cells(["..###.#", ".#...##", "#...###", "#......", "#.....#", ".#...#.", "..###.."]);

/* elsewhere: each network's mark, 9 × 9; generic pixel marks, not brand logos */
/** angle brackets round a leaning stroke: code */
export const M_CODE = cells([
  ".........",
  "....#....",
  "..#.#.#..",
  ".#..#..#.",
  "#...#...#",
  ".#.#...#.",
  "..##..#..",
  "...#.....",
  ".........",
]);
/** a play button */
export const M_PLAY = cells([
  ".........",
  ".#######.",
  "###.#####",
  "###..####",
  "###...###",
  "###..####",
  "###.#####",
  ".#######.",
  ".........",
]);
/** a speech bubble, someone typing */
export const M_TOOT = cells([
  ".#######.",
  "#########",
  "#########",
  "##.#.#.##",
  "#########",
  "#########",
  ".#######.",
  ".##......",
  ".#.......",
]);
/** an X, one stroke bold and one thin */
export const M_X = cells([
  "##......#",
  ".##....#.",
  "..##..#..",
  "...###...",
  "....##...",
  "...#.##..",
  "..#...##.",
  ".#.....##",
  "#.......#",
]);
/** two beamed notes */
export const M_NOTES = cells([
  "...######",
  "...######",
  "...#....#",
  "...#....#",
  "...#....#",
  ".###..###",
  "####.####",
  "####.####",
  ".##...##.",
]);

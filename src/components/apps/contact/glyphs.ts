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
export const G_INFO = cells(["..###..", ".#...#.", "#..#..#", "#.....#", "#..#..#", ".#.#.#.", "..###.."]);
export const G_RETRY = cells(["..###.#", ".#...##", "#...###", "#......", "#.....#", ".#...#.", "..###.."]);

/* elsewhere: generic pixel marks, not brand logos */
export const G_CODE = cells([".......", "..#.#..", ".#...#.", "#.....#", ".#...#.", "..#.#..", "......."]);
export const G_PLAY = cells(["#######", "#.#...#", "#.##..#", "#.###.#", "#.##..#", "#.#...#", "#######"]);
export const G_TOOT = cells([".#####.", "#.....#", "#.#.#.#", "#.....#", ".#####.", ".#.....", "#......"]);
export const G_X = cells(["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"]);
export const G_NOTE = cells(["...####", "...#..#", "...#..#", "...#..#", ".###.##", "####.##", ".##...."]);

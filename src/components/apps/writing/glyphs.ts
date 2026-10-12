import type { Cells } from "@/components/glyphs";

/** 7×7 pixel glyphs drawn as strings ("#" = cell). */
function cells(rows: string[]): Cells {
  const out: Cells = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && out.push([x, y])));
  return out;
}

export const G_BACK = cells([
  "...#...",
  "..#....",
  ".#.....",
  "#......",
  ".#.....",
  "..#....",
  "...#...",
]);

export const G_LINK = cells([
  "...####",
  ".....##",
  "....#.#",
  "...#..#",
  "..#....",
  ".#.....",
  "#......",
]);

export const G_COPY = cells([
  "..#####",
  "..#...#",
  "###...#",
  "#.#...#",
  "#.#####",
  "#...#..",
  "#####..",
]);

export const G_RSS = cells([
  "###....",
  "...#...",
  "##..#..",
  "..#..#.",
  "#..#.#.",
  "##.#.#.",
  "##.#.#.",
]);

export const G_MAIL = cells([
  ".......",
  "#######",
  "##...##",
  "#.#.#.#",
  "#..#..#",
  "#.....#",
  "#######",
]);

import type { Cells } from "@/components/glyphs";

/** 7×7 pixel glyphs for the window chrome and the mini player. */
export const G_CLOSE: Cells = [
  [1, 1], [2, 2], [3, 3], [4, 4], [5, 5],
  [5, 1], [4, 2], [2, 4], [1, 5],
];
export const G_MIN: Cells = [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]];
export const G_ZOOM: Cells = [
  [1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [1, 3],
  [5, 5], [4, 5], [3, 5], [5, 4], [4, 4], [5, 3],
];
export const G_UNZOOM: Cells = [
  [2, 0], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2],
  [4, 6], [5, 5], [4, 5], [6, 4], [5, 4], [4, 4],
];
export const G_CHEVRON: Cells = [[0, 2], [1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [6, 2]];
export const G_EXTERNAL: Cells = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4],
  [5, 1], [4, 2], [3, 3], [2, 4], [1, 5], [0, 6],
];

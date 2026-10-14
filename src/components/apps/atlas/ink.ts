/* The Atlas globe's inks, on their own so the pixel scenes that share the
   palette (pixel3d, the room) don't pull the planet and its landmass in. */

export type RGB = [number, number, number];

export const INK = {
  oceanDeep: [10, 13, 38],
  ocean: [15, 20, 55],
  oceanLit: [25, 33, 84],
  oceanNight: [5, 6, 17],
  oceanNight2: [8, 9, 24],
  grid: [24, 31, 78],
  gridNight: [11, 13, 33],
  landLo: [58, 63, 140],
  land: [86, 93, 192],
  landHi: [136, 129, 234],
  ice: [178, 172, 234],
  iceHi: [216, 212, 247],
  landNight: [27, 29, 68],
  landNight2: [34, 37, 84],
  light: [255, 184, 107],
  lightHot: [245, 242, 236],
} satisfies Record<string, RGB>;

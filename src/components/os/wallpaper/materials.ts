export const MAT = {
  SKY: 0,
  STAR: 1,
  CLOUD: 2,
  RANGE: 3,
  SNOW: 4,
  FAR: 5,
  FARWATER: 6,
  /** brick facing west (the Daurade quay, lit in the evening) */
  FACADE_W: 7,
  /** brick facing east (La Grave, lit in the morning) */
  FACADE_E: 8,
  /** brick facing north, toward the viewer (never in direct sun but in summer) */
  FACADE_N: 9,
  ROOF: 10,
  STONE: 11,
  /** the dome: shade = direction around it (0–7, east to west) + 8 if upper */
  COPPER: 12,
  /** the dome's drum, same shade encoding */
  DRUM: 13,
  LEAF: 14,
  TRUNK: 15,
  /** shade is a random threshold: lit when below the night's share */
  WINDOW: 16,
  DARK: 17,
  /** the Pont Neuf's downstream face; shade = height (3 at the water) */
  BRIDGE: 18,
  LAMP: 19,
} as const;

export const WATER = 1 << 10;
export const LANE = 1 << 11;
export const DEEP = 1 << 12;

export type Lamp = { x: number; y: number; /** reflection streak top row, or -1 */ ry: number };
export type Twinkle = { x: number; y: number; c: string; d: number; delay: number };

export type City = {
  W: number;
  H: number;
  idx: Uint16Array<ArrayBuffer>;
  /** vignette, 0–15 per pixel (under the menu bar and the dock) */
  vig: Uint8Array<ArrayBuffer>;
  /** per column, the row the water starts at (its mirror line); H if none */
  yw: Int16Array<ArrayBuffer>;
  /** eye level: the horizon */
  hz: number;
  /** every code the buffer uses, so the palette only computes those */
  codes: Uint16Array<ArrayBuffer>;
  /** the Pont Neuf's lamps, from the Daurade side to Saint-Cyprien */
  lamps: Lamp[];
  /** degrees of azimuth across the width (where the sun lands) */
  fov: number;
  /** the sun's highest row (below the menu bar) */
  top: number;
  /** scene scale in art pixels (sizes the sun) */
  S: number;
  twinkles: Twinkle[];
  plane: { y: number };
};

/* ───────────────────────────── helpers ───────────────────────────── */


import type { ProjectKind } from "../kind";

/**
 * The machines, one per shelf, built from boxes: an old CRT on a desk for
 * apps, an arcade cabinet for games, a widescreen monitor for the desktop
 * add-ons, a VT100-style terminal for tools and a handheld for experiments.
 *
 * Object space, y up, the screen facing +z. Every screen is 16:10, like the
 * pictures Projects shows, and sits on the front (+z) face of the box behind
 * it, framed by bezel boxes that stand a little proud of it, so the light
 * leaves a real shadow in the recess. Faces can paint details (keys, vents,
 * a coin door) through `faces`, in that face's own u (left to right as you
 * face it) and v (top to bottom; back to front on a top face).
 */

export type Vec3 = [number, number, number];
export type Ramp = "body" | "dark" | "key" | "ember" | "flare";
export type Face = "px" | "nx" | "py" | "ny" | "pz" | "nz";
/** a lit material, an unlit colour (0xAABBGGRR), or the marquee's lights */
export type Paint = Ramp | { emit: number } | "marquee";
export type Box = { a: Vec3; b: Vec3; ramp: Ramp; faces?: Partial<Record<Face, (u: number, v: number) => Paint | null>> };
export type Screen = { x0: number; x1: number; y0: number; y1: number; z: number; tint?: "phosphor" | "pocket" };
export type Model = {
  boxes: Box[];
  screen: Screen;
  /** the turntable: its height and radius */
  floorY: number;
  turn: number;
  /** what the camera looks at, at rest */
  center: Vec3;
};

/* unlit colours, little-endian RGBA as ImageData's Uint32 view reads them */
const rgba = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const LIME = rgba(198, 255, 94);
const EMBER = rgba(255, 184, 107);
const ION = rgba(139, 233, 255);
const FLARE = rgba(240, 51, 74);

/** a keyboard seen from above: cols × rows keys with gaps, `hot` keys in ember */
const keys = (cols: number, rows: number, hot: [number, number][] = []) => (u: number, v: number): Paint => {
  const cu = u * cols, cv = v * rows;
  if (cu % 1 < 0.2 || cv % 1 < 0.24) return "dark";
  return hot.some(([c, r]) => (cu | 0) === c && (cv | 0) === r) ? "ember" : "key";
};
/** slots across a face (vents, a speaker) */
const slots = (n: number, u0: number, u1: number, v0: number, v1: number) => (u: number, v: number): Paint | null =>
  u > u0 && u < u1 && v > v0 && v < v1 && ((u - u0) / (u1 - u0)) * n % 1 < 0.5 ? "dark" : null;
const inside = (u: number, v: number, u0: number, u1: number, v0: number, v1: number) => u > u0 && u < u1 && v > v0 && v < v1;

/** a frame of four bezel boxes around a screen, from z to z + depth */
function bezel(s: Screen, outer: [number, number, number, number], depth: number, ramp: Ramp, bottom?: Box["faces"]): Box[] {
  const [x0, x1, y0, y1] = outer;
  const z0 = s.z, z1 = s.z + depth;
  return [
    { a: [x0, s.y1, z0], b: [x1, y1, z1], ramp },
    { a: [x0, y0, z0], b: [x1, s.y0, z1], ramp, faces: bottom },
    { a: [x0, s.y0, z0], b: [s.x0, s.y1, z1], ramp },
    { a: [s.x1, s.y0, z0], b: [x1, s.y1, z1], ramp },
  ];
}

/* an old CRT on its stand, a keyboard and a mouse */
const crtScreen: Screen = { x0: -0.96, x1: 0.96, y0: -0.23, y1: 0.97, z: 0.62 };
const CRT: Model = {
  screen: crtScreen,
  floorY: -0.96,
  turn: 2.15,
  center: [0, 0.12, 0.3],
  boxes: [
    { a: [-1.15, -0.62, -0.45], b: [1.15, 1.16, 0.62], ramp: "body", faces: { py: slots(9, 0.18, 0.82, 0.12, 0.5) } },
    ...bezel(crtScreen, [-1.15, 1.15, -0.62, 1.16], 0.12, "body", {
      pz: (u, v) => {
        if (inside(u, v, 0.86, 0.885, 0.38, 0.56)) return { emit: LIME };
        if (inside(u, v, 0.45, 0.55, 0.36, 0.58)) return "key";
        return slots(6, 0.07, 0.3, 0.4, 0.62)(u, v);
      },
    }),
    { a: [-0.85, -0.45, -1.25], b: [0.85, 0.98, -0.45], ramp: "body", faces: { py: slots(8, 0.2, 0.8, 0.15, 0.85) } },
    { a: [-0.25, -0.86, -0.3], b: [0.25, -0.62, 0.3], ramp: "dark" },
    { a: [-0.75, -0.96, -0.62], b: [0.75, -0.86, 0.62], ramp: "body" },
    { a: [-1.05, -0.96, 0.98], b: [1.05, -0.84, 1.62], ramp: "body", faces: { py: keys(15, 5, [[13, 2], [14, 2]]) } },
    { a: [1.32, -0.96, 1.12], b: [1.52, -0.88, 1.44], ramp: "body", faces: { py: (u, v) => (v < 0.4 && Math.abs(u - 0.5) < 0.07 ? "dark" : null) } },
  ],
};

/* an arcade cabinet: marquee, screen, control panel, coin door */
const cabScreen: Screen = { x0: -0.58, x1: 0.58, y0: 0.45, y1: 1.175, z: 0.42 };
const CABINET: Model = {
  screen: cabScreen,
  floorY: -1.9,
  turn: 1.55,
  center: [0, -0.15, 0.25],
  boxes: [
    {
      a: [-0.75, -1.9, -0.55], b: [0.75, 1.3, 0.42], ramp: "body",
      faces: {
        pz: (u, v) => {
          if (v > 0.93) return "dark";
          if (inside(u, v, 0.38, 0.62, 0.64, 0.8)) {
            if (inside(u, v, 0.44, 0.47, 0.67, 0.73) || inside(u, v, 0.53, 0.56, 0.67, 0.73)) return { emit: EMBER };
            return "dark";
          }
          return null;
        },
        px: (u, v) => (v > 0.42 && ((u * 10 + v * 7) | 0) % 3 === 0 ? "ember" : null),
        nx: (u, v) => (v > 0.42 && ((u * 10 + v * 7) | 0) % 3 === 0 ? "ember" : null),
      },
    },
    ...bezel(cabScreen, [-0.75, 0.75, 0.2, 1.3], 0.08, "dark"),
    { a: [-0.8, 1.3, -0.62], b: [0.8, 1.76, 0.6], ramp: "body", faces: { pz: (u, v) => (inside(u, v, 0.04, 0.96, 0.14, 0.86) ? "marquee" : null) } },
    {
      a: [-0.8, -0.06, 0.42], b: [0.8, 0.2, 1.0], ramp: "body",
      faces: {
        py: (u, v) => {
          const dot = (cu: number, cv: number, r: number) => (u - cu) ** 2 * 3 + (v - cv) ** 2 < r * r;
          if (dot(0.22, 0.5, 0.2)) return "dark";
          if (dot(0.55, 0.38, 0.11)) return "flare";
          if (dot(0.68, 0.6, 0.11)) return "ember";
          if (dot(0.82, 0.4, 0.11)) return { emit: ION };
          return null;
        },
      },
    },
    { a: [-0.5, 0.2, 0.66], b: [-0.45, 0.32, 0.71], ramp: "dark" },
    { a: [-0.53, 0.32, 0.63], b: [-0.42, 0.42, 0.74], ramp: "flare" },
  ],
};

/* a thin widescreen monitor on a stand, a low keyboard: the Omarchy desk */
const wideScreen: Screen = { x0: -1.4, x1: 1.4, y0: -0.1, y1: 1.65, z: 0.08 };
const WIDE: Model = {
  screen: wideScreen,
  floorY: -1.0,
  turn: 2.25,
  center: [0, 0.32, 0.15],
  boxes: [
    { a: [-1.47, -0.17, -0.08], b: [1.47, 1.72, 0.08], ramp: "dark" },
    ...bezel(wideScreen, [-1.47, 1.47, -0.17, 1.72], 0.025, "dark", { pz: (u, v) => (inside(u, v, 0.49, 0.51, 0.35, 0.65) ? { emit: LIME } : null) }),
    { a: [-0.9, 0.2, -0.28], b: [0.9, 1.3, -0.08], ramp: "body", faces: { nz: slots(10, 0.1, 0.9, 0.2, 0.4) } },
    { a: [-0.1, -0.95, -0.32], b: [0.1, 0.3, -0.18], ramp: "body" },
    { a: [-0.55, -1.0, -0.62], b: [0.55, -0.95, 0.05], ramp: "body" },
    { a: [-0.95, -1.0, 0.45], b: [0.95, -0.95, 0.95], ramp: "dark", faces: { py: keys(16, 5) } },
  ],
};

/* a VT100-style terminal: a hood over a green screen, a thick keyboard */
const termScreen: Screen = { x0: -0.8, x1: 0.8, y0: 0.0, y1: 1.0, z: 0.5, tint: "phosphor" };
const TERMINAL: Model = {
  screen: termScreen,
  floorY: -0.45,
  turn: 2.2,
  center: [0, 0.32, 0.35],
  boxes: [
    { a: [-1.05, -0.32, -0.9], b: [1.05, 1.25, 0.5], ramp: "body", faces: { px: slots(7, 0.2, 0.8, 0.3, 0.45), nx: slots(7, 0.2, 0.8, 0.3, 0.45) } },
    { a: [-1.05, 1.0, 0.5], b: [1.05, 1.25, 0.7], ramp: "body" },
    { a: [-1.05, -0.32, 0.5], b: [1.05, 0.0, 0.62], ramp: "body", faces: { pz: (u, v) => (inside(u, v, 0.08, 0.11, 0.4, 0.6) ? { emit: EMBER } : inside(u, v, 0.72, 0.92, 0.38, 0.62) ? "key" : null) } },
    { a: [-1.05, 0.0, 0.5], b: [-0.8, 1.0, 0.62], ramp: "body" },
    { a: [0.8, 0.0, 0.5], b: [1.05, 1.0, 0.62], ramp: "body" },
    { a: [-0.9, -0.45, -0.75], b: [0.9, -0.32, 0.45], ramp: "dark" },
    { a: [-1.15, -0.45, 0.85], b: [1.15, -0.25, 1.55], ramp: "body", faces: { py: keys(14, 4, [[12, 1], [13, 1], [0, 0]]) } },
  ],
};

/* a handheld, standing up: d-pad, two buttons, a speaker */
const pocketScreen: Screen = { x0: -0.4, x1: 0.4, y0: 0.3, y1: 0.8, z: 0.16, tint: "pocket" };
const HANDHELD: Model = {
  screen: pocketScreen,
  floorY: -1.05,
  turn: 1.3,
  center: [0, 0, 0.1],
  boxes: [
    {
      a: [-0.62, -1.05, -0.16], b: [0.62, 1.05, 0.16], ramp: "body",
      faces: {
        pz: (u, v) => {
          if (inside(u, v, 0.1, 0.13, 0.27, 0.3)) return { emit: FLARE };
          if (inside(u, v, 0.66, 0.9, 0.8, 0.94)) return ((u * 40) | 0) % 2 && ((v * 40) | 0) % 2 ? "dark" : null;
          return null;
        },
      },
    },
    ...bezel(pocketScreen, [-0.52, 0.52, 0.18, 0.92], 0.04, "dark"),
    { a: [-0.48, -0.32, 0.16], b: [-0.16, -0.22, 0.24], ramp: "dark" },
    { a: [-0.37, -0.43, 0.16], b: [-0.27, -0.11, 0.24], ramp: "dark" },
    { a: [0.3, -0.22, 0.16], b: [0.42, -0.1, 0.23], ramp: "flare" },
    { a: [0.12, -0.36, 0.16], b: [0.24, -0.24, 0.23], ramp: "flare" },
    { a: [-0.2, -0.68, 0.16], b: [-0.06, -0.64, 0.19], ramp: "dark" },
    { a: [0.04, -0.68, 0.16], b: [0.18, -0.64, 0.19], ramp: "dark" },
  ],
};

export const MODELS: Record<ProjectKind, Model> = { app: CRT, game: CABINET, desktop: WIDE, tool: TERMINAL, lab: HANDHELD };

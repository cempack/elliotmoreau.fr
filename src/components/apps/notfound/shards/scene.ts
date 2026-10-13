import { b4, box, CELL, clamp, clearDepth, draw, ease, makeCam, norm, pack, rng, type Face, type Raster, type V3 } from "@/lib/pixel3d";

/**
 * The app that isn't there, in pieces: an app's Dock tile built of cubes,
 * a cube per pixel (the tile a cube deep, its drawing a cube proud of it),
 * come apart and hanging dim in the air. `progress` (0 apart, 1 whole)
 * brings them home, each a little behind or ahead of the others, and they
 * light up in the app's own colours as they arrive. Whole, it faces you
 * square, so it reads as the icon in the Dock.
 *
 * When the alert is pulled about, the loose pieces trail behind it.
 * Paints only while something moves; at rest it costs nothing.
 */

type RGB = [number, number, number];
type Cube = { home: V3; off: V3; lag: number; shrink: number; glyph: boolean; col: string };

const hexRgb = (h: string): RGB => {
  const n = parseInt(h.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export type ShardColours = {
  /** a palette role (or #hex) for each of the drawing's 256 cells, null where empty */
  fills: (string | null)[];
  /** role → #hex (the theme's art palette: paper, ink950…ink500 and the accents) */
  pal: Record<string, string>;
  /** the tile's accent, #hex */
  accent: string;
};

const L = norm([-0.42, 0.66, 0.62]);

export function makeShards(seed: number) {
  let cubes: Cube[] = [];
  let ramps = new Map<string, number[]>();
  let dead: number[] = [];
  let deadGlyph: number[] = [];
  let faces: Face[] = [];
  let progress = 0;
  /** how far the loose pieces trail the alert when it's pulled, in css px */
  let sway: [number, number] = [0, 0];
  let built = "";

  function setIcon(c: ShardColours) {
    const r = rng(seed);
    const P = (k: string) => hexRgb(c.pal[k] ?? c.pal.paper);
    const ink = P("ink950");
    const acc = hexRgb(c.accent);
    const rampOf = (rgb: RGB) => [0.42, 0.62, 0.82, 1, 1].map((k, i) => pack(i === 4 ? mix(rgb, [255, 255, 255], 0.16) : mix(ink, rgb, k)));
    ramps = new Map();
    ramps.set("tile", rampOf(mix(P("ink700"), acc, 0.22)));
    // dim while loose: the tile in the inks, a breath of its accent; the drawing a step lighter
    dead = ["ink800", "ink700", "ink600"].map((k, i) => pack(mix(P(k), acc, 0.06 + i * 0.03)));
    deadGlyph = ["ink700", "ink600", "ink500"].map((k) => pack(P(k)));
    cubes = [];
    const cell = (x: number, y: number, z: number, glyph: boolean, col: string) => {
      // apart: thrown outwards from the middle, mostly sideways (the stage is wide), some towards you
      const a = r() * Math.PI * 2;
      const d = 4 + r() * 8;
      const off: V3 = [Math.cos(a) * d * 1.9 + (x - 8) * 0.5, Math.sin(a) * d * 0.42 + (8 - y) * 0.15, (r() - 0.4) * 8];
      cubes.push({ home: [x - 7.5, 7.5 - y, z], off, lag: r() * 0.4, shrink: r(), glyph, col });
    };
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        // the tile, rounded at its corners
        const cx = Math.min(x, 15 - x);
        const cy = Math.min(y, 15 - y);
        if (cx + cy >= 2 || (cx > 0 && cy > 0)) cell(x, y, 0, false, "tile");
        const f = c.fills[y * 16 + x];
        if (f) {
          const hex = f.startsWith("#") ? f : (c.pal[f] ?? c.pal.paper);
          if (!ramps.has(hex)) ramps.set(hex, rampOf(hexRgb(hex)));
          cell(x, y, 1, true, hex);
        }
      }
    built = "";
  }

  function build(unit: number) {
    const key = `${progress}|${sway[0]}|${sway[1]}|${unit}`;
    if (built === key) return;
    built = key;
    const sx = sway[0] / unit;
    const sy = -sway[1] / unit;
    faces = [];
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      const k = ease(clamp((progress - c.lag * (1 - progress)) / (1 - c.lag * 0.5), 0, 1));
      const away = 1 - k;
      // the loosest pieces trail the most
      const pull = away * (0.6 + c.lag);
      const p: V3 = [c.home[0] + c.off[0] * away + sx * pull, c.home[1] + c.off[1] * away + sy * pull, c.home[2] + c.off[2] * away];
      // a cube shrinks a little while it's loose, so the pieces read as pieces
      const s = 0.5 - away * 0.12 * c.shrink;
      box(faces, [p[0] - s, p[1] - s, p[2] - s], [p[0] + s, p[1] + s, p[2] + s], c.col, { b: i, on: k * k > 0.04 + 0.86 * ((i * 0.618) % 1) });
    }
  }

  function frame(R: Raster) {
    const scale = Math.min(R.w / 38, R.h / 19.5);
    build(scale * CELL);
    R.c.fill(0);
    clearDepth(R);
    const k = ease(progress);
    const cam = makeCam((1 - k) * 0.55 - 0.08 * k, 0.1 + (1 - k) * 0.25, scale, R.w / 2, R.h / 2, [0, 0, 0.5]);
    draw(R, faces, cam, (f, _u, _v, _wx, _wy, _wz, x, y) => {
      const bx = b4(x, y);
      const lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]);
      const cube = cubes[f.b];
      if (!f.on) {
        const rp = cube.glyph ? deadGlyph : dead;
        return rp[clamp(Math.floor((0.2 + 0.8 * lam) * (rp.length - 1) + bx), 0, rp.length - 1)];
      }
      const rp = ramps.get(cube.col)!;
      if (f.side === "z+") {
        // the front holds the drawing flat, in its own colours, as the Dock does; the tile
        // is lit from above, its accent sinking into ink towards the bottom
        if (cube.glyph) return rp[3];
        const g = (cube.home[1] + 8) / 16;
        return rp[clamp(Math.floor((0.5 + 0.45 * g) * (rp.length - 1) + bx), 0, rp.length - 1)];
      }
      // the sides take the light
      return rp[clamp(Math.floor((0.2 + 0.7 * lam) * (rp.length - 1) + bx), 0, rp.length - 1)];
    });
  }

  return {
    setIcon,
    frame,
    get progress() {
      return progress;
    },
    set progress(p: number) {
      progress = clamp(p, 0, 1);
    },
    /** the alert's pull on the loose pieces (css px they lag behind it) */
    setSway(x: number, y: number) {
      sway = [x, y];
    },
  };
}

export type Shards = ReturnType<typeof makeShards>;

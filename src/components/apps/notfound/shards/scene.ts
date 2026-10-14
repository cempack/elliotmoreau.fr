import { b4, CELL, clamp, clearDepth, draw, ease, face, makeCam, norm, pack, rng, type Face, type Raster, type V3 } from "@/lib/pixel3d";

/**
 * The app that isn't there, in pieces: an app's Dock tile built of cubes,
 * a cube per pixel (the tile a cube deep, its drawing a cube proud of it),
 * cracked into seven shards along straight lines, like a dropped
 * ceramic tile. Apart, the shards hang in the air, each turned a little
 * its own way so its edges catch the light, the drawing still on them,
 * dimmed. `progress` (0 apart, 1 whole) brings them home, each a little
 * behind or ahead of the others, and they light up in the app's own
 * colours as they arrive. Whole, it faces you square, so it reads as the
 * icon in the Dock.
 *
 * When the alert is pulled about, the loose pieces trail behind it.
 * Paints only while something moves; at rest it costs nothing.
 */

type RGB = [number, number, number];
type Cell = { x: number; y: number; z: number; col: string; glyph: boolean };
type Shard = {
  cells: Cell[];
  /** its middle, in the tile's units, round which it turns */
  mid: V3;
  off: V3;
  /** how far it's turned, about x, y and z, when apart (radians) */
  turn: V3;
  lag: number;
};

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
/** how many shards it cracks into */
const PIECES = 7;

/** a cube's six sides: outward normal, and its corners as offsets from the cube's centre */
const SIDES: { n: V3; side: string; p: V3[] }[] = [
  { n: [0, 0, 1], side: "z+", p: [[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, -1], side: "z-", p: [[1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]] },
  { n: [1, 0, 0], side: "x+", p: [[1, 1, 1], [1, 1, -1], [1, -1, -1], [1, -1, 1]] },
  { n: [-1, 0, 0], side: "x-", p: [[-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [-1, -1, -1]] },
  { n: [0, 1, 0], side: "y+", p: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, -1, 0], side: "y-", p: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
];

/** a rotation by small angles about x, then y, then z, as a matrix's rows */
function rotation([a, b, c]: V3): [V3, V3, V3] {
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return [
    [cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc],
    [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc],
    [-sb, sa * cb, ca * cb],
  ];
}
const apply = (M: [V3, V3, V3], v: V3): V3 => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];

export function makeShards(seed: number) {
  let shards: Shard[] = [];
  /** per colour: its ramp lit, and dimmed for while it's loose */
  let ramps = new Map<string, { lit: number[]; dim: number[] }>();
  let faces: Face[] = [];
  /** the cell each face belongs to (by the face's k) */
  let owner: Cell[] = [];
  /** every cell of the whole tile, so a side can tell a crack (a neighbour in another shard) from the tile's edge */
  let all = new Set<string>();
  let progress = 0;
  /** how far the loose pieces trail the alert when it's pulled, in css px */
  let sway: [number, number] = [0, 0];
  let built = "";

  function setIcon(c: ShardColours) {
    const r = rng(seed);
    const P = (k: string) => hexRgb(c.pal[k] ?? c.pal.paper);
    const ink = P("ink950");
    const acc = hexRgb(c.accent);
    const rampOf = (rgb: RGB) => [0.42, 0.62, 0.82, 1, 1].map((k, i) => (i === 4 ? mix(rgb, [255, 255, 255], 0.16) : mix(ink, rgb, k)));
    const add = (key: string, rgb: RGB) => {
      const lit = rampOf(rgb);
      // loose, a shard keeps its colours, sunk a little into the ink
      ramps.set(key, { lit: lit.map((v) => pack(v)), dim: lit.map((v) => pack(mix(ink, v, 0.84))) });
    };
    ramps = new Map();
    add("tile", mix(P("ink700"), acc, 0.22));
    // the broken faces, pale like the inside of a fired tile
    add("crack", mix(P("paper"), acc, 0.3));

    // where it cracks: seven points spread over the tile (each the best of a few tries at being far
    // from the others); every cell goes to the nearest, so the cracks run straight
    const sites: [number, number][] = [];
    for (let i = 0; i < PIECES; i++) {
      let best: [number, number] = [8, 8];
      let bd = -1;
      for (let t = 0; t < 12; t++) {
        const c: [number, number] = [1.5 + r() * 13, 1.5 + r() * 13];
        const d = Math.min(...sites.map(([x, y]) => (x - c[0]) ** 2 + (y - c[1]) ** 2), 1e9);
        if (d > bd) {
          bd = d;
          best = c;
        }
      }
      sites.push(best);
    }
    const near = (x: number, y: number) => {
      let best = 0;
      let bd = Infinity;
      sites.forEach(([sx, sy], i) => {
        const d = (x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };
    const groups: Cell[][] = sites.map(() => []);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        // the tile, rounded at its corners
        const cx = Math.min(x, 15 - x);
        const cy = Math.min(y, 15 - y);
        const g = groups[near(x, y)];
        if (cx + cy >= 2 || (cx > 0 && cy > 0)) g.push({ x, y, z: 0, col: "tile", glyph: false });
        const f = c.fills[y * 16 + x];
        if (f) {
          const hex = f.startsWith("#") ? f : (c.pal[f] ?? c.pal.paper);
          if (!ramps.has(hex)) add(hex, hexRgb(hex));
          g.push({ x, y, z: 1, col: hex, glyph: true });
        }
      }

    shards = groups
      .filter((g) => g.length)
      .map((cells) => {
        let mx = 0;
        let my = 0;
        for (const q of cells) {
          mx += q.x - 7.5;
          my += 7.5 - q.y;
        }
        return { cells, mid: [mx / cells.length, my / cells.length, 0.5] as V3, off: [0, 0, 0] as V3, turn: [0, 0, 0] as V3, lag: r() * 0.4 };
      });
    // apart: an exploded view, the shards pulled out sideways across the stage in the order they sat
    // in the tile (so none cross on the way home) and a little up off the hint, some towards you,
    // some away, each turned enough that its edges show
    const order = shards.map((_, i) => i).sort((a, b) => shards[a].mid[0] - shards[b].mid[0]);
    order.forEach((si, n) => {
      const s = shards[si];
      const slot = -16 + ((n + 0.5) * 32) / order.length;
      const x = slot * 0.65 + s.mid[0] * 0.9 + (r() - 0.5) * 1.5;
      const y = clamp(s.mid[1] * 0.85 + (r() - 0.5) * 1.6 + 1.2, -4, 5.5);
      s.off = [clamp(x, -18, 18) - s.mid[0], y - s.mid[1], (r() - 0.5) * 4];
      s.turn = [(r() - 0.5) * 0.7, (r() - 0.5) * 0.8, (r() - 0.5) * 0.5];
    });
    all = new Set(shards.flatMap((s) => s.cells.map((q) => `${q.x},${q.y},${q.z}`)));
    built = "";
  }

  function build(unit: number) {
    const key = `${progress}|${sway[0]}|${sway[1]}|${unit}`;
    if (built === key) return;
    built = key;
    const sx = sway[0] / unit;
    const sy = -sway[1] / unit;
    faces = [];
    owner = [];
    shards.forEach((s, si) => {
      const k = ease(clamp((progress - s.lag * (1 - progress)) / (1 - s.lag * 0.5), 0, 1));
      const away = 1 - k;
      // the loosest pieces trail the most
      const pull = away * (0.6 + s.lag);
      const M = rotation([s.turn[0] * away, s.turn[1] * away, s.turn[2] * away]);
      const at: V3 = [s.mid[0] + s.off[0] * away + sx * pull, s.mid[1] + s.off[1] * away + sy * pull, s.mid[2] + s.off[2] * away];
      // a shard lights up as it arrives
      const on = k > 0.82;
      // which cells this shard has, to leave out the sides that face each other inside it
      const has = new Set(s.cells.map((q) => `${q.x},${q.y},${q.z}`));
      for (const q of s.cells) {
        const local: V3 = [q.x - 7.5 - s.mid[0], 7.5 - q.y - s.mid[1], q.z - s.mid[2]];
        for (const S of SIDES) {
          const nx = q.x + S.n[0];
          const ny = q.y - S.n[1];
          const nz = q.z + S.n[2];
          const key = `${nx},${ny},${nz}`;
          if (has.has(key)) continue;
          const pts = S.p.map((o): V3 => {
            const v = apply(M, [local[0] + o[0] * 0.5, local[1] + o[1] * 0.5, local[2] + o[2] * 0.5]);
            return [v[0] + at[0], v[1] + at[1], v[2] + at[2]];
          });
          face(faces, pts, all.has(key) ? "crack" : q.col, { n: apply(M, S.n), side: S.side, b: si, k: owner.length, on });
          owner.push(q);
        }
      }
    });
  }

  function frame(R: Raster) {
    const k = ease(progress);
    // a step back while it's in pieces, so the loose ones stay on the stage
    const scale = Math.min(R.w / 38, R.h / 19.5) * (0.84 + 0.16 * k);
    build(scale * CELL);
    R.c.fill(0);
    clearDepth(R);
    const cam = makeCam((1 - k) * 0.4 - 0.08 * k, 0.1 + (1 - k) * 0.22, scale, R.w / 2, R.h / 2, [0, 0, 0.5]);
    draw(R, faces, cam, (f, _u, _v, _wx, _wy, _wz, x, y) => {
      const bx = b4(x, y);
      const lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]);
      const q = owner[f.k];
      const { lit, dim } = ramps.get(f.mat)!;
      const rp = f.on ? lit : dim;
      // how much more (or less) light it gets than it would facing you square
      const tilt = lam - L[2];
      if (f.side === "z+") {
        // the front holds the drawing flat, in its own colours, as the Dock does; the tile is lit
        // from above, its accent sinking into ink towards the bottom
        if (q.glyph) return rp[clamp(Math.round(3 + tilt * 2.5), 0, rp.length - 1)];
        const g = (15.5 - q.y) / 16;
        return rp[clamp(Math.floor((0.5 + 0.45 * g + tilt * 0.9) * (rp.length - 1) + bx), 0, rp.length - 1)];
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

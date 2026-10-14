import { INK } from "@/components/apps/atlas/ink";
import {
  add,
  b4,
  box,
  clamp,
  clearDepth,
  cross,
  draw,
  face,
  halo,
  hash2,
  makeCam,
  mul,
  norm,
  P,
  pack,
  prism,
  ramp,
  sub,
  type Face,
  type Raster,
  type V3,
} from "@/lib/pixel3d";
import type { RoomPhase, RoomState } from "../state";

/**
 * Elliot's room in the round: a cutaway diorama in the globe's inks, drawn
 * by the pixel renderer (lib/pixel3d.ts). The back wall holds the window
 * over the Garonne with the desk under it; the left wall the shelf (a book
 * per post), the board (a postcard per trip) and the record cabinet with
 * its deck. The two walls nearest you are cut down to a stub, so you
 * always see in. Drag to turn it, through about a quarter turn.
 *
 * Everything is live, as in the flat room: the window's sky and light
 * follow the hour (by day the sun lays the window on the floor, from dusk
 * the desk lamp is on and warms what's near it), rain streaks the glass,
 * the clock keeps Toulouse time, the arm is on the record while something
 * plays and the sleeve is the real cover.
 *
 * Paints when something changes and while it turns; at rest it costs
 * nothing. Each thing that opens an app is its own object in the picking
 * buffer, and `boxes` says where each landed on screen.
 */

type RGB = readonly [number, number, number];

/** the things with doors, in the picking buffer's order (RoomSpots' keys) */
export const THINGS = ["window", "laptop", "turntable", "shelf", "board", "tray"] as const;
export type Thing = (typeof THINGS)[number];
const ID = { window: 0, laptop: 1, turntable: 2, shelf: 3, board: 4, tray: 5, clock: 6, lamp: 7 } as const;

/* the room, in world units: x across the back wall, y up, z out from it */
const RW = 12;
const RD = 9;
const RH = 6.4;
const T = 0.25; // the walls' thickness
const STUB = 0.45; // what's left of a cut wall
const WIN = { x0: 5.5, x1: 9.9, y0: 2.75, y1: 5.55 };
const DESK = { x0: 4.5, x1: 10.9, y: 2.55, z0: 0.2, z1: 2.5 };
const LAMP: V3 = [5.25, 3.95, 0.95];

/** the yaw it opens at, and how far it turns: the left wall always stays up */
const YAW0 = -0.58;
const YAW: [number, number] = [-1.3, -0.1];
const PITCH0 = 0.5;
const PITCH: [number, number] = [0.3, 0.82];

const mixC = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const night: RGB = INK.oceanNight as RGB;

/** a material: its ramp in the cool light, and warmed by the lamp */
const ramps: Record<string, [number[], number[]]> = {};
function mat(name: string, list: RGB[]) {
  ramps[name] = [ramp(list), ramp(list.map((c) => mixC(c, INK.light as RGB, 0.38)))];
}
mat("wall", [[16, 18, 44], [27, 29, 68], [40, 44, 104], [58, 63, 140], [76, 82, 170], [96, 102, 196]]);
mat("wall2", [[14, 16, 40], [24, 26, 62], [36, 40, 96], [52, 57, 130], [70, 75, 160], [88, 94, 186]]);
mat("floor", [[12, 12, 32], [22, 20, 50], [34, 31, 72], [48, 44, 98], [64, 58, 124], [84, 76, 150]]);
mat("wood", [[24, 22, 56], [44, 40, 96], [70, 64, 140], [100, 92, 186], [136, 129, 234], [168, 160, 240]]);
mat("dark", [[6, 7, 20], [12, 14, 38], [22, 26, 64], [34, 40, 90], [50, 58, 120], [70, 80, 150]]);
mat("metal", [[24, 31, 78], [50, 58, 120], [90, 100, 170], [136, 140, 210], [178, 172, 234], [216, 212, 247]]);
mat("rug", [[30, 14, 30], [60, 22, 46], [100, 34, 60], [150, 46, 70], [200, 60, 80], [240, 90, 100]]);
mat("cork", [[40, 26, 30], [70, 46, 48], [104, 70, 66], [140, 98, 84], [176, 130, 104], [206, 160, 128]]);
mat("cloth", [[8, 22, 30], [14, 38, 48], [22, 58, 70], [34, 84, 96], [50, 112, 120], [72, 140, 146]]);
const BOOKS: RGB[] = [[86, 93, 192], [255, 184, 107], [139, 233, 255], [198, 255, 94], [240, 51, 74], [178, 172, 234]];
BOOKS.forEach((c, i) => mat(`book${i}`, [0.8, 0.6, 0.42, 0.25, 0.1, 0].map((k) => mixC(c, night, k))));

type Tex = { w: number; h: number; b: Uint32Array };
const makeTex = (w: number, h: number, fn: (x: number, y: number) => number): Tex => {
  const b = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = fn(x, y) >>> 0;
  return { w, h, b };
};
const sample = (t: Tex, u: number, v: number) => t.b[clamp(Math.floor(v * t.h), 0, t.h - 1) * t.w + clamp(Math.floor(u * t.w), 0, t.w - 1)];

/** the light, by the hour outside */
const AMBIENT: Record<RoomPhase, number> = { day: 0.5, dawn: 0.34, dusk: 0.3, night: 0.14 };
/** towards the sun, through the window (it's behind the back wall) */
const SUN = norm([-0.3, 0.62, -1]);

type Walls = "back" | "left" | "right" | "front";
/** each wall's inside face: a wall you can't see the inside of is between you and the room */
const INSIDE: Record<Walls, V3> = { back: [0, 0, 1], left: [1, 0, 0], right: [-1, 0, 0], front: [0, 0, -1] };

export type Rect = { x: number; y: number; w: number; h: number };

export function makeRoundRoom(reduced: boolean) {
  let state: RoomState | null = null;
  let cover: Uint32Array | null = null;
  let tex: { sky: Tex; screen: Tex; sleeve: Tex; clock: Tex; board: Tex } | null = null;
  // drawn nearest first, so what's hidden behind is never shaded: the furniture, what hangs on
  // the walls, the floor, then the walls themselves (or their stubs)
  const none = (): Record<Walls, Face[]> => ({ back: [], left: [], right: [], front: [] });
  let always: Face[] = [];
  let shell: Face[] = [];
  let hung = none();
  let walls = none();
  let stubs = none();
  let yaw = YAW0;
  let pitch = PITCH0;
  let vYaw = 0;
  let held = false;
  let lit = -1;
  let band = { top: 0, bottom: 0 };
  let found: Partial<Record<Thing, Rect>> = {};

  function textures(s: RoomState) {
    const ph = s.phase;
    // the window: the Garonne, the far quay and the Dôme de la Grave in this light
    const W = 48;
    const H = 32;
    const skyTop: RGB = ph === "day" ? [96, 140, 220] : ph === "dawn" ? [70, 64, 140] : ph === "dusk" ? [58, 50, 120] : [5, 6, 17];
    const skyLow: RGB = ph === "day" ? [178, 200, 240] : ph === "dawn" ? [255, 196, 150] : ph === "dusk" ? [255, 160, 96] : [27, 32, 78];
    const water: RGB = ph === "day" ? [58, 80, 150] : ph === "dawn" ? [96, 84, 140] : ph === "dusk" ? [70, 52, 100] : [10, 13, 38];
    const qy = Math.round(H * 0.62);
    const sky = makeTex(W, H, (x, y) => {
      const bx = b4(x, y);
      if (y < qy) {
        if (ph === "night" && hash2(x * 3, y * 7) < 0.03) return pack(INK.iceHi as RGB);
        return pack(mixC(skyTop, skyLow, clamp(y / qy + (bx - 0.5) * 0.25, 0, 1)));
      }
      const r = (y - qy) / (H - qy);
      return pack(mixC(water, night, r * 0.5 * bx));
    });
    const sil = pack(ph === "day" ? (INK.landLo as RGB) : ph === "dawn" ? [44, 36, 80] : ph === "dusk" ? [34, 28, 62] : [6, 7, 20]);
    const put = (x: number, y: number, c: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H) sky.b[y * W + x] = c;
    };
    for (let x = 0; x < W; x++) for (let y = qy - 4; y < qy; y++) put(x, y, sil);
    for (let x = 3; x < W - 3; x++) {
      const hh = 2 + ((x * 13) % 5 > 2 ? 3 : 1);
      for (let y = qy - 4 - hh; y < qy - 4; y++) put(x, y, sil);
    }
    const dc = 31;
    const dr = 7;
    for (let y = -dr; y <= 0; y++) for (let x = -dr; x <= dr; x++) if (x * x + y * y * 1.6 <= dr * dr) put(dc + x, qy - 9 + y, sil);
    for (let y = qy - 9 - dr - 4; y < qy - 9 - dr; y++) put(dc, y, sil);
    for (let x = dc - 8; x <= dc + 8; x++) for (let y = qy - 9; y < qy - 4; y++) put(x, y, sil);
    // the far bank's windows, lit after dark, each with its broken streak on the river
    if (ph !== "day")
      for (let i = 0; i < (ph === "dawn" ? 4 : 14); i++) {
        const x = 3 + ((i * 17) % 42);
        const y = qy - 6 + ((i * 5) % 3);
        if (sky.b[y * W + x] !== sil) continue;
        put(x, y, P.light);
        for (let yy = qy + 1; yy < H - 1; yy += 2) if (hash2(x, yy) < 0.7 - (yy - qy) * 0.04) put(x + (yy & 2 ? 1 : 0), yy, P.light);
      }
    // rain on the glass
    if (s.rain)
      for (let x = 0; x < W; x += 3)
        for (let y = 0; y < H; y++) if (hash2(x, (y + x * 5) >> 2) < 0.16) put(x + ((y >> 2) & 1), y, pack(mixC(skyLow, [255, 255, 255], 0.3)));

    // the laptop's screen: code
    const CODE = [P.lime, pack(INK.landHi as RGB), P.light, P.ion, pack(INK.iceHi as RGB)];
    const screen = makeTex(40, 26, (x, y) => {
      if (y < 3) return x < 3 ? P.flare : P.oceanNight2;
      if (y % 3 !== 1 || x < 2) return P.oceanNight;
      const row = (y / 3) | 0;
      const ind = 2 + ((row * 5) % 4) * 2;
      const ln = ind + 6 + ((row * 13) % 22);
      if (x < ind || x > ln) return P.oceanNight;
      return CODE[(row + (((x - ind) / 5) | 0)) % CODE.length];
    });

    // the sleeve: the real cover when there is one, else a dithered sun
    const sleeve = makeTex(16, 16, (x, y) => {
      if (cover) return cover[y * 16 + x];
      const d = Math.hypot(x - 10, y - 6) / 9;
      if (d < 0.5) return b4(x, y) < 0.6 ? P.light : P.flare;
      return (y + x * 0.4) / 22 > b4(x, y) ? pack([60, 22, 46]) : pack([20, 14, 40]);
    });

    // the clock, at Toulouse time
    const clock = makeTex(17, 17, (x, y) => {
      const dx = x - 8;
      const dy = y - 8;
      const d = Math.hypot(dx, dy);
      if (d > 8.4) return 0;
      if (d > 7.2) return pack(INK.landLo as RGB);
      const hand = (a: number, l: number) => {
        const ax = Math.sin(a) * l;
        const ay = -Math.cos(a) * l;
        const k = clamp((dx * ax + dy * ay) / (l * l), 0, 1);
        return Math.hypot(dx - ax * k, dy - ay * k) < 0.62;
      };
      if (hand((((s.hour % 12) + s.minute / 60) / 12) * Math.PI * 2, 4.2)) return P.oceanNight;
      if (hand((s.minute / 60) * Math.PI * 2, 6.2)) return P.flare;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (Math.hypot(dx - Math.sin(a) * 6.3, dy + Math.cos(a) * 6.3) < 0.6) return P.oceanDeep;
      }
      return pack(INK.ice as RGB);
    });

    // a postcard per trip, pinned to the cork
    const PC: RGB[] = [[136, 129, 234], [255, 184, 107], [139, 233, 255], [198, 255, 94], [178, 172, 234], [240, 51, 74]];
    const cards = Math.max(0, Math.min(6, s.places));
    const board = makeTex(30, 16, (x, y) => {
      for (let i = 0; i < cards; i++) {
        const cx = 1 + (i % 3) * 10;
        const cy = 1 + Math.floor(i / 3) * 8;
        if (x >= cx && x < cx + 8 && y >= cy && y < cy + 6) {
          if (y === cy || x === cx) return pack([245, 242, 236]);
          return (x + y) % 3 === 0 ? pack(mixC(PC[i], [255, 255, 255], 0.3)) : pack(PC[i]);
        }
      }
      return 0;
    });
    tex = { sky, screen, sleeve, clock, board };
  }

  function build(s: RoomState) {
    always = [];
    shell = [];
    hung = none();
    walls = none();
    stubs = none();
    const A = always;
    const B = hung.back;
    const Lw = hung.left;
    // the walls as slabs; the ones facing you drop to a stub, which is the cutaway
    box(walls.back, [-T, 0, -T], [RW + T, RH, 0], "wall");
    box(walls.left, [-T, 0, -T], [0, RH, RD + T], "wall2");
    box(walls.right, [RW, 0, -T], [RW + T, RH, RD + T], "wall2");
    box(walls.front, [-T, 0, RD], [RW + T, RH, RD + T], "wall");
    box(stubs.back, [-T, 0, -T], [RW + T, STUB, 0], "wall");
    box(stubs.left, [-T, 0, -T], [0, STUB, RD + T], "wall2");
    box(stubs.right, [RW, 0, -T], [RW + T, STUB, RD + T], "wall2");
    box(stubs.front, [-T, 0, RD], [RW + T, STUB, RD + T], "wall");
    face(shell, [[0, 0, 0], [RW, 0, 0], [RW, 0, RD], [0, 0, RD]], "floor", { n: [0, 1, 0] });
    box(shell, [-T, -0.35, -T], [RW + T, 0, RD + T], "dark");

    /* the back wall: the window over the river, its curtains, the clock */
    face(B, [[WIN.x0, WIN.y1, 0.03], [WIN.x1, WIN.y1, 0.03], [WIN.x1, WIN.y0, 0.03], [WIN.x0, WIN.y0, 0.03]], "sky", { n: [0, 0, 1], b: ID.window });
    const mid = (WIN.x0 + WIN.x1) / 2;
    box(B, [WIN.x0 - 0.15, WIN.y0 - 0.22, 0], [WIN.x1 + 0.15, WIN.y0, 0.34], "metal", { b: ID.window });
    box(B, [WIN.x0 - 0.15, WIN.y1, 0], [WIN.x1 + 0.15, WIN.y1 + 0.14, 0.12], "metal", { b: ID.window });
    box(B, [mid - 0.06, WIN.y0, 0], [mid + 0.06, WIN.y1, 0.1], "metal", { b: ID.window });
    box(B, [WIN.x0, WIN.y1 - 0.75, 0], [WIN.x1, WIN.y1 - 0.65, 0.1], "metal", { b: ID.window });
    for (const x of [WIN.x0 - 0.75, WIN.x1 + 0.15]) box(B, [x, WIN.y0 - 0.5, 0.05], [x + 0.6, WIN.y1 + 0.35, 0.3], "cloth", { b: ID.window });
    box(B, [WIN.x0 - 0.95, WIN.y1 + 0.35, 0.12], [WIN.x1 + 0.95, WIN.y1 + 0.45, 0.22], "dark", { b: ID.window });
    face(B, [[2.4, 5.4, 0.04], [3.4, 5.4, 0.04], [3.4, 4.4, 0.04], [2.4, 4.4, 0.04]], "clock", { n: [0, 0, 1], b: ID.clock });

    /* the desk under the window, the laptop, the lamp, the letter tray, the chair */
    box(A, [DESK.x0, DESK.y, DESK.z0], [DESK.x1, DESK.y + 0.25, DESK.z1], "wood");
    for (const [x, z] of [[DESK.x0 + 0.15, DESK.z0 + 0.15], [DESK.x1 - 0.33, DESK.z0 + 0.15], [DESK.x0 + 0.15, DESK.z1 - 0.33], [DESK.x1 - 0.33, DESK.z1 - 0.33]])
      box(A, [x, 0, z], [x + 0.18, DESK.y, z + 0.18], "wood");
    box(A, [DESK.x1 - 1.7, 1.6, DESK.z0 + 0.1], [DESK.x1 - 0.2, DESK.y, DESK.z1 - 0.1], "wood");
    const top = DESK.y + 0.25;
    box(A, [6.6, top, 0.9], [8.7, top + 0.1, 2.15], "metal", { b: ID.laptop });
    face(A, [[6.6, top + 1.35, 0.7], [8.7, top + 1.35, 0.7], [8.7, top + 0.1, 0.92], [6.6, top + 0.1, 0.92]], "screen", { b: ID.laptop });
    face(A, [[8.7, top + 1.35, 0.68], [6.6, top + 1.35, 0.68], [6.6, top + 0.1, 0.9], [8.7, top + 0.1, 0.9]], "metal", { b: ID.laptop });
    box(A, [LAMP[0] - 0.2, top, LAMP[2] - 0.2], [LAMP[0] + 0.2, top + 0.1, LAMP[2] + 0.2], "metal", { b: ID.lamp });
    box(A, [LAMP[0] - 0.05, top + 0.1, LAMP[2] - 0.05], [LAMP[0] + 0.05, LAMP[1] - 0.2, LAMP[2] + 0.05], "metal", { b: ID.lamp });
    box(A, [LAMP[0] - 0.35, LAMP[1] - 0.2, LAMP[2] - 0.35], [LAMP[0] + 0.35, LAMP[1] + 0.3, LAMP[2] + 0.35], "shade", { b: ID.lamp });
    box(A, [9.3, top, 1.1], [9.95, top + 0.15, 1.95], "dark", { b: ID.tray });
    face(A, [[9.38, top + 0.2, 1.2], [9.87, top + 0.2, 1.2], [9.87, top + 0.2, 1.85], [9.38, top + 0.2, 1.85]], "paper", { b: ID.tray, n: [0, 1, 0] });
    box(A, [6.9, 1.45, 3.0], [8.4, 1.62, 4.3], "dark");
    box(A, [6.9, 1.62, 4.15], [8.4, 3.3, 4.3], "dark");
    for (const [x, z] of [[6.95, 3.05], [8.23, 3.05], [6.95, 4.12], [8.23, 4.12]]) box(A, [x, 0, z], [x + 0.12, 1.45, z + 0.12], "dark");
    face(A, [[3.4, 0.02, 4.4], [9.4, 0.02, 4.4], [9.4, 0.02, 7.9], [3.4, 0.02, 7.9]], "rug", { n: [0, 1, 0] });

    /* the left wall: the shelf (a book per post) and the board (a card per trip) above it */
    box(Lw, [0, 3.55, 1.0], [0.65, 3.68, 4.4], "wood", { b: ID.shelf });
    let z = 1.15;
    for (let i = 0; i < Math.max(1, Math.min(6, s.posts)); i++) {
      const t = 0.22 + ((i * 7) % 3) * 0.05;
      const hh = 0.75 + ((i * 5) % 4) * 0.1;
      box(Lw, [0.08, 3.68, z], [0.56, 3.68 + hh, z + t], `book${i}`, { b: ID.shelf });
      z += t + 0.03;
    }
    box(Lw, [0, 4.75, 1.0], [0.08, 6.0, 4.4], "cork", { b: ID.board });
    face(Lw, [[0.09, 6.0, 1.0], [0.09, 6.0, 4.4], [0.09, 4.75, 4.4], [0.09, 4.75, 1.0]], "board", { n: [1, 0, 0], b: ID.board });

    /* the record cabinet and its deck, standing against the left wall */
    box(A, [0, 0, 5.2], [1.9, 1.9, 8.5], "wood", { b: ID.turntable });
    box(A, [0.15, 1.9, 5.5], [1.8, 2.15, 7.8], "dark", { b: ID.turntable });
    prism(A, "y", [0.95, 2.22, 6.5], 0.62, 0.07, 18, "dark", "record", { b: ID.turntable });
    box(A, [1.45, 2.15, 7.2], [1.65, 2.55, 7.4], "metal", { b: ID.turntable });
    const a0: V3 = [1.55, 2.5, 7.3];
    const to: V3 = s.playing ? [1.0, 2.36, 6.85] : [1.55, 2.36, 7.15];
    const side = norm(cross(norm(sub(to, a0)), [0, 1, 0]));
    const w = 0.06;
    face(A, [add(a0, mul(side, -w)), add(a0, mul(side, w)), add(to, mul(side, w)), add(to, mul(side, -w))], "metal", {
      b: ID.turntable,
      two: true,
      n: [0, 1, 0],
    });
    face(A, [[2.0, 1.75, 5.9], [2.0, 1.75, 7.5], [2.35, 0, 7.5], [2.35, 0, 5.9]], "sleeve", { b: ID.turntable, n: norm([1, 0.2, 0]) });
  }

  function frame(R: Raster, _t: number, dt: number) {
    if (!state || !tex) return Infinity;
    // a throw keeps turning a moment, slowing
    let moving = held;
    if (!held && vYaw) {
      yaw += vYaw * dt;
      vYaw *= Math.pow(0.02, dt);
      if (yaw <= YAW[0] || yaw >= YAW[1] || Math.abs(vYaw) < 0.02) vYaw = 0;
      yaw = clamp(yaw, YAW[0], YAW[1]);
      moving = vYaw !== 0;
    }

    const top = band.bottom > band.top ? band.top : 0;
    const bottom = band.bottom > band.top ? band.bottom : R.h;
    const h = bottom - top;
    const scale = Math.min(R.w / 16.5, h / 12.6);
    const cam = makeCam(yaw, pitch, scale, R.w / 2, top + h * 0.58, [RW / 2, 2.3, RD / 2]);
    const up = (k: Walls) => cam.facing(INSIDE[k]) > 0.05;
    const sides = Object.keys(INSIDE) as Walls[];
    const shown: Face[] = [...always];
    for (const k of sides) if (up(k)) shown.push(...hung[k]);
    shown.push(...shell);
    for (const k of sides) shown.push(...(up(k) ? walls[k] : stubs[k]));

    halo(R, R.w / 2, top + h * 0.55, Math.min(R.w, h) * 0.75);
    clearDepth(R);
    const s = state;
    const T_ = tex;
    const amb = AMBIENT[s.phase];
    const lampOn = s.phase === "night" || s.phase === "dusk";
    const sunIn = s.phase === "day" ? 0.75 : s.phase === "dawn" ? 0.4 : s.phase === "dusk" ? 0.3 : 0;
    const lampK = s.phase === "night" ? 1.25 : 0.7;
    const sunWarm = s.phase !== "day" ? 0.7 : 0;
    const PAPER = pack([236, 230, 220]);
    const PAPER2 = pack(INK.ice as RGB);
    const GROOVE = pack([24, 26, 40]);
    // what doesn't change across a face, worked out once per face (draw goes a face at a time)
    let cf: Face | null = null;
    let kind = 0;
    let base = 0;
    let sunLam = 0;
    let cool: number[] = ramps.wall[0];
    let warmR: number[] = ramps.wall[1];
    let tx: Tex | null = null;
    draw(R, shown, cam, (f, u, v, wx, wy, wz, x, y) => {
      const bx = b4(x, y);
      if (f !== cf) {
        cf = f;
        const m = f.mat;
        tx = m === "sky" ? T_.sky : m === "screen" ? T_.screen : m === "board" ? T_.board : m === "clock" ? T_.clock : m === "sleeve" ? T_.sleeve : null;
        kind = tx ? 1 : m === "paper" ? 2 : m === "shade" ? 3 : m === "record" ? 4 : m === "floor" ? 5 : m === "rug" ? 6 : 0;
        const n = f.n;
        base = amb * (0.55 + 0.45 * Math.max(0, n[1] * 0.6 + n[2] * 0.3 + n[0] * 0.2)) + (lit >= 0 && f.b === lit ? 0.2 : 0);
        sunLam = sunIn ? Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) * sunIn : 0;
        [cool, warmR] = ramps[m] ?? ramps.wall;
      }
      switch (kind) {
        case 1:
          return sample(tx!, u, v);
        case 2:
          return bx < 0.7 ? PAPER : PAPER2;
        case 3:
          return lampOn ? (f.side === "top" || bx < 0.3 ? P.lightHot : P.light) : bx < 0.5 ? ramps.metal[0][2] : ramps.metal[0][3];
        case 4: {
          const r = Math.sqrt((wx - 0.95) * (wx - 0.95) + (wz - 6.5) * (wz - 6.5));
          if (r < 0.18) return P.flare;
          return ((r * 30) | 0) % 2 ? P.oceanNight : GROOVE;
        }
      }
      // ambient, the window's patch of sun, the lamp
      let l = base;
      let warm = 0;
      if (sunLam && wz > 0.05) {
        const k = -wz / SUN[2];
        const hx = wx + k * SUN[0];
        const hy = wy + k * SUN[1];
        if (hx > WIN.x0 && hx < WIN.x1 && hy > WIN.y0 && hy < WIN.y1) {
          l += sunLam;
          warm = sunWarm;
        }
      }
      if (lampOn) {
        const dx = LAMP[0] - wx;
        const dy = LAMP[1] - wy;
        const dz = LAMP[2] - wz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const n = f.n;
        const dot = n[0] * dx + n[1] * dy + n[2] * dz;
        if (dot > 0) {
          const k = (dot / Math.sqrt(d2) / (1 + d2 * 0.09)) * lampK;
          l += k;
          if (k * 1.6 > warm) warm = k * 1.6;
        }
      }
      if (kind === 5) {
        const p = wz * 2.2;
        if (p % 1 < 0.08) l *= 0.5;
        if ((p | 0) & 1) l *= 0.92;
      } else if (kind === 6) {
        const ex = Math.min(u, 1 - u, v, 1 - v);
        if (ex < 0.06) l *= 0.6;
        else if (((Math.floor(u * 14) + Math.floor(v * 9)) & 1) === 0) l *= 0.82;
      }
      const rp = warm > bx ? warmR : cool;
      return rp[clamp(Math.floor(l * (rp.length - 1) * 1.15 + bx), 0, rp.length - 1)];
    });

    // where each thing landed, once it has stopped moving (the doors follow)
    if (!moving) {
      const x0 = new Array(THINGS.length).fill(Infinity);
      const y0 = new Array(THINGS.length).fill(Infinity);
      const x1 = new Array(THINGS.length).fill(-Infinity);
      const y1 = new Array(THINGS.length).fill(-Infinity);
      const id = R.id;
      for (let yy = 0, k = 0; yy < R.h; yy++)
        for (let xx = 0; xx < R.w; xx++, k++) {
          const i = id[k];
          if (i < 0 || i >= THINGS.length) continue;
          if (xx < x0[i]) x0[i] = xx;
          if (xx > x1[i]) x1[i] = xx;
          if (yy < y0[i]) y0[i] = yy;
          if (yy > y1[i]) y1[i] = yy;
        }
      found = {};
      THINGS.forEach((t, i) => {
        if (x1[i] >= x0[i]) found[t] = { x: x0[i], y: y0[i], w: x1[i] - x0[i] + 1, h: y1[i] - y0[i] + 1 };
      });
    }
    return moving ? 0 : Infinity;
  }

  return {
    /** what's live in the room; the cover as 16×16 packed pixels */
    set(s: RoomState, art: Uint32Array | null) {
      state = s;
      cover = art;
      textures(s);
      build(s);
    },
    /** the band the room sits in, between the menu bar and the Dock, in cells */
    setBand(top: number, bottom: number) {
      band = { top, bottom };
    },
    /** light up one thing (its index in THINGS), or none */
    light(i: number) {
      if (i === lit) return false;
      lit = i;
      return true;
    },
    grab() {
      held = true;
      vYaw = 0;
    },
    /** a drag: px across and down, over ms */
    turn(dx: number, dy: number, ms: number) {
      const k = 0.008;
      yaw = clamp(yaw + dx * k, YAW[0], YAW[1]);
      pitch = clamp(pitch + dy * 0.004, PITCH[0], PITCH[1]);
      if (ms > 0) vYaw = vYaw * 0.4 + ((dx * k) / (ms / 1000)) * 0.6;
    },
    release(still: boolean) {
      held = false;
      if (still || reduced) vYaw = 0;
      vYaw = clamp(vYaw, -3, 3);
    },
    /** a step round, for the arrow keys */
    nudge(d: number) {
      yaw = clamp(yaw + d, YAW[0], YAW[1]);
    },
    /** where each thing with a door landed, in cells (absent: out of sight) */
    boxes: () => found,
    frame,
  };
}

export type RoundRoom = ReturnType<typeof makeRoundRoom>;

/** a cover image as 16×16 packed pixels for the sleeve (null when it can't be read: no CORS) */
export function coverPixels(img: CanvasImageSource | null): Uint32Array | null {
  if (!img) return null;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) out[i] = pack([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    return out;
  } catch {
    return null;
  }
}

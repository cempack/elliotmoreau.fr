/**
 * The sky a post went out under, as an object: Saint-Sernin's quarter of
 * Toulouse under a glass dome, on the globe's turntable. Inside the glass
 * is the real sky over Toulouse at the minute the post went out (the
 * stars, the Milky Way, the moon at its phase, the sun, four planets), and
 * it lights the town: by day the sun throws the belltower's shadow across
 * the roofs from where it really stood; at dusk the low light goes long;
 * at night the basilica is floodlit, the windows lit by the local hour,
 * the moon on the roofs and the Garonne.
 *
 * From outside, the far side of the glass is the sky as you'd see it from
 * the square, facing the same way: turning the dome brings the rest of it
 * round. The date is on the plinth, like a film camera's stamp.
 *
 * Nothing runs on its own: `render` paints once per camera and moment;
 * `compose` lays the constellations and the stamp over it, cheaply enough
 * for every frame of a fade.
 */

import {
  P as INKS,
  box,
  clearDepth,
  draw,
  face,
  halo,
  inShadow,
  makeCam,
  makeRaster,
  makeShadow,
  norm,
  pack as pack3,
  prism,
  ramp,
  renderShadow,
  turntable,
  turntableInk,
  type Cam,
  type Face,
  type Raster,
  type Shadow,
  type V3,
} from "@/lib/pixel3d";
import {
  CONS,
  NS,
  P,
  PLANETS,
  POLARIS,
  R,
  SBV,
  SMAG,
  SV,
  amber,
  b4,
  capitals,
  clamp,
  darkness,
  drawText,
  hash2,
  limitOf,
  litShare,
  mv,
  paintMoon,
  rng,
  skyAt,
  skyShader,
  stampOf,
  starInk,
  textW,
  type Vec,
} from "./astro";

/* ───── the model, in units of the dome's radius: x east, y up, z south ───── */

/** the plinth's height and radius, the turntable's radius */
const BASE = 0.2;
const PLINTH_R = 1.05;
const TURN_R = 1.36;
/** the brass ring the glass stands in */
const RING = 1.0;

/** the Garonne, along the west: its middle at each z, and its half-width */
const riverX = (z: number) => -0.7 - 0.07 * z + 0.12 * z * z;
const RIVER_W = 0.085;
/** the square round the basilica */
const PLAZA = [-0.58, 0.48, -0.36, 0.36];
/** the crossing, where the belltower stands */
const TX = 0.11;

/** the tower's five tiers (radius, bottom, top), then the spire's foot and tip */
const TIERS = [
  [0.076, 0.11, 0.21],
  [0.068, 0.21, 0.29],
  [0.061, 0.29, 0.36],
  [0.054, 0.36, 0.42],
  [0.047, 0.42, 0.47],
];
const SPIRE = [0.042, 0.47, 0.7];

/** a pyramid or cone of n sides on a base ring (rotated by `rot`), its faces lit as their slope */
function cone(out: Face[], c: V3, r: number, h: number, n: number, mat: string, rot = 0, b = -1) {
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2;
    const a1 = rot + ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const p0: V3 = [c[0] + Math.cos(a0) * r, c[1], c[2] + Math.sin(a0) * r];
    const p1: V3 = [c[0] + Math.cos(a1) * r, c[1], c[2] + Math.sin(a1) * r];
    const tip: V3 = [c[0], c[1] + h, c[2]];
    const slope = Math.atan2(r * Math.cos(Math.PI / n), h);
    face(out, [tip, p1, p0], mat, { n: norm([Math.cos(am) * Math.cos(slope), Math.sin(slope), Math.sin(am) * Math.cos(slope)]), b });
  }
}

/** a band of roof between two rings (a frustum), sloping out and down */
function frustum(out: Face[], c: V3, r0: number, y0: number, r1: number, y1: number, n: number, mat: string, b = -1) {
  const slope = Math.atan2(r0 - r1, y1 - y0);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const ring = (a: number, r: number, y: number): V3 => [c[0] + Math.cos(a) * r, y, c[2] + Math.sin(a) * r];
    face(out, [ring(a0, r1, y1), ring(a1, r1, y1), ring(a1, r0, y0), ring(a0, r0, y0)], mat, {
      n: norm([Math.cos(am) * Math.cos(slope), Math.sin(slope), Math.sin(am) * Math.cos(slope)]),
      b,
    });
  }
}

/** a house: brick walls to `h`, a tiled roof rising `rise` to a ridge along its longer side */
function house(out: Face[], x0: number, z0: number, x1: number, z1: number, h: number, rise: number, mat: string, roof: string, b: number) {
  box(out, [x0, 0, z0], [x1, h, z1], mat, { b });
  const top = h + rise;
  if (x1 - x0 >= z1 - z0) {
    const zc = (z0 + z1) / 2;
    const s = norm([0, (z1 - z0) / 2, -rise]);
    face(out, [[x0, top, zc], [x1, top, zc], [x1, h, z0], [x0, h, z0]], roof, { n: [0, s[1], s[2]], b, side: "roof" });
    face(out, [[x1, top, zc], [x0, top, zc], [x0, h, z1], [x1, h, z1]], roof, { n: [0, s[1], -s[2]], b, side: "roof" });
    face(out, [[x1, h, z0], [x1, h, z1], [x1, top, zc]], mat, { n: [1, 0, 0], b, side: "gable" });
    face(out, [[x0, h, z1], [x0, h, z0], [x0, top, zc]], mat, { n: [-1, 0, 0], b, side: "gable" });
  } else {
    const xc = (x0 + x1) / 2;
    const s = norm([-rise, (x1 - x0) / 2, 0]);
    face(out, [[xc, top, z1], [xc, top, z0], [x0, h, z0], [x0, h, z1]], roof, { n: [s[0], s[1], 0], b, side: "roof" });
    face(out, [[xc, top, z0], [xc, top, z1], [x1, h, z1], [x1, h, z0]], roof, { n: [-s[0], s[1], 0], b, side: "roof" });
    face(out, [[x0, h, z1], [x1, h, z1], [xc, top, z1]], mat, { n: [0, 0, 1], b, side: "gable" });
    face(out, [[x1, h, z0], [x0, h, z0], [xc, top, z0]], mat, { n: [0, 0, -1], b, side: "gable" });
  }
}

/** a lean-to roof over an aisle along x: from `hi` at the nave's wall (z = zi) down to `lo` at its outer wall (z = zo) */
function leanTo(out: Face[], x0: number, x1: number, zi: number, zo: number, hi: number, lo: number, mat: string) {
  const s = Math.sign(zo - zi);
  const n = norm([0, Math.abs(zo - zi), s * (hi - lo)]);
  if (s > 0) face(out, [[x0, hi, zi], [x1, hi, zi], [x1, lo, zo], [x0, lo, zo]], mat, { n, side: "roof" });
  else face(out, [[x1, hi, zi], [x0, hi, zi], [x0, lo, zo], [x1, lo, zo]], mat, { n, side: "roof" });
}

/** the floor: the turntable, the plinth, the ground inside the glass */
const FLOOR: Face[] = [];
/** the town: everything that stands up and casts a shadow */
const TOWN: Face[] = [];
/** the houses so far (each one's id, for its windows and its outline) */
let HOUSES = 0;
/** the basilica, the bridge: one id each for their outlines */
const CHURCH_ID = 9000;
const BRIDGE_ID = 9001;
{
  turntable(FLOOR, TURN_R, -BASE, "table");
  prism(FLOOR, "y", [0, -BASE / 2, 0], PLINTH_R, BASE / 2, 64, "plinth", null);
  turntable(FLOOR, PLINTH_R, 0, "ground");
  for (const f of FLOOR) f.cast = false;

  // Saint-Sernin: the nave and choir, two aisles a side stepping down, the transept
  const C = "church";
  const CR = "churchRoof";
  house(TOWN, -0.46, -0.075, 0.33, 0.075, 0.11, 0.05, C, CR, -1);
  for (const s of [-1, 1]) {
    box(TOWN, [-0.46, 0, s > 0 ? 0.075 : -0.135], [0.33, 0.08, s > 0 ? 0.135 : -0.075], C);
    leanTo(TOWN, -0.46, 0.33, 0.075 * s, 0.135 * s, 0.1, 0.08, CR);
    box(TOWN, [-0.46, 0, s > 0 ? 0.135 : -0.185], [0.25, 0.055, s > 0 ? 0.185 : -0.135], C);
    leanTo(TOWN, -0.46, 0.25, 0.135 * s, 0.185 * s, 0.07, 0.055, CR);
  }
  house(TOWN, 0.03, -0.3, 0.19, 0.3, 0.11, 0.05, C, CR, -1);
  // the chevet: the apse over its ambulatory and five radiating chapels
  const AX = 0.33;
  prism(TOWN, "y", [AX, 0.055, 0], 0.075, 0.055, 8, C, null);
  cone(TOWN, [AX, 0.11, 0], 0.075, 0.045, 8, CR);
  prism(TOWN, "y", [AX, 0.037, 0], 0.125, 0.037, 12, C, null);
  frustum(TOWN, [AX, 0, 0], 0.125, 0.074, 0.075, 0.1, 12, CR);
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.5;
    const cx = AX + Math.cos(a) * 0.14;
    const cz = Math.sin(a) * 0.14;
    prism(TOWN, "y", [cx, 0.026, cz], 0.032, 0.026, 8, C, null);
    cone(TOWN, [cx, 0.052, cz], 0.032, 0.022, 8, CR);
  }
  // the belltower: five octagonal tiers, each a step in, then the spire
  for (const [r, y0, y1] of TIERS) prism(TOWN, "y", [TX, (y0 + y1) / 2, 0], r, (y1 - y0) / 2, 8, "tower", "ledge");
  cone(TOWN, [TX, SPIRE[1], 0], SPIRE[0], SPIRE[2] - SPIRE[1], 8, "spire");

  // the Pont Neuf over the Garonne
  const bz = 0.3;
  const bx = riverX(bz);
  box(TOWN, [bx - RIVER_W - 0.03, 0, bz - 0.028], [bx + RIVER_W + 0.03, 0.035, bz + 0.028], "bridge");

  // the town: blocks of brick houses on a grid of streets, clear of the square and the river
  const rnd = rng(31);
  const G = 0.22;
  const half = 0.082;
  for (let gx = -5; gx <= 5; gx++)
    for (let gz = -5; gz <= 5; gz++) {
      const x = gx * G + 0.03;
      const z = gz * G;
      const x0 = x - half;
      const x1 = x + half;
      const z0 = z - half;
      const z1 = z + half;
      if (Math.hypot(Math.abs(x) + half, Math.abs(z) + half) > 0.94) continue;
      if (x1 > PLAZA[0] && x0 < PLAZA[1] && z1 > PLAZA[2] && z0 < PLAZA[3]) continue;
      let wet = false;
      for (const zz of [z0, z, z1]) {
        const rx = riverX(zz);
        if (x1 > rx - RIVER_W - 0.03 && x0 < rx + RIVER_W + 0.03) wet = true;
      }
      if (wet) continue;
      // a block is two or three houses side by side, each its own height
      const n = rnd() < 0.5 ? 2 : 3;
      const alongX = rnd() < 0.5;
      for (let i = 0; i < n; i++) {
        const a = -half + ((2 * half) / n) * i;
        const b = a + (2 * half) / n;
        const h = 0.035 + rnd() * 0.04;
        const rise = 0.024 + rnd() * 0.014;
        if (alongX) house(TOWN, x + a, z0, x + b, z1, h, rise, "house", "roof", HOUSES++);
        else house(TOWN, x0, z + a, x1, z + b, h, rise, "house", "roof", HOUSES++);
      }
    }
  for (const f of TOWN) if (f.b < 0) f.b = f.mat === "bridge" ? BRIDGE_ID : CHURCH_ID;
}
/** the basilica alone, for domes too small for the houses to be more than noise */
const CHURCH_ONLY = TOWN.filter((f) => f.b === CHURCH_ID);

/* ───── the inks ───── */
/** Toulouse's brick by day: the globe's indigo in the shade, rose in the sun */
const BRICK = ramp([
  [27, 29, 68],
  [46, 44, 104],
  [76, 60, 122],
  [116, 76, 128],
  [162, 96, 128],
  [204, 118, 126],
  [232, 150, 140],
  [246, 184, 164],
]);
/** the roofs' tiles: the same shade, terracotta in the sun */
const TILE = ramp([
  [24, 26, 62],
  [42, 38, 92],
  [78, 52, 104],
  [128, 66, 98],
  [180, 88, 90],
  [218, 116, 92],
  [240, 150, 104],
]);
/** Saint-Sernin: its brick paler and pinker than the houses' (with its stone), its roofs the globe's lilac */
const CHURCH = ramp([
  [34, 37, 84],
  [70, 62, 128],
  [120, 88, 146],
  [176, 118, 152],
  [218, 152, 162],
  [240, 190, 184],
  [250, 222, 206],
]);
const SLATE = ramp([
  [27, 29, 68],
  [46, 50, 112],
  [70, 76, 165],
  [96, 102, 204],
  [136, 129, 234],
  [178, 172, 234],
]);
/** the streets and squares: the globe's land, darker in the shade */
const STREET = ramp([
  [14, 16, 40],
  [24, 27, 64],
  [34, 37, 84],
  [46, 50, 112],
  [58, 63, 140],
  [70, 76, 165],
  [86, 93, 192],
]);
const PLINTH = ramp([
  [5, 6, 17],
  [10, 13, 38],
  [15, 20, 55],
  [25, 33, 84],
  [34, 37, 84],
]);
/** by moonlight: the globe's night side */
const BRICK_NIGHT = ramp([
  [8, 9, 24],
  [12, 14, 34],
  [18, 20, 48],
  [27, 29, 68],
  [34, 37, 84],
]);
const TILE_NIGHT = ramp([
  [8, 9, 24],
  [14, 16, 40],
  [22, 24, 58],
  [30, 33, 76],
  [40, 44, 100],
  [52, 56, 126],
]);
/** Saint-Sernin floodlit: amber, brighter up the walls */
const FLOOD = [amber(0.3), amber(0.42), amber(0.56), amber(0.72), amber(0.88), P.light, pack3([255, 214, 160])];
/** each ink of the town, two steps lighter: for the edges that catch the light */
const LIFT = new Map<number, number>();
for (const rp of [BRICK, TILE, CHURCH, SLATE, BRICK_NIGHT, TILE_NIGHT, FLOOD]) rp.forEach((c, i) => LIFT.set(c, rp[Math.min(rp.length - 1, i + 2)]));

/** a face's light (ambient + k·lambert, darkened in shadow) as one ink off a ramp, undithered */
function flat(rp: number[], f: Face, L: V3, S: Shadow | null, wx: number, wy: number, wz: number, amb: number, k: number) {
  let lam = f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2];
  if (lam > 0 && inShadow(S, wx, wy, wz, 0.03)) lam *= 0.2;
  if (lam < 0) lam = 0;
  return rp[clamp(Math.round((amb + k * lam) * (rp.length - 1)), 0, rp.length - 1)];
}

export type DomeOptions = {
  /** stand it on the globe's turntable (off for the smallest pictures, so the dome is bigger) */
  table?: boolean;
  /** the date on the plinth */
  stamp?: boolean;
  /** how far the camera looks down, radians */
  pitch?: number;
  /** face north whatever is up (the long exposure) */
  north?: boolean;
  /** the share of the picture's height the object fills */
  fill?: number;
  /** the planets' names in the reader's language: Venus, Mars, Jupiter, Saturn */
  planets?: readonly string[];
};

/** what lays a long exposure on the back of the glass (./render's Exposure) */
type Trail = { draw(buf: Uint32Array, mask: Uint8Array): void };

/**
 * One dome on one grid of cells. Give it a size and a moment, then `paint`
 * into an ImageData's Uint32 view. `turn` spins it, `names` (0–1)
 * dissolves the constellation figures in, `trail` lays a long exposure on
 * the back of the glass.
 */
export class Dome {
  W = 0;
  H = 0;
  ms = 0;
  /** the way the camera looks (azimuth, radians clockwise from north) */
  yaw = 0;
  /** the constellations shown, 0..1, dissolved in Bayer order */
  names = 0;
  trail: Trail | null = null;
  /** sky, trails, stars, the town and the glass: everything under the names and the stamp */
  base = new Uint32Array(0);
  /** 1 wherever the back of the glass doesn't show */
  mask = new Uint8Array(0);
  scale = 1;
  private R: Raster | null = null;
  private cx = 0;
  private cy = 0;
  private pitch: number;
  private face = 0;
  private shadowKey = "";
  private S: Shadow | null = null;
  private L: V3 = [0, 1, 0];
  private shown: { name: string; x: number; y: number }[] = [];
  private planetNames: string[];

  constructor(public o: DomeOptions = {}) {
    this.pitch = o.pitch ?? 0.36;
    this.planetNames = (o.planets ?? PLANETS).map(capitals);
  }

  /** true when the grid changed */
  size(W: number, H: number) {
    if (W < 8 || H < 6 || (W === this.W && H === this.H)) return false;
    this.W = W;
    this.H = H;
    this.R = makeRaster(W, H);
    this.base = new Uint32Array(W * H);
    this.mask = new Uint8Array(W * H);
    // the object's height on screen, in units: the top of the glass to the front of what it stands on
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const foot = this.o.table === false ? PLINTH_R : TURN_R;
    const below = BASE * cp + foot * sp;
    const fill = this.o.fill ?? 0.9;
    this.scale = Math.min((H * fill) / (1 + below), (W * 0.96) / (2 * foot));
    this.cx = W / 2;
    this.cy = H / 2 + (this.scale * (1 - below)) / 2;
    return true;
  }

  /** a new moment (and the way the picture faces when nothing's up): the camera goes back to its first look */
  set(ms: number, face: number) {
    this.ms = ms;
    this.face = face;
    this.aim();
  }

  /** where to look first: north for the long exposure; else across the sun or the moon, so it stands on the glass and rakes the town; else the post's way */
  aim() {
    if (!this.ms) return;
    const sky = skyAt(this.ms);
    const azOf = (h: Vec) => Math.atan2(h[0], h[1]);
    const side = 0.78;
    if (this.o.north) this.yaw = 0;
    else if (sky.sunAlt > -4) this.yaw = azOf(sky.sunH) + side;
    else if (sky.moonAlt > 4) this.yaw = azOf(sky.moonH) + side;
    else this.yaw = this.face * R;
  }

  /** spin by a number of cells at the rim */
  turn(dx: number) {
    this.yaw -= dx / this.scale;
  }

  private cam() {
    return makeCam(this.yaw, this.pitch, this.scale, this.cx, this.cy, [0, 0, 0]);
  }

  /** where a direction on the sky (horizon x east, y north, z up) lands on the back of the glass, in cells; null when it's on the near side */
  project(hx: number, hy: number, hz: number): [number, number] | null {
    if (hz < 0 || !this.W) return null;
    const sw = Math.sin(this.yaw);
    const cw = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // world (x east, y up, z south); towards the camera is (-sw·cp, sp, cw·cp)
    const wx = hx;
    const wy = hz;
    const wz = -hy;
    if (-wx * sw * cp + wy * sp + wz * cw * cp > 0) return null;
    const x1 = wx * cw + wz * sw;
    const z1 = -wx * sw + wz * cw;
    return [this.cx + x1 * this.scale, this.cy - (wy * cp - z1 * sp) * this.scale];
  }

  /** the light on the town: the sun by day and at dusk, the moon at night, else a soft light from overhead */
  private light() {
    const sky = skyAt(this.ms);
    const toWorld = (h: Vec, minAlt: number): V3 => {
      const y = Math.max(h[2], Math.sin(minAlt * R));
      return norm([h[0], y, -h[1]]);
    };
    const key = `${sky.ms}`;
    if (key === this.shadowKey) return;
    this.shadowKey = key;
    if (sky.sunAlt > -4) this.L = toWorld(sky.sunH, 6);
    else if (sky.moonAlt > 3) this.L = toWorld(sky.moonH, 12);
    else this.L = norm([0.35, 0.85, 0.4]);
    this.S = makeShadow(320, this.L, 1.05, [0, 0.25, 0]);
    renderShadow(this.S, TOWN);
  }

  /** the costly part: once per camera and moment */
  render() {
    const Rs = this.R;
    if (!Rs || !this.ms) return;
    const { W, H, mask } = this;
    const sky = skyAt(this.ms);
    this.light();
    const cam = this.cam();
    const s = this.scale;
    if (s > 18) halo(Rs, this.cx, this.cy - s * 0.25, s * 1.12);
    else Rs.c.fill(0);
    clearDepth(Rs);
    mask.fill(1);

    // the back of the glass: each cell's ray through the dome, the sky where it leaves it
    const sw = Math.sin(this.yaw);
    const cw = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const rgt: V3 = [cw, 0, sw];
    const up: V3 = [sw * sp, cp, -cw * sp];
    const tow: V3 = [-sw * cp, sp, cw * cp];
    const shadeSky = skyShader(sky);
    const x0 = Math.max(0, Math.floor(this.cx - s - 1));
    const x1 = Math.min(W - 1, Math.ceil(this.cx + s + 1));
    const y0 = Math.max(0, Math.floor(this.cy - s - 1));
    const y1 = Math.min(H - 1, Math.ceil(this.cy + s * sp + 1));
    /** the glass in front: the near hit's normal per cell (NaN where there's none) */
    const near = this.nearBuf(W * H);
    near.fill(NaN);
    for (let y = y0; y <= y1; y++) {
      const Y = (this.cy - y - 0.5) / s;
      for (let x = x0; x <= x1; x++) {
        const X = (x + 0.5 - this.cx) / s;
        const q = X * X + Y * Y;
        if (q >= 1) continue;
        const d = Math.sqrt(1 - q);
        const k = y * W + x;
        // the point on the screen's plane through the centre, then back (−d) and forward (+d) along the view
        const ox = rgt[0] * X + up[0] * Y;
        const oy = rgt[1] * X + up[1] * Y;
        const oz = rgt[2] * X + up[2] * Y;
        const fy = oy - d * tow[1];
        if (fy >= 0) {
          const fx = ox - d * tow[0];
          const fz = oz - d * tow[2];
          Rs.c[k] = shadeSky(fx, -fz, fy, x, y);
          Rs.z[k] = -d;
          Rs.id[k] = -2;
          mask[k] = 0;
        }
        const ny = oy + d * tow[1];
        if (ny >= 0) {
          near[k * 3] = ox + d * tow[0];
          near[k * 3 + 1] = ny;
          near[k * 3 + 2] = oz + d * tow[2];
        }
      }
    }
    this.trail?.draw(Rs.c, mask);
    this.paintStars(Rs, sky);

    // the town, the ground, the plinth and the turntable, in front of it
    const shade = this.shader(sky, cam);
    draw(Rs, FLOOR, cam, shade);
    draw(Rs, s < 18 ? CHURCH_ONLY : TOWN, cam, shade);
    for (let k = 0; k < W * H; k++) if (Rs.id[k] !== -2) mask[k] = 1;
    // the town's top edges catch the light: every building's outline against what's behind it, a step lighter
    if (s > 26)
      for (let k = (y0 + 1) * W; k < W * H; k++) {
        const id = Rs.id[k];
        if (id >= 0 && Rs.id[k - W] !== id) Rs.c[k] = LIFT.get(Rs.c[k]) ?? Rs.c[k];
      }

    this.paintGlass(Rs, near, sky, tow);
    this.base.set(Rs.c);
  }

  private nearCache = new Float32Array(0);
  private nearBuf(n: number) {
    if (this.nearCache.length !== n * 3) this.nearCache = new Float32Array(n * 3);
    return this.nearCache;
  }

  private shader(sky: ReturnType<typeof skyAt>, cam: Cam) {
    const dark = darkness(sky.sunAlt);
    // dusk: day and night dithered together
    const nightMix = clamp((dark - 0.32) / 0.36, 0, 1);
    const lit0 = litShare(sky.ms, sky.sunAlt);
    const moonK = sky.moonAlt > 3 ? 0.35 + sky.moonK * 0.65 : 0.25;
    const fine = cam.scale > 26;
    const { L, S } = this;
    const lowSun = L[1] < 0.3;
    return (f: Face, u: number, v: number, wx: number, wy: number, wz: number, x: number, y: number) => {
      const bx = b4(x, y);
      const night = bx < nightMix;
      const mat = f.mat;
      if (mat === "table") return turntableInk(wx, wz, TURN_R, x, y, cam.scale, false, night);
      if (mat === "plinth") return flat(PLINTH, f, L, null, wx, wy, wz, 0.2, night ? 0.3 : 0.7);
      if (mat === "ground") {
        const r = Math.hypot(wx, wz);
        if (r > RING) return night ? (bx < 0.5 ? amber(0.3) : amber(0.4)) : bx < 0.5 ? amber(0.62) : amber(0.78);
        const shadow = inShadow(S, wx, wy, wz, 0.02 + (lowSun ? 0.02 : 0));
        // a small dome's ground is one ink (and the basilica's shadow)
        if (!fine) return night ? P.oceanDeep : STREET[shadow ? 2 : 4];
        const dx = Math.abs(wx - riverX(wz));
        if (dx < RIVER_W) {
          // the Garonne, the globe's ocean: its grid, a glitter of sun or moon, the town's lights in it
          const grid = fine && (Math.abs(((wz * 10 + 100) % 1) - 0.5) > 0.5 - 0.6 / (cam.scale * 0.1) || dx > RIVER_W - 0.9 / cam.scale);
          const h = hash2(Math.floor(wx * cam.scale), Math.floor(wz * cam.scale));
          if (night) {
            if (h < 0.025 * lit0 * 3) return amber(0.5);
            if (sky.moonAlt > 3 && h > 0.985) return P.landLo;
            return grid ? INKS.gridNight : bx < 0.25 ? P.oceanNight2 : P.oceanNight;
          }
          if (!shadow && h > 0.975) return P.lightHot;
          if (grid) return INKS.grid;
          return shadow ? P.oceanDeep : bx < 0.5 ? P.oceanLit : P.ocean;
        }
        const quay = dx < RIVER_W + 0.022;
        const square = wx > PLAZA[0] && wx < PLAZA[1] && wz > PLAZA[2] && wz < PLAZA[3];
        if (night) return quay || square ? P.landNight : shadow ? P.oceanNight2 : P.oceanDeep;
        const lv = (quay ? 4.6 : square ? 4.2 : 3.3) - (shadow ? 1.8 : 0) - (lowSun ? 0.6 : 0);
        return STREET[clamp(Math.round(lv), 0, STREET.length - 1)];
      }
      const roof = f.side === "roof" || mat === "churchRoof" || mat === "spire";
      const church = mat === "church" || mat === "churchRoof" || mat === "tower" || mat === "spire" || mat === "ledge";
      if (night) {
        if (church) {
          // floodlit, a step brighter each tier up the walls; the roofs catch only the spill
          if (mat === "tower" && fine && this.arcade(f, u, v, cam)) return amber(0.2);
          const up = clamp(wy / 0.6, 0, 1);
          const lv = roof ? 1 + up * 2 : 2.2 + up * 4.2 + (f.n[1] > 0.5 ? -1 : 0);
          return FLOOD[clamp(Math.floor(lv), 0, FLOOD.length - 1)];
        }
        if (mat === "house" && f.side !== "gable" && fine && this.window(f, u, v, cam)) {
          const h = hash2(f.b * 977 + f.k * 131 + Math.floor(u * f.fw * 36), Math.floor(v * f.fh * 36) * 7919 + 3);
          return h < lit0 * 2 ? (h < lit0 * 0.3 ? P.lightHot : P.light) : P.oceanNight2;
        }
        return roof ? flat(TILE_NIGHT, f, L, S, wx, wy, wz, 0.32, 0.8 * moonK) : flat(BRICK_NIGHT, f, L, S, wx, wy, wz, 0.14, 0.6 * moonK);
      }
      if (mat === "tower" && fine && this.arcade(f, u, v, cam)) return CHURCH[0];
      if (mat === "house" && f.side !== "gable" && fine && this.window(f, u, v, cam)) return BRICK[1];
      if (mat === "bridge" && fine && f.side !== "top" && f.side !== "x+" && f.side !== "x-") {
        // the Pont Neuf's arches, the river through them
        const a = (u * 5) % 1;
        if (v > 0.35 && (a - 0.5) ** 2 * 4 + ((v - 1) / 0.65) ** 2 < 1) return P.oceanDeep;
      }
      // one flat ink a face, as the globe has (only the shadows break it up)
      if (church) return flat(roof ? SLATE : CHURCH, f, L, S, wx, wy, wz, 0.32, 0.68);
      return flat(roof ? TILE : BRICK, f, L, S, wx, wy, wz, 0.26, 0.7);
    };
  }

  /** a house's windows: a grid a few cells apart, none on the ground floor */
  private window(f: Face, u: number, v: number, cam: Cam) {
    // a window a cell wide every few cells along, in a row or two (none on the ground floor)
    const G = Math.max(0.026, 2.6 / cam.scale);
    const lu = (u * f.fw) / G;
    if (f.fw < G * 1.4 || lu % 1 < 0.3 || lu % 1 > 0.3 + 1.1 / (G * cam.scale) || lu > Math.floor((f.fw / G) - 0.2)) return false;
    const tall = f.fh * cam.scale;
    const rows = tall >= 7 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const at = (rows === 1 ? 0.32 : 0.22 + r * 0.34) * tall;
      const cy = v * tall;
      if (cy >= at && cy < at + 1.05) return true;
    }
    return false;
  }

  /** the belltower's arcades: an opening in the middle of each face of each tier */
  private arcade(f: Face, u: number, v: number, cam: Cam) {
    if (f.side !== "rim") return false;
    const a = (u * 8) % 1;
    const w = Math.max(0.12, 0.55 / (f.fw * cam.scale));
    return Math.abs(a - 0.5) < w && v > 0.24 && v < 0.88;
  }

  /** the stars, the planets, the sun and the moon on the back of the glass */
  private paintStars(Rs: Raster, sky: ReturnType<typeof skyAt>) {
    const { W, H, mask } = this;
    const M = sky.M;
    const c = Rs.c;
    const put = (x: number, y: number, col: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H && !mask[y * W + x]) c[y * W + x] = col;
    };
    const lim0 = limitOf(sky);
    const big = this.scale > 26;
    if (lim0 >= -2)
      for (let i = 0; i < NS; i++) {
        const mag = SMAG[i];
        if (mag > lim0) continue;
        const e0 = SV[i * 3];
        const e1 = SV[i * 3 + 1];
        const e2 = SV[i * 3 + 2];
        const hz = M[6] * e0 + M[7] * e1 + M[8] * e2;
        if (hz < 0.005) continue;
        const alt = Math.asin(hz) / R;
        const lim = alt < 18 ? lim0 - (18 - alt) * 0.1 : lim0;
        // a small dome only holds the brighter stars
        if (mag > lim || (!big && mag > 3.4)) continue;
        const p = this.project(M[0] * e0 + M[1] * e1 + M[2] * e2, M[3] * e0 + M[4] * e1 + M[5] * e2, hz);
        if (!p) continue;
        const x = p[0] | 0;
        const y = p[1] | 0;
        if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x]) continue;
        c[y * W + x] = starInk(mag, SBV[i], lim);
        if (big && mag < 1.1 && lim > 1.8) {
          const arm = mag < 0.3 ? P.ice : P.landHi;
          put(x - 1, y, arm);
          put(x + 1, y, arm);
          put(x, y - 1, arm);
          put(x, y + 1, arm);
        }
      }
    this.shown = [];
    for (const pl of sky.planets) {
      if (pl.h[2] < 0.01 || pl.mag > lim0 + 1.2) continue;
      const p = this.project(pl.h[0], pl.h[1], pl.h[2]);
      if (!p) continue;
      const x = p[0] | 0;
      const y = p[1] | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || mask[y * W + x]) continue;
      put(x, y, pl.ink);
      if (big && PLANETS[pl.i] === "Saturn") {
        put(x - 1, y, P.landHi);
        put(x + 1, y, P.landHi);
      } else if (big && pl.mag < -1) {
        const arm = PLANETS[pl.i] === "Venus" ? P.iceHi : P.ice;
        put(x - 1, y, arm);
        put(x + 1, y, arm);
        put(x, y - 1, arm);
        put(x, y + 1, arm);
      }
      this.shown.push({ name: this.planetNames[pl.i] ?? PLANETS[pl.i].toUpperCase(), x, y });
    }
  }

  /** the sun and the moon on the back of the glass (`front` false) or the front */
  private bodies(sky: ReturnType<typeof skyAt>, front: boolean, put: (x: number, y: number, c: number) => void) {
    const s = this.scale;
    const sunR = clamp(s * 0.07, 1.6, 4.5);
    const moonR = Math.round(clamp(s * 0.1, 2, 6));
    const at = (h: Vec) => {
      const p = this.project(h[0], h[1], h[2]);
      if (p) return front ? null : p;
      if (!front || h[2] < 0) return null;
      // the near side: where the direction meets the glass, seen from outside
      const sw = Math.sin(this.yaw);
      const cw = Math.cos(this.yaw);
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      const x1 = h[0] * cw - h[1] * sw;
      const z1 = -h[0] * sw - h[1] * cw;
      return [this.cx + x1 * s, this.cy - (h[2] * cp - z1 * sp) * s] as [number, number];
    };
    if (sky.sunAlt > -1.5) {
      const p = at(sky.sunH);
      if (p) {
        // a white disc, its rim, and a dithered glare round it
        const r = sunR;
        const cx = Math.round(p[0]);
        const cy = Math.round(p[1]);
        const G = Math.ceil(r + 3);
        for (let dy = -G; dy <= G; dy++)
          for (let dx = -G; dx <= G; dx++) {
            const d = Math.hypot(dx, dy);
            const x = cx + dx;
            const y = cy + dy;
            if (d <= r) put(x, y, d < r - 1.1 ? P.lightHot : P.iceHi);
            else if (d < r + 2.6 && b4(x, y) < (r + 2.6 - d) / 3.2) put(x, y, P.iceHi);
          }
      }
    }
    if (sky.moonAlt > -1.5) {
      const p = at(sky.moonH);
      if (p) {
        const sw = Math.sin(this.yaw);
        const cw = Math.cos(this.yaw);
        // the screen's right, in horizon coordinates (x east, y north)
        paintMoon(sky, Math.round(p[0]), Math.round(p[1]), moonR, [cw, -sw, 0], put);
      }
    }
  }

  /** the glass in front: a crisp rim, a fresnel haze towards it, the studio's highlight, and the sun or the moon when they're on this side */
  private paintGlass(Rs: Raster, near: Float32Array, sky: ReturnType<typeof skyAt>, tow: V3) {
    const { W, H } = this;
    const s = this.scale;
    const c = Rs.c;
    const night = darkness(sky.sunAlt) > 0.5;
    const rim = night ? P.landLo : P.iceHi;
    const haze = night ? P.landNight2 : P.landHi;
    const gloss = night ? P.land : P.lightHot;
    const edge = 1 - 1.15 / s;
    const body = sky.sunAlt > -1.5 ? sky.sunH : sky.moonH;
    const bp = this.project(body[0], body[1], body[2]);
    const flip = !!bp && bp[0] < this.cx;
    for (let y = 0, k = 0; y < H; y++)
      for (let x = 0; x < W; x++, k++) {
        const nx = near[k * 3];
        if (nx !== nx) continue;
        const ny = near[k * 3 + 1];
        const nz = near[k * 3 + 2];
        const bx = b4(x, y);
        const X = (x + 0.5 - this.cx) / s;
        const Y = (this.cy - y - 0.5) / s;
        const rr = Math.sqrt(X * X + Y * Y);
        if (rr > edge && ny > 1.2 / s) {
          c[k] = rim;
          continue;
        }
        const facing = nx * tow[0] + ny * tow[1] + nz * tow[2];
        if (s > 18 && facing < 0.22 && bx < (0.22 - facing) * 1.4) {
          c[k] = haze;
          continue;
        }
        // the studio's highlight: a short bright arc high on one side, a fainter long one on the other,
        // away from the sun or the moon
        const th = flip ? Math.PI - Math.atan2(Y, X) : Math.atan2(Y, X);
        if (rr > 0.8 && rr < 0.8 + 1.6 / s + 0.02 && ((th > 2.05 && th < 2.6) || (th > 2.72 && th < 2.8))) c[k] = gloss;
        else if (rr > 0.87 && rr < 0.87 + 1.2 / s && th > 0.35 && th < 1.05 && bx < 0.5) c[k] = gloss;
      }
    // the sun and the moon over the glass: on the back of it where the town doesn't hide them, else on the front
    this.bodies(sky, false, (x, y, col) => {
      if (x >= 0 && y >= 0 && x < W && y < H && Rs.id[y * W + x] === -2) c[y * W + x] = col;
    });
    this.bodies(sky, true, (x, y, col) => {
      if (x >= 0 && y >= 0 && x < W && y < H && near[(y * W + x) * 3] === near[(y * W + x) * 3]) c[y * W + x] = col;
    });
  }

  /** the names, the stamp over the last render, into `out` (W×H) */
  compose(out: Uint32Array) {
    const { W, H } = this;
    if (!W || out.length !== W * H) return;
    out.set(this.base);
    const st = this.stampAt();
    if (this.names > 0) this.paintNames(out, st);
    if (st) drawText(out, W, H, st.s, st.x, st.y, P.light);
  }
  paint(out: Uint32Array) {
    this.render();
    this.compose(out);
  }

  /** the date on the plinth's front, when the plinth is tall enough to carry it */
  private stampAt() {
    if (!this.o.stamp || !this.ms) return null;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const s = this.scale;
    if (BASE * cp * s < 6.5) return null;
    const wide = 2 * PLINTH_R * s * 0.62;
    let str = stampOf(this.ms, false);
    if (textW(str) > wide) str = stampOf(this.ms, true);
    if (textW(str) > wide) return null;
    const y = Math.round(this.cy + ((BASE / 2) * cp + PLINTH_R * sp) * s - 2.5);
    return { s: str, x: Math.round(this.cx - textW(str) / 2), y };
  }

  /** the constellation figures on the back of the glass as dotted lines (the globe's flights), their names in pixel capitals */
  private paintNames(buf: Uint32Array, st: { s: string; x: number; y: number } | null) {
    const { W, H, mask } = this;
    const sky = skyAt(this.ms);
    const M = sky.M;
    const c = this.names;
    const night = darkness(sky.sunAlt) > 0.5;
    const lineInk = night ? P.landLo : P.iceHi;
    const nameInk = night ? P.landHi : P.iceHi;
    const keep = (x: number, y: number) => !mask[y * W + x] && b4(x, y) < c;
    let n = 0;
    const plot = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H && (n++ & 1) === 0 && keep(x, y)) buf[y * W + x] = lineInk;
    };
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      x0 |= 0;
      y0 |= 0;
      x1 |= 0;
      y1 |= 0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 2000; guard++) {
        plot(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    };
    // labels sit on the back of the glass, never on each other or the stamp
    const taken: number[][] = st ? [[st.x - 2, st.y - 2, st.x + textW(st.s) + 2, st.y + 7]] : [];
    const label = (name: string, x: number, y: number, ink: number) => {
      const r = [x - 1, y - 1, x + textW(name) + 1, y + 6];
      if (r[0] < 0 || r[1] < 0 || r[2] > W || r[3] > H) return;
      if (taken.some((t) => r[0] < t[2] && t[0] < r[2] && r[1] < t[3] && t[1] < r[3])) return;
      for (let yy = r[1]; yy < r[3]; yy += 2) for (let xx = r[0]; xx < r[2]; xx += 2) if (mask[yy * W + xx]) return;
      taken.push(r);
      drawText(buf, W, H, name, x, y, ink, keep);
    };
    if (this.o.north) {
      const h = mv(M, POLARIS);
      const p = this.project(h[0], h[1], h[2]);
      if (p) label("POLARIS", (p[0] | 0) + 3, (p[1] | 0) - 2, nameInk);
    }
    for (const sp of this.shown) label(sp.name, sp.x + 3, sp.y - 2, P.light);
    const names: [string, number, number][] = [];
    for (const con of CONS) {
      for (const pts of con.lines) {
        let prev: [number, number] | null = null;
        for (const pt of pts) {
          const h = mv(M, pt);
          const p = this.project(h[0], h[1], h[2]);
          if (p && prev) {
            // stop short of each star, as the globe's routes stop short of a city
            const ddx = p[0] - prev[0];
            const ddy = p[1] - prev[1];
            const Ls = Math.hypot(ddx, ddy);
            if (Ls > 4) line(prev[0] + (ddx / Ls) * 2, prev[1] + (ddy / Ls) * 2, p[0] - (ddx / Ls) * 2, p[1] - (ddy / Ls) * 2);
          }
          prev = p;
        }
      }
      const h = mv(M, con.at);
      if (h[2] < 0.06) continue;
      const p = this.project(h[0], h[1], h[2]);
      if (!p) continue;
      names.push([con.name, Math.round(p[0] - textW(con.name) / 2), Math.round(p[1] - 2)]);
    }
    for (const [name, x, y] of names) label(name, x, y, nameInk);
  }
}


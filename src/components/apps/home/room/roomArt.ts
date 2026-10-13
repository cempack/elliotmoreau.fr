/**
 * Elliot's room, behind the lit window: a small pixel interior (300×179
 * art pixels) drawn the way the wallpaper is, lit by the hour outside. By
 * night and at dusk the desk lamp is on and warms the wall; by day the
 * window does, and the sun lays the window on the floor. The window looks
 * back across the Garonne at the Saint-Cyprien bank and the Dôme de la
 * Grave in that sky, mirrored in the river (rain on the glass when it
 * rains). The shelf holds a book per post, the board a postcard per trip,
 * the clock shows Toulouse time, the turntable's arm is on the record
 * while one is playing, and its sleeve stands at the front of the bin.
 *
 * `paintRoom` draws it into a canvas of W×H and returns where each object
 * stands, so the page can put a door on each. Everything is painted into
 * one RGBA buffer and put on the canvas once: it repaints only when the
 * light, the clock's minute or what's playing changes.
 */

export const ROOM_W = 300;
export const ROOM_H = 179;
/** where the eye goes first: the desk under the window (a narrow screen starts there) */
export const ROOM_FOCUS = { x: 188, y: 80 };

export type RoomPhase = "dawn" | "day" | "dusk" | "night";
export type RoomState = {
  phase: RoomPhase;
  rain: boolean;
  /** books on the shelf (one per post, up to 6) */
  posts: number;
  /** postcards on the board (one per trip, up to 6) */
  places: number;
  /** Toulouse time, for the clock */
  hour: number;
  minute: number;
  playing: boolean;
};
export type Rect = { x: number; y: number; w: number; h: number };
export type RoomSpots = {
  laptop: Rect;
  turntable: Rect;
  shelf: Rect;
  board: Rect;
  tray: Rect;
  window: Rect;
};

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (a: number[]) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mixes = new Map<string, string>();
const mix = (a: string, b: string, t: number) => {
  const key = a + b + t;
  let c = mixes.get(key);
  if (c === undefined) {
    const A = hex(a);
    const B = hex(b);
    c = toHex(A.map((v, i) => v + (B[i] - v) * t));
    if (mixes.size > 4096) mixes.clear();
    mixes.set(key, c);
  }
  return c;
};
const shade = (c: string, k: number) => (k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k));
/** a stable 0..1 per integer */
const hash1 = (n: number) => {
  let h = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
const rng = (seed: number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type RGBA = [number, number, number, number];
const inks = new Map<string, RGBA>();
const ink = (c: string): RGBA => {
  let v = inks.get(c);
  if (!v) {
    if (c[0] === "#") v = [...(hex(c) as [number, number, number]), 1];
    else {
      const m = (c.match(/[\d.]+/g) ?? []).map(Number);
      v = [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1];
    }
    inks.set(c, v);
  }
  return v;
};

/** a tiny pixel painter over an RGBA buffer */
class Px {
  readonly d = new Uint8ClampedArray(ROOM_W * ROOM_H * 4);
  p(x: number, y: number, c: string) {
    if (x < 0 || y < 0 || x >= ROOM_W || y >= ROOM_H) return;
    const i = ((y | 0) * ROOM_W + (x | 0)) * 4;
    const [r, g, b, a] = ink(c);
    const d = this.d;
    if (a >= 1) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    } else {
      d[i] += (r - d[i]) * a;
      d[i + 1] += (g - d[i + 1]) * a;
      d[i + 2] += (b - d[i + 2]) * a;
    }
    d[i + 3] = 255;
  }
  /** what is there already, as #rrggbb */
  get(x: number, y: number) {
    const i = ((Math.max(0, Math.min(ROOM_H - 1, y)) | 0) * ROOM_W + (Math.max(0, Math.min(ROOM_W - 1, x)) | 0)) * 4;
    return toHex([this.d[i], this.d[i + 1], this.d[i + 2]]);
  }
  /** darken (k < 0) or lighten (k > 0) what is there */
  tone(x: number, y: number, k: number) {
    if (x < 0 || y < 0 || x >= ROOM_W || y >= ROOM_H) return;
    const i = ((y | 0) * ROOM_W + (x | 0)) * 4;
    const to = k >= 0 ? 255 : 0;
    const t = Math.abs(k);
    for (let c = 0; c < 3; c++) this.d[i + c] += (to - this.d[i + c]) * t;
  }
  r(x: number, y: number, w: number, h: number, c: string) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = x0 + Math.round(w);
    const y1 = y0 + Math.round(h);
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.p(i, j, c);
  }
  dither(x: number, y: number, w: number, h: number, a: string, b: string, t: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, bayer(x + i, y + j) < t ? b : a);
  }
  vgrad(x: number, y: number, w: number, h: number, stops: [number, string][]) {
    for (let j = 0; j < h; j++) {
      const f = h <= 1 ? 0 : j / (h - 1);
      let k = 0;
      while (k < stops.length - 2 && f > stops[k + 1][0]) k++;
      const [p0, c0] = stops[k];
      const [p1, c1] = stops[k + 1];
      const t = Math.max(0, Math.min(1, (f - p0) / (p1 - p0 || 1)));
      for (let i = 0; i < w; i++) this.p(x + i, y + j, bayer(x + i, y + j) < t ? c1 : c0);
    }
  }
  circle(cx: number, cy: number, r: number, c: string) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.p(cx + x, cy + y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.p(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  }
  poly(pts: [number, number][], c: string) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.p(x, y, c);
    }
  }
  /** a hand-placed sprite: one character per pixel, "." left alone */
  sprite(x: number, y: number, rows: string[], pal: Record<string, string>) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (pal[row[i]]) this.p(x + i, y + j, pal[row[i]]);
    });
  }
}

/* the light, by the hour outside */
type Light = {
  lamp: boolean;
  wall: string;
  wallLit: string[];
  /** where the wall's light comes from, and how far it spreads */
  pool: { x: number; y: number; r: number };
  side: string;
  sideDk: string;
  floor: string;
  floorLt: string;
  ceil: string;
  sky: [number, string][];
  /** the far bank's brick, in shadow and lit */
  bank: [string, string];
  river: [number, string][];
  /** how many of the far windows are lit */
  windows: number;
  /** how far the view's own colours (the dome, the stone) sink into the dark */
  dark: number;
  stars: boolean;
  sunPatch: boolean;
};
const LIGHTS: Record<RoomPhase, Light> = {
  night: {
    lamp: true,
    wall: "#56443a",
    wallLit: ["#6f5547", "#8f6b52", "#a37b5c"],
    pool: { x: 137, y: 84, r: 1 },
    side: "#45362f",
    sideDk: "#2f2621",
    floor: "#4a3326",
    floorLt: "#6a4a33",
    ceil: "#221c1a",
    sky: [[0, "#0b0f1d"], [0.6, "#141a30"], [1, "#1d2540"]],
    bank: ["#2e2226", "#3a2a2c"],
    river: [[0, "#1d2238"], [0.5, "#151a2a"], [1, "#10131f"]],
    windows: 0.8,
    dark: 0.55,
    stars: true,
    sunPatch: false,
  },
  dusk: {
    lamp: true,
    wall: "#6f5648",
    wallLit: ["#86664f", "#a07a5c", "#b08463"],
    pool: { x: 137, y: 84, r: 1 },
    side: "#5a463c",
    sideDk: "#3d302a",
    floor: "#5a3d2c",
    floorLt: "#7a543a",
    ceil: "#2c2523",
    sky: [[0, "#2d3352"], [0.45, "#6b5672"], [0.75, "#c07a68"], [1, "#e8a46a"]],
    bank: ["#6a3e3a", "#8a5246"],
    river: [[0, "#7a6070"], [0.5, "#3b4a58"], [1, "#2b3442"]],
    windows: 0.55,
    dark: 0.25,
    stars: false,
    sunPatch: false,
  },
  dawn: {
    lamp: false,
    wall: "#6a5750",
    wallLit: ["#7c665c", "#8f776a", "#9c8376"],
    pool: { x: 196, y: 58, r: 1.35 },
    side: "#564641",
    sideDk: "#3b302d",
    floor: "#56402f",
    floorLt: "#6f5440",
    ceil: "#2e2828",
    sky: [[0, "#3d3a5c"], [0.55, "#8a6f7a"], [1, "#e9c39a"]],
    bank: ["#7a4e46", "#9c6654"],
    river: [[0, "#8a7a86"], [0.5, "#5a6270"], [1, "#3a4452"]],
    windows: 0.15,
    dark: 0.2,
    stars: false,
    sunPatch: false,
  },
  day: {
    lamp: false,
    wall: "#7d675a",
    wallLit: ["#8e7767", "#a08774", "#ad9480"],
    pool: { x: 196, y: 58, r: 1.5 },
    side: "#665449",
    sideDk: "#463a33",
    floor: "#6a4a35",
    floorLt: "#8a6447",
    ceil: "#3a3230",
    sky: [[0, "#7fa3b8"], [0.7, "#a9c2c9"], [1, "#c9d8d6"]],
    bank: ["#a85a46", "#c46c54"],
    river: [[0, "#6f9a96"], [0.5, "#4f7e80"], [1, "#3f6a6e"]],
    windows: 0,
    dark: 0,
    stars: false,
    sunPatch: true,
  },
};

const WOOD = "#7a5236";
const WOOD_LT = "#9c6c47";
const WOOD_DK = "#4f3524";
const PLANK = "#342319";
const IRON = "#2c3436";
const CLOTH = ["#5b7fa0", "#a65a4a", "#6f8b5a", "#8a6a9a", "#c98a62", "#4f8fa0"];
const SLEEVES = ["#2f4a6a", "#b0544a", "#e0c15c", "#4f6b3e", "#6a4a7a", "#c98a62", "#7fa6c9", "#a5b5ab", "#8f5648"];
const CARDS: [string, string, string][] = [
  ["#7aa6c8", "#e8e2d0", "#3f6a8a"],
  ["#5f9a5a", "#d9e4c8", "#2f5a3a"],
  ["#e0a46a", "#f0d8a8", "#b0544a"],
  ["#4f8fa0", "#e8d8a0", "#2b4c52"],
  ["#6f8b5a", "#cfd8c0", "#3a4a32"],
  ["#b0584a", "#f2c46d", "#5e3027"],
];

/* the room's layout, in art pixels */
const VX = 150; // the vanishing point
const VY = 84;
const BW = { x0: 46, x1: 254, y0: 10, y1: 124 }; // the back wall
const WIN = { x0: 154, x1: 238, y0: 22, y1: 94 }; // the glass
const MULL = (WIN.x0 + WIN.x1) / 2 - 1; // the mullion's left edge
const TRANSOM = WIN.y0 + 13;
const QUAY = 70; // the far bank's waterline
const DOME = 218;
const DK = { x0: 124, x1: 252, y: 104 }; // the desk, by its top
const SH = { x0: 52, x1: 122 }; // the shelves
const BD = { x0: 56, y0: 70, x1: 118, y1: 95 }; // the cork, inside its frame
const CB = { x0: 44, x1: 118, y0: 112, y1: 140 }; // the record cabinet
const TT = { x0: 52, x1: 98, y0: 102 }; // the turntable's plinth (it stands on the cabinet)
const BIN = { x0: 83, x1: 116, y0: 117, y1: 137 }; // the cabinet's right side: the record bin
const SLV = { x: 90, y: 119, w: 18, h: 18 }; // the sleeve at the front of the bin
const LP = { x: 168, y: DK.y }; // the laptop
const CK = { x: 132, y: 49 }; // the clock
const RUG = { y0: 140, y1: 170, top: [96, 214], foot: [74, 236] };
/* the postcards, in the order they go up */
const SLOTS: [number, number][] = [[79, 71], [59, 72], [100, 72], [66, 83], [87, 84], [104, 83]];

export function paintRoom(cv: HTMLCanvasElement, s: RoomState, cover?: CanvasImageSource | null): RoomSpots {
  cv.width = ROOM_W;
  cv.height = ROOM_H;
  const spots: RoomSpots = {
    laptop: { x: LP.x - 2, y: LP.y - 22, w: 37, h: 23 },
    turntable: { x: CB.x0, y: TT.y0 - 2, w: CB.x1 - CB.x0, h: CB.y1 + 3 - (TT.y0 - 2) },
    shelf: { x: SH.x0, y: 14, w: SH.x1 - SH.x0, h: 52 },
    board: { x: BD.x0 - 2, y: BD.y0 - 2, w: BD.x1 - BD.x0 + 4, h: BD.y1 - BD.y0 + 4 },
    tray: { x: 206, y: DK.y - 10, w: 24, h: 11 },
    window: { x: WIN.x0 - 4, y: WIN.y0 - 4, w: WIN.x1 - WIN.x0 + 8, h: WIN.y1 - WIN.y0 + 7 },
  };
  const g = cv.getContext("2d");
  if (!g) return spots;
  const L = LIGHTS[s.phase];
  const W = ROOM_W;
  const H = ROOM_H;
  const a = new Px();

  /* ── the room's shell ── */
  a.poly([[0, 0], [W, 0], [BW.x1, BW.y0], [BW.x0, BW.y0]], L.ceil);
  a.poly([[0, 0], [BW.x0, BW.y0], [BW.x0, BW.y1], [0, H]], L.side);
  a.poly([[W, 0], [BW.x1, BW.y0], [BW.x1, BW.y1], [W, H]], L.sideDk);
  // the back wall and its pool of light: solid bands, a short dithered rim
  const P = L.pool;
  const wallDk = shade(L.wall, -0.3);
  for (let y = BW.y0; y < BW.y1; y++)
    for (let x = BW.x0; x < BW.x1; x++) {
      const d = Math.hypot((x - P.x) * 0.75, (y - P.y) * 1.15) / P.r;
      let c = y > BW.y1 - 24 && bayer(x, y) < (y - (BW.y1 - 24)) / 40 ? wallDk : L.wall;
      if (d < 62 + bayer(x, y) * 8) c = L.wallLit[0];
      if (d < 40 + bayer(x, y) * 7) c = L.wallLit[1];
      if (d < 20 + bayer(x, y) * 5) c = L.wallLit[2];
      a.p(x, y, c);
    }
  // side walls: a soft step darker toward the corners
  const corner = shade(L.sideDk, -0.15);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < BW.x0; x++) {
      const top = (BW.y0 / BW.x0) * x;
      const bot = H - ((H - BW.y1) / BW.x0) * x;
      if (y > top && y < bot && x < 20 + bayer(x, y) * 6) a.p(x, y, L.sideDk);
    }
  for (let y = 0; y < H; y++)
    for (let x = BW.x1; x < W; x++) {
      const k = (x - BW.x1) / (W - BW.x1);
      const top = BW.y0 * (1 - k);
      const bot = BW.y1 + (H - BW.y1) * k;
      if (y > top && y < bot && x > W - 22 - bayer(x, y) * 6) a.p(x, y, corner);
    }
  // the skirting, and the dark under the desk
  a.r(BW.x0, BW.y1 - 3, BW.x1 - BW.x0, 3, shade(L.wall, -0.45));
  a.r(BW.x0, BW.y1 - 3, BW.x1 - BW.x0, 1, shade(L.wall, -0.3));
  for (let y = DK.y + 7; y < BW.y1; y++) for (let x = DK.x0 + 3; x < DK.x1 - 3; x++) a.tone(x, y, -0.22);

  /* ── the floor: planks running to the vanishing point, the rug, the lamp's pool or the sun ── */
  const PW = (BW.x1 - BW.x0) / 20;
  const floorDk = shade(L.floor, -0.3);
  const seamLit = shade(L.floorLt, -0.38);
  const sunFloor = shade(L.floorLt, 0.1);
  for (let y = BW.y1; y < H; y++) {
    const zf = (y - VY) / (BW.y1 - VY); // screen pixels per wall pixel at this depth
    const k = (y - BW.y1) / (H - BW.y1);
    const xl = Math.round(BW.x0 * (1 - k));
    const xr = Math.round(BW.x1 + (W - BW.x1) * k);
    const D0 = 60 / (y - VY);
    const D1 = 60 / (y + 1 - VY);
    for (let x = xl; x < xr; x++) {
      const lit = L.lamp && Math.hypot((x - 156) * 0.7, (y - 142) * 1.6) < 58 + bayer(x, y) * 10;
      let c = lit ? L.floorLt : k > 0.75 && bayer(x, y) < (k - 0.75) * 2 ? floorDk : L.floor;
      const sun = L.sunPatch && sunAt(x, y);
      const rug = rugAt(x, y);
      if (rug) c = lit ? shade(rug, 0.08) : sun ? shade(rug, 0.14) : rug;
      else {
        // where this point of the floor meets the wall: the seams are every plank's width there
        const u = (x - VX) / zf + VX;
        const sp = (u - BW.x0) / PW;
        const plank = Math.floor(sp);
        const seam = Math.abs(sp - Math.round(sp)) * PW * zf < 0.5;
        const h = hash1(plank) * 2.3;
        const joint = Math.floor(D0 + h) !== Math.floor(D1 + h);
        if (sun) c = seam || joint ? shade(PLANK, 0.25) : sunFloor;
        else if (seam || joint) c = lit ? seamLit : PLANK;
      }
      a.p(x, y, c);
    }
  }
  // the desk's shadow on the floor under it
  for (let y = BW.y1; y < DK.y + 37; y++) for (let x = DK.x0 + 3; x < DK.x1 - 3; x++) a.tone(x, y, -0.14);

  /* ── the window: the Garonne, the Saint-Cyprien bank and the Dôme de la Grave, in the sky outside ── */
  paintView(a, L, s.rain);
  // sash, mullion, transom, sill
  const FR = "#d8cbb6";
  const FRD = "#a8987f";
  a.r(WIN.x0 - 4, WIN.y0 - 4, WIN.x1 - WIN.x0 + 8, 4, FR);
  a.r(WIN.x0 - 4, WIN.y1, WIN.x1 - WIN.x0 + 8, 3, FR);
  a.r(WIN.x0 - 4, WIN.y0, 4, WIN.y1 - WIN.y0, FR);
  a.r(WIN.x1, WIN.y0, 4, WIN.y1 - WIN.y0, FRD);
  a.r(MULL, WIN.y0, 3, WIN.y1 - WIN.y0, FR);
  a.r(MULL + 2, WIN.y0, 1, WIN.y1 - WIN.y0, FRD);
  a.r(WIN.x0, TRANSOM, WIN.x1 - WIN.x0, 2, FR);
  a.r(WIN.x0, TRANSOM + 1, WIN.x1 - WIN.x0, 1, FRD);
  // the frame's shadow on the glass, top and left of each pane
  for (const [x0, x1] of [[WIN.x0, MULL], [MULL + 3, WIN.x1]]) {
    for (let x = x0; x < x1; x++) {
      a.tone(x, WIN.y0, -0.3);
      a.tone(x, TRANSOM + 2, -0.3);
    }
    for (let y = WIN.y0 + 1; y < WIN.y1; y++) if (y !== TRANSOM && y !== TRANSOM + 1) a.tone(x0, y, -0.22);
  }
  a.r(WIN.x0 - 7, WIN.y1 + 3, WIN.x1 - WIN.x0 + 14, 3, "#c8b89f");
  a.r(WIN.x0 - 7, WIN.y1 + 3, WIN.x1 - WIN.x0 + 14, 1, "#e0d4bf");
  a.r(WIN.x0 - 7, WIN.y1 + 6, WIN.x1 - WIN.x0 + 14, 1, "#7d6c58");
  // a glint on each lower pane
  for (const x0 of [WIN.x0 + 4, MULL + 7])
    for (let k = 0; k < 5; k++) {
      a.p(x0 + k, TRANSOM + 10 - k, "rgba(255,255,255,0.22)");
      if (k < 3) a.p(x0 + 3 + k, TRANSOM + 10 - k, "rgba(255,255,255,0.14)");
    }
  // curtains, hanging in folds from rings on a rod
  const FOLDS = [1, 2, 2, 1, 0, 1, 2, 1, 0];
  const CUR = ["#3f4f4a", "#4f6159", "#5b6f66"];
  for (const cx of [WIN.x0 - 13, WIN.x1 + 5]) {
    for (let y = WIN.y0 - 8; y < WIN.y1 + 14; y++)
      for (let x = 0; x < 9; x++) {
        let f = FOLDS[x];
        if (f === 1 && bayer(cx + x, y) < 0.18) f = 0;
        a.p(cx + x, y, CUR[f]);
      }
    for (let x = 0; x < 9; x += 3) a.p(cx + x + 1, WIN.y0 - 8, "#2a2420");
  }
  a.r(WIN.x0 - 17, WIN.y0 - 10, WIN.x1 - WIN.x0 + 33, 2, "#2a2420");
  a.r(WIN.x0 - 19, WIN.y0 - 11, 2, 4, "#2a2420");
  a.r(WIN.x1 + 15, WIN.y0 - 11, 2, 4, "#2a2420");

  /* ── the shelves: a book per post, then the record sleeves ── */
  for (const y of [36, 62]) {
    a.r(SH.x0, y, SH.x1 - SH.x0, 2, WOOD_LT);
    a.r(SH.x0, y + 2, SH.x1 - SH.x0, 1, WOOD_DK);
    for (let x = SH.x0 + 1; x < SH.x1; x++) a.tone(x, y + 3, -0.2);
    a.r(SH.x0 + 4, y + 3, 2, 3, WOOD_DK);
    a.r(SH.x1 - 6, y + 3, 2, 3, WOOD_DK);
  }
  let bx = SH.x0 + 4;
  const books = Math.max(1, Math.min(6, s.posts));
  for (let i = 0; i < books; i++) {
    const c = CLOTH[i % CLOTH.length];
    const h = 13 + ((i * 5) % 4);
    a.r(bx, 36 - h, 6, h, c);
    a.r(bx, 36 - h, 1, h, shade(c, 0.2));
    a.r(bx + 5, 36 - h, 1, h, shade(c, -0.2));
    a.r(bx + 1, 36 - h + 3, 4, 1, "#efe5cf");
    a.r(bx + 1, 36 - 4, 4, 1, "#efe5cf");
    bx += 7;
  }
  a.r(bx + 1, 26, 2, 10, "#8a8f86");
  a.r(bx + 1, 34, 6, 2, "#8a8f86");
  if (bx < SH.x1 - 34) {
    a.r(SH.x1 - 26, 31, 18, 2, "#c7b79c");
    a.r(SH.x1 - 25, 29, 16, 2, "#9aa79a");
    a.r(SH.x1 - 27, 33, 20, 3, "#7d6a58");
  }
  ["#2f4a6a", "#b0544a", "#e0c15c", "#4f6b3e", "#6a4a7a", "#c98a62"].forEach((c, i) => {
    const x = SH.x0 + 4 + i * 4;
    a.r(x, 62 - 17, 3, 17, c);
    a.r(x, 62 - 17, 1, 17, shade(c, -0.25));
  });
  a.r(SH.x0 + 34, 62 - 15, 14, 15, "#1c2224");
  a.circle(SH.x0 + 41, 62 - 8, 5, "#2c3436");
  a.r(SH.x0 + 40, 62 - 9, 2, 2, "#e0c15c");

  /* ── the board: a postcard per trip ── */
  for (let x = BD.x0 - 1; x < BD.x1 + 3; x++) a.tone(x, BD.y1 + 2, -0.2);
  a.dither(BD.x0, BD.y0, BD.x1 - BD.x0, BD.y1 - BD.y0, "#9c7650", "#8a6644", 0.4);
  a.r(BD.x0 - 2, BD.y0 - 2, BD.x1 - BD.x0 + 4, 2, WOOD_DK);
  a.r(BD.x0 - 2, BD.y1, BD.x1 - BD.x0 + 4, 2, WOOD_DK);
  a.r(BD.x0 - 2, BD.y0, 2, BD.y1 - BD.y0, WOOD_DK);
  a.r(BD.x1, BD.y0, 2, BD.y1 - BD.y0, WOOD_DK);
  SLOTS.slice(0, Math.max(0, Math.min(6, s.places))).forEach(([x, y], i) => {
    const [sky, land, deep] = CARDS[i];
    a.r(x + 1, y + 1, 14, 11, "rgba(0,0,0,0.25)");
    a.r(x, y, 14, 11, "#efe6d4");
    a.r(x + 1, y + 1, 12, 5, sky);
    a.r(x + 1, y + 6, 12, 4, land);
    a.r(x + 1 + (i % 3) * 3, y + 7, 4, 3, deep);
    a.r(x + 10, y + 1, 3, 3, "#e0453a");
    a.p(x + 7, y, "#e0c15c");
  });

  /* ── the clock: Toulouse time ── */
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) if (x * x + y * y <= 68) a.tone(CK.x + x + 1, CK.y + y + 1, -0.22);
  a.circle(CK.x, CK.y, 8, "#a8987f");
  a.circle(CK.x, CK.y, 7, "#efe6d4");
  for (let h = 0; h < 12; h++) {
    const t = (h / 12) * Math.PI * 2;
    a.p(Math.round(CK.x + Math.sin(t) * 6), Math.round(CK.y - Math.cos(t) * 6), h % 3 ? "#cfc3ad" : "#8a7f6e");
  }
  const ha = (((s.hour % 12) + s.minute / 60) / 12) * Math.PI * 2;
  const ma = (s.minute / 60) * Math.PI * 2;
  a.line(CK.x, CK.y, Math.round(CK.x + Math.sin(ma) * 5.4), Math.round(CK.y - Math.cos(ma) * 5.4), "#4a5456");
  a.line(CK.x, CK.y, Math.round(CK.x + Math.sin(ha) * 3.4), Math.round(CK.y - Math.cos(ha) * 3.4), IRON);
  a.p(CK.x, CK.y, IRON);

  /* ── the desk under the window ── */
  a.r(DK.x0, DK.y, DK.x1 - DK.x0, 3, WOOD_LT);
  a.r(DK.x0, DK.y, DK.x1 - DK.x0, 1, shade(WOOD_LT, -0.12));
  a.r(DK.x0, DK.y + 3, DK.x1 - DK.x0, 3, WOOD);
  a.r(DK.x0, DK.y + 6, DK.x1 - DK.x0, 1, WOOD_DK);
  a.r(DK.x0 + 3, DK.y + 7, 3, 30, WOOD_DK);
  a.r(DK.x1 - 6, DK.y + 7, 3, 30, WOOD_DK);
  a.r(DK.x0 + 76, DK.y + 7, 40, 14, WOOD);
  a.r(DK.x0 + 76, DK.y + 7, 40, 1, WOOD_DK);
  a.r(DK.x0 + 76, DK.y + 20, 40, 1, WOOD_DK);
  a.r(DK.x0 + 94, DK.y + 12, 4, 1, "#c8a070");
  // the lamp (lit at dusk and by night) and its light on the desk
  if (L.lamp)
    for (let x = DK.x0 + 1; x < DK.x0 + 58; x++)
      for (let y = DK.y; y < DK.y + 3; y++) {
        const d = Math.abs(x - (DK.x0 + 24)) + (y - DK.y) * 6;
        if (d < 22 + bayer(x, y) * 8) a.p(x, y, d < 10 + bayer(x, y) * 6 ? "#e6b47c" : "#c89a6a");
      }
  a.r(DK.x0 + 2, DK.y - 2, 10, 2, IRON);
  a.r(DK.x0 + 3, DK.y - 3, 8, 1, "#3a4446");
  a.line(DK.x0 + 7, DK.y - 3, DK.x0 + 3, DK.y - 14, IRON);
  a.line(DK.x0 + 8, DK.y - 4, DK.x0 + 4, DK.y - 14, "#4a5456");
  a.r(DK.x0 + 2, DK.y - 16, 2, 2, "#4a5456");
  a.line(DK.x0 + 3, DK.y - 16, DK.x0 + 9, DK.y - 25, IRON);
  a.sprite(DK.x0 + 7, DK.y - 27, LAMP, {
    k: "#4a5456",
    a: "#e0b850",
    b: "#c79a3c",
    c: "#8f6a2a",
    l: L.lamp ? "#f6d890" : "#7a6440",
    m: L.lamp ? "#fff8dc" : "#5e5240",
  });
  // the mug
  a.r(DK.x0 + 20, DK.y - 6, 6, 6, "#d9e0d8");
  a.r(DK.x0 + 25, DK.y - 6, 1, 6, "#b8c2ba");
  a.r(DK.x0 + 26, DK.y - 5, 2, 1, "#d9e0d8");
  a.r(DK.x0 + 27, DK.y - 4, 1, 2, "#d9e0d8");
  a.r(DK.x0 + 26, DK.y - 2, 2, 1, "#d9e0d8");
  a.r(DK.x0 + 21, DK.y - 6, 4, 1, "#5a3d2c");
  // the laptop, the last push on its screen
  a.poly([[LP.x - 2, LP.y], [LP.x + 34, LP.y], [LP.x + 31, LP.y - 3], [LP.x + 1, LP.y - 3]], "#8a9690");
  a.r(LP.x - 2, LP.y - 1, 36, 1, "#6f7a74");
  a.r(LP.x + 3, LP.y - 21, 26, 18, IRON);
  a.r(LP.x + 4, LP.y - 20, 24, 16, "#131516");
  ([["#819890", 8], ["#f8ebe3", 18], ["#e0c15c", 14], ["#a5b5ab", 19], ["#819890", 10]] as [string, number][]).forEach(([c, w], i) => a.r(LP.x + 6, LP.y - 18 + i * 3, w, 1, c));
  a.r(LP.x + 21, LP.y - 6, 2, 2, "#f4e276");
  // the letter tray, an envelope sealed in red
  a.r(212, DK.y - 9, 14, 1, "#d9cdb6");
  a.r(210, DK.y - 8, 16, 6, "#efe6d4");
  a.line(210, DK.y - 8, 217, DK.y - 4, "#c9bca2");
  a.line(225, DK.y - 8, 218, DK.y - 4, "#c9bca2");
  a.r(217, DK.y - 5, 2, 2, "#d0473a");
  a.r(208, DK.y - 3, 20, 3, "#6b4a33");
  a.r(208, DK.y - 3, 20, 1, "#8a6447");
  // a snake plant in its pot
  a.r(238, DK.y - 7, 9, 7, "#b0644a");
  a.r(246, DK.y - 7, 1, 7, "#8f4e3a");
  a.r(237, DK.y - 8, 11, 2, "#c27a5c");
  for (const [x, h, c, lean] of [[239, 11, "#5d7f45", -1], [241, 16, "#4f6b3e", 0], [243, 13, "#6f9a55", 0], [245, 9, "#3c5a33", 1], [242, 8, "#5d7f45", 0]] as [number, number, string, number][])
    for (let j = 0; j < h; j++) {
      const lx = x + (j > h / 2 ? lean : 0);
      const top = DK.y - 8 - j;
      a.p(lx, top, c);
      if (j < h - 2) a.p(lx + 1, top, j % 4 === 1 ? shade(c, 0.25) : c);
    }

  /* ── the record cabinet, the turntable on top ── */
  a.r(CB.x0, CB.y0, CB.x1 - CB.x0, CB.y1 - CB.y0, WOOD);
  a.r(CB.x0, CB.y0, CB.x1 - CB.x0, 2, WOOD_LT);
  a.r(CB.x0, CB.y0 + 2, CB.x1 - CB.x0, 1, WOOD_DK);
  a.r(CB.x1 - 1, CB.y0 + 3, 1, CB.y1 - CB.y0 - 3, WOOD_DK);
  a.r(CB.x0 + 3, BIN.y0, 34, BIN.y1 - BIN.y0, WOOD_DK);
  a.r(BIN.x0, BIN.y0, BIN.x1 - BIN.x0, BIN.y1 - BIN.y0, WOOD_DK);
  SLEEVES.forEach((c, i) => {
    const x = CB.x0 + 5 + i * 3.4;
    a.r(x, BIN.y0 + 2, 2, BIN.y1 - BIN.y0 - 2, c);
    a.r(x, BIN.y0 + 2, 1, BIN.y1 - BIN.y0 - 2, shade(c, -0.2));
  });
  a.r(CB.x0 + 2, CB.y1, 4, 3, WOOD_DK);
  a.r(CB.x1 - 6, CB.y1, 4, 3, WOOD_DK);
  // the bin: two sleeves leaning behind the one at the front
  for (const [x, y, c] of [[BIN.x0 + 2, SLV.y - 1, "#3f5a6e"], [SLV.x + 8, SLV.y - 2, "#8a4a40"]] as [number, number, string][]) {
    a.r(x, y, SLV.w, BIN.y1 - y, c);
    a.r(x, y, SLV.w, 1, shade(c, 0.2));
    a.r(x + SLV.w - 1, y, 1, BIN.y1 - y, shade(c, -0.3));
  }
  for (let y = SLV.y; y < SLV.y + SLV.h; y++) a.tone(SLV.x + SLV.w, y, -0.35);
  // the turntable
  a.r(TT.x0, TT.y0, TT.x1 - TT.x0, 7, "#d6cdbd");
  a.r(TT.x0, TT.y0, TT.x1 - TT.x0, 1, "#efe7d8");
  a.r(TT.x0, TT.y0 + 7, TT.x1 - TT.x0, 2, "#b3a993");
  a.r(TT.x0, TT.y0 + 9, TT.x1 - TT.x0, 1, "#8a8070");
  const PCX = TT.x0 + 20;
  const PCY = TT.y0 + 3;
  for (let y = -3; y <= 3; y++)
    for (let x = -17; x <= 17; x++) {
      const e = (x / 17.5) ** 2 + (y / 3.5) ** 2;
      if (e > 1) continue;
      const ring = Math.round(Math.sqrt(e) * 7);
      let c = e > 0.8 ? "#3a4446" : ring % 2 ? "#202526" : "#2a3032";
      if (x > 4 && x < 12 && y < 0 && e < 0.8) c = "#4a5456";
      a.p(PCX + x, PCY + y, c);
    }
  a.r(PCX - 2, PCY, 5, 1, "#e0c15c");
  a.r(PCX - 1, PCY - 1, 3, 1, "#e0c15c");
  a.r(PCX - 1, PCY + 1, 3, 1, "#c9a54a");
  a.p(PCX, PCY, IRON);
  // the arm: on the record while one plays, on its rest when not
  a.r(TT.x1 - 6, TT.y0 + 1, 3, 2, "#8a9690");
  a.p(TT.x1 - 5, TT.y0 + 1, "#c9d0cb");
  if (s.playing) {
    a.line(TT.x1 - 5, TT.y0 + 2, PCX + 11, PCY + 2, "#c9d0cb");
    a.r(PCX + 10, PCY + 2, 2, 1, "#f8ebe3");
  } else {
    a.line(TT.x1 - 5, TT.y0 + 2, TT.x1 - 4, TT.y0 + 6, "#c9d0cb");
    a.r(TT.x1 - 4, TT.y0 + 6, 2, 1, "#f8ebe3");
  }
  a.r(TT.x0 + 3, TT.y0 + 8, 2, 1, s.playing ? "#9fd09a" : "#6f7a74");
  a.r(TT.x1 - 7, TT.y0 + 8, 3, 1, "#8a8070");

  // the sleeve of what's playing, at the front of the bin: the real cover, in pixels
  let late: HTMLCanvasElement | null = null;
  const sleeve = cover ? coverPixels(cover) : null;
  if (sleeve && "px" in sleeve) {
    // a touch dimmer by lamplight, a lit edge along the top
    const k = L.lamp ? -0.1 : 0;
    for (let y = 0; y < SLV.h; y++)
      for (let x = 0; x < SLV.w; x++) {
        const i = (y * SLV.w + x) * 4;
        const c = toHex([sleeve.px.data[i], sleeve.px.data[i + 1], sleeve.px.data[i + 2]]);
        a.p(SLV.x + x, SLV.y + y, y === 0 ? shade(c, 0.25) : k ? shade(c, k) : c);
      }
  } else if (sleeve) late = sleeve.canvas;
  else {
    a.vgrad(SLV.x, SLV.y, SLV.w, SLV.h, [[0, "#30306a"], [0.55, "#b0507a"], [1, "#f0a86a"]]);
    a.circle(SLV.x + 9, SLV.y + 10, 4, "#f6c46d");
  }

  g.putImageData(new ImageData(a.d, W, H), 0, 0);
  // a cover that can't be read back (no CORS) is laid on as it comes, still at the room's pixel size
  if (late) {
    g.imageSmoothingEnabled = false;
    g.drawImage(late, SLV.x, SLV.y);
  }
  return spots;
}

/** the desk lamp's head: the shade turned down toward the desk, its mouth lit at night */
const LAMP = [
  "kk.........",
  "kkab.......",
  ".aabbb.....",
  ".abbbbbb...",
  "..bbbbbbbc.",
  "...cbbbbcl.",
  "....cbbclm.",
  ".....cclmm.",
  "......lmm..",
  ".......l...",
];

/** the rug, at a point of the floor: its colour, or null off it */
function rugAt(x: number, y: number): string | null {
  const t = (y - RUG.y0) / (RUG.y1 - RUG.y0);
  if (t < 0 || t > 1.04) return null;
  const xl = Math.round(RUG.top[0] + (RUG.foot[0] - RUG.top[0]) * Math.min(1, t));
  const xr = Math.round(RUG.top[1] + (RUG.foot[1] - RUG.top[1]) * Math.min(1, t));
  if (x < xl || x >= xr) return null;
  // the fringe at its near edge
  if (y > RUG.y1) return (x & 1) === 0 ? "#bfb395" : null;
  const side = Math.min(x - xl, xr - 1 - x);
  const top = y - RUG.y0;
  const foot = RUG.y1 - y;
  if (side < 2 || top < 1 || foot < 1) return "#3f4b45";
  if (side < 3 || top < 2 || foot < 2) return "#8a7450";
  const cx = (xl + xr) / 2;
  const dd = Math.abs(x - cx) / 2.4 + Math.abs(y - (RUG.y0 + RUG.y1) / 2);
  if (dd < 2) return "#b08f5c";
  if (dd < 5) return "#8a7450";
  if (dd < 9) return "#6f8072";
  return "#56665b";
}

/** the sun through the window, laid on the floor in front of the desk (by day) */
function sunAt(x: number, y: number) {
  const k = (y - 143) / 33;
  if (k < 0 || k > 1) return false;
  const l = 158 - k * 26;
  const r = 236 - k * 6;
  if (x < l || x >= r) return false;
  const mid = l + (r - l) * 0.52;
  if (Math.abs(x - mid) < 1 + k) return false;
  if (k > 0.6 && k < 0.67) return false;
  const edge = Math.min(x - l, r - x, (y - 143) * 1.5, (176 - y) * 1.5);
  return edge > 2 || bayer(x, y) < 0.5;
}

/** the cover, at the sleeve's size in art pixels: its pixels if it can be read, else the small canvas itself */
function coverPixels(img: CanvasImageSource): { px: ImageData } | { canvas: HTMLCanvasElement } | null {
  const t = document.createElement("canvas");
  t.width = SLV.w;
  t.height = SLV.h;
  const tg = t.getContext("2d");
  if (!tg) return null;
  tg.imageSmoothingEnabled = true;
  tg.imageSmoothingQuality = "high";
  try {
    tg.drawImage(img, 0, 0, SLV.w, SLV.h);
  } catch {
    return null;
  }
  try {
    return { px: tg.getImageData(0, 0, SLV.w, SLV.h) };
  } catch {
    return { canvas: t };
  }
}

/** what the window looks out on: the sky, the far bank and its dome, and the river mirroring them */
function paintView(a: Px, L: Light, rain: boolean) {
  const night = (c: string) => (L.dark ? shade(c, -L.dark) : c);
  const w = WIN.x1 - WIN.x0;
  // the far bank's own lights, for the river to mirror; and what stands there at all
  const lit = new Uint8Array(w * (QUAY - WIN.y0 + 1));
  const solid = new Uint8Array(w * (QUAY - WIN.y0 + 1));
  const mark = (m: Uint8Array, x: number, y: number) => {
    if (x >= WIN.x0 && x < WIN.x1 && y >= WIN.y0 && y <= QUAY) m[(y - WIN.y0) * w + (x - WIN.x0)] = 1;
  };
  const at = (m: Uint8Array, x: number, y: number) => x >= WIN.x0 && x < WIN.x1 && y >= WIN.y0 && y <= QUAY && m[(y - WIN.y0) * w + (x - WIN.x0)] === 1;
  const put = (x: number, y: number, c: string, light = false) => {
    a.p(x, y, c);
    mark(solid, x, y);
    if (light) mark(lit, x, y);
  };
  const glow = "#f0c070";

  // the sky
  a.vgrad(WIN.x0, WIN.y0, w, QUAY - WIN.y0, L.sky);
  if (L.stars)
    for (let i = 0; i < 24; i++) {
      const x = WIN.x0 + 3 + ((i * 41) % (w - 6));
      const y = WIN.y0 + 2 + ((i * 17) % 30);
      a.p(x, y, i % 4 ? "#9aa2b4" : "#ebe9e1");
    }

  // the Saint-Cyprien bank: brick houses of uneven height side by side, a window grid each
  const r = rng(11);
  const wall = [L.bank[1], mix(L.bank[0], L.bank[1], 0.5), shade(L.bank[1], 0.06)];
  const roof = shade(L.bank[0], -0.25);
  for (let x = WIN.x0 - 2; x < WIN.x1; ) {
    const bw = 5 + Math.floor(r() * 7);
    const bh = 5 + Math.floor(r() * 7);
    const c = wall[Math.floor(r() * wall.length)];
    const pitched = r() < 0.5;
    const top = QUAY - bh;
    for (let y = top; y < QUAY; y++) for (let i = 0; i < bw; i++) put(x + i, y, i === 0 ? shade(c, -0.18) : c);
    if (pitched) {
      for (let i = 1; i < bw - 1; i++) put(x + i, top - 1, roof);
      for (let i = 2; i < bw - 2; i++) put(x + i, top - 2, roof);
    } else {
      for (let i = 0; i < bw; i++) put(x + i, top, shade(c, 0.1));
      if (r() < 0.5) put(x + 1 + Math.floor(r() * (bw - 2)), top - 1, roof);
    }
    for (let y = top + 2; y < QUAY - 2; y += 3)
      for (let i = 2; i < bw - 1; i += 2) {
        const on = hash1((x + i) * 131 + y * 7) < L.windows * 0.6;
        put(x + i, y, on ? glow : shade(c, -0.4), on);
      }
    x += bw;
  }

  // the Dôme de la Grave: the hospital's front, the drum, the verdigris dome, the lantern
  const stone = night("#c9a080");
  const stoneLt = night("#dcc0a0");
  const hosp = night(shade(L.bank[1], 0.08));
  for (let y = QUAY - 9; y < QUAY; y++)
    for (let x = DOME - 11; x <= DOME + 11; x++) {
      const win = (x - DOME) % 3 === 0 && (y - QUAY) % 3 === -1 && Math.abs(x - DOME) < 11;
      const on = win && L.windows > 0.3 && hash1(x * 7 + y) < 0.6;
      put(x, y, win ? (on ? glow : shade(hosp, -0.3)) : y === QUAY - 9 ? stoneLt : hosp, on);
    }
  for (let y = QUAY - 15; y < QUAY - 9; y++)
    for (let x = DOME - 7; x <= DOME + 7; x++) {
      const pil = (x - DOME + 7) % 3 === 0;
      const win = !pil && y >= QUAY - 13 && y <= QUAY - 11 && (x - DOME + 7) % 3 === 1;
      const on = win && L.windows > 0.3;
      put(x, y, win ? (on ? "#e0b060" : shade(stone, -0.4)) : pil ? stoneLt : x > DOME + 3 ? shade(stone, -0.15) : stone, on);
    }
  for (let x = DOME - 8; x <= DOME + 8; x++) put(x, QUAY - 16, stoneLt);
  const VERD = [night("#7ab8a2"), night("#4f8f7c"), night("#2f6b5c")];
  for (let dy = 1; dy <= 8; dy++) {
    const half = 7.5 * Math.sqrt(1 - ((dy - 0.5) / 8) ** 2);
    for (let x = Math.round(DOME - half); x <= Math.round(DOME + half); x++) {
      const u = (x - DOME) / (half + 0.01);
      const t = u + bayer(x, QUAY - 16 - dy) * 0.3 - 0.15;
      const rib = Math.abs(u) > 0.3 && Math.abs(u) < 0.5 && dy < 7;
      put(x, QUAY - 16 - dy, t < -0.4 ? VERD[0] : t > 0.45 || rib ? VERD[2] : VERD[1]);
    }
  }
  for (let y = QUAY - 28; y < QUAY - 24; y++) for (let x = DOME - 1; x <= DOME + 1; x++) put(x, y, x === DOME + 1 ? shade(stone, -0.15) : stoneLt);
  for (let x = DOME - 1; x <= DOME + 1; x++) put(x, QUAY - 29, VERD[1]);
  put(DOME, QUAY - 30, VERD[2]);
  put(DOME, QUAY - 31, VERD[2]);

  // the quay: a stone wall at the water, its lamps lit at night
  for (let x = WIN.x0; x < WIN.x1; x++) {
    put(x, QUAY, night("#8a7a6a"));
    put(x, QUAY + 1, night("#6a5c50"));
  }
  if (L.windows > 0.3)
    for (let x = WIN.x0 + 6; x < WIN.x1; x += 13) {
      if (Math.abs(x - DOME) < 12) continue;
      put(x, QUAY - 1, "#2a2420");
      put(x, QUAY - 2, "#2a2420");
      put(x, QUAY - 3, "#ffd890", true);
    }

  // the Garonne: the far bank mirrored, its lights drawn out into streaks, a few ripples
  const top = QUAY + 2;
  a.vgrad(WIN.x0, top, w, WIN.y1 - top, L.river);
  for (let y = top; y < WIN.y1; y++) {
    const d = y - top;
    const sway = Math.round(Math.sin(y * 1.9) * Math.min(1.6, 0.4 + d * 0.08));
    for (let x = WIN.x0; x < WIN.x1; x++) {
      const sx = x + sway;
      const sy = QUAY - 1 - d;
      // a light reflects longer than it stands
      const light = at(lit, sx, QUAY - 1 - Math.floor(d * 0.45)) || at(lit, sx, sy);
      if (light && bayer(x, y) < 0.85 - d * 0.035) a.p(x, y, d < 6 ? "#f0c070" : "#c89058");
      else if (at(solid, sx, sy) && bayer(x, y) < (L.windows > 0.3 ? 0.7 : 0.5) - d * 0.03) a.p(x, y, mix(a.get(sx, sy), a.get(x, y), 0.55));
    }
  }
  const glint = shade(L.river[0][1], L.windows > 0.3 ? 0.1 : 0.22);
  for (let i = 0; i < 9; i++) {
    const x = WIN.x0 + 3 + Math.floor(hash1(i * 13 + 5) * (w - 8));
    const y = top + 3 + Math.floor(hash1(i * 7 + 2) * (WIN.y1 - top - 5));
    a.r(x, y, 2 + (i % 3), 1, glint);
  }

  // rain on the glass
  if (rain)
    for (let i = 0; i < 40; i++) {
      const x = WIN.x0 + ((i * 53) % w);
      const y = WIN.y0 + ((i * 31) % (WIN.y1 - WIN.y0 - 4));
      a.p(x, y, "rgba(220,230,235,0.55)");
      a.p(x, y + 1, "rgba(220,230,235,0.35)");
      if (i % 3 === 0) a.p(x, y + 2, "rgba(220,230,235,0.2)");
    }
}

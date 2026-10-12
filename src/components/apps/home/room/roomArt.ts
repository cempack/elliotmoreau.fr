/**
 * Elliot's room, behind the lit window: a small pixel interior (300×179
 * art pixels) drawn the way the wallpaper is, lit by the hour outside. By
 * night and at dusk the desk lamp is on and warms the wall; by day the
 * window does, and the sun lays a patch on the floor. The window looks
 * back over the Garonne at the Dôme de la Grave in that sky (rain on the
 * glass when it rains). The shelf holds a book per post, the board a
 * postcard per trip, the clock shows Toulouse time, and the turntable's
 * arm is on the record while one is playing.
 *
 * `paintRoom` draws it into a canvas of W×H and returns where each object
 * stands, so the page can put a door on each.
 */

export const ROOM_W = 300;
export const ROOM_H = 179;

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
  sleeve: Rect;
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
const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};
const shade = (c: string, k: number) => (k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k));

/** a tiny pixel painter over a 2D context */
class Px {
  constructor(private g: CanvasRenderingContext2D) {}
  p(x: number, y: number, c: string) {
    if (x < 0 || y < 0 || x >= ROOM_W || y >= ROOM_H) return;
    this.g.fillStyle = c;
    this.g.fillRect(x | 0, y | 0, 1, 1);
  }
  r(x: number, y: number, w: number, h: number, c: string) {
    this.g.fillStyle = c;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
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
  bank: [string, string];
  river: [number, string][];
  windows: number;
  stars: boolean;
  sunPatch: boolean;
};
const LIGHTS: Record<RoomPhase, Light> = {
  night: {
    lamp: true,
    wall: "#56443a",
    wallLit: ["#6f5547", "#8f6b52", "#a37b5c"],
    pool: { x: 138, y: 78, r: 1 },
    side: "#45362f",
    sideDk: "#2f2621",
    floor: "#4a3326",
    floorLt: "#6a4a33",
    ceil: "#221c1a",
    sky: [[0, "#0b0f1d"], [0.6, "#141a30"], [1, "#1d2540"]],
    bank: ["#3a2a2c", "#45302f"],
    river: [[0, "#1d2238"], [0.5, "#151a2a"], [1, "#10131f"]],
    windows: 0.8,
    stars: true,
    sunPatch: false,
  },
  dusk: {
    lamp: true,
    wall: "#6f5648",
    wallLit: ["#86664f", "#a07a5c", "#b08463"],
    pool: { x: 138, y: 78, r: 1 },
    side: "#5a463c",
    sideDk: "#3d302a",
    floor: "#5a3d2c",
    floorLt: "#7a543a",
    ceil: "#2c2523",
    sky: [[0, "#2d3352"], [0.45, "#6b5672"], [0.75, "#c07a68"], [1, "#e8a46a"]],
    bank: ["#7a4a42", "#8f5648"],
    river: [[0, "#6a5a6a"], [0.5, "#3b4a58"], [1, "#2b3442"]],
    windows: 0.55,
    stars: false,
    sunPatch: false,
  },
  dawn: {
    lamp: false,
    wall: "#6a5750",
    wallLit: ["#7c665c", "#8f776a", "#9c8376"],
    pool: { x: 193, y: 60, r: 1.35 },
    side: "#564641",
    sideDk: "#3b302d",
    floor: "#56402f",
    floorLt: "#6f5440",
    ceil: "#2e2828",
    sky: [[0, "#3d3a5c"], [0.55, "#8a6f7a"], [1, "#e9c39a"]],
    bank: ["#8a5a4e", "#9c6654"],
    river: [[0, "#8a7a86"], [0.5, "#5a6270"], [1, "#3a4452"]],
    windows: 0.15,
    stars: false,
    sunPatch: false,
  },
  day: {
    lamp: false,
    wall: "#7d675a",
    wallLit: ["#8e7767", "#a08774", "#ad9480"],
    pool: { x: 193, y: 60, r: 1.5 },
    side: "#665449",
    sideDk: "#463a33",
    floor: "#6a4a35",
    floorLt: "#8a6447",
    ceil: "#3a3230",
    sky: [[0, "#7fa3b8"], [0.7, "#a9c2c9"], [1, "#c9d8d6"]],
    bank: ["#b8604a", "#c46c54"],
    river: [[0, "#6f9a96"], [0.5, "#4f7e80"], [1, "#3f6a6e"]],
    windows: 0,
    stars: false,
    sunPatch: true,
  },
};

const WOOD = "#7a5236";
const WOOD_LT = "#9c6c47";
const WOOD_DK = "#4f3524";
const PLANK = "#342319";
const CLOTH = ["#5b7fa0", "#a65a4a", "#6f8b5a", "#8a6a9a", "#c98a62", "#4f8fa0"];
const CARDS: [string, string, string][] = [
  ["#7aa6c8", "#e8e2d0", "#3f6a8a"],
  ["#5f9a5a", "#d9e4c8", "#2f5a3a"],
  ["#e0a46a", "#f0d8a8", "#b0544a"],
  ["#4f8fa0", "#e8d8a0", "#2b4c52"],
  ["#6f8b5a", "#cfd8c0", "#3a4a32"],
  ["#b0584a", "#f2c46d", "#5e3027"],
];

export function paintRoom(cv: HTMLCanvasElement, s: RoomState): RoomSpots {
  cv.width = ROOM_W;
  cv.height = ROOM_H;
  const g = cv.getContext("2d");
  const L = LIGHTS[s.phase];
  const W = ROOM_W;
  const H = ROOM_H;
  const VX = 150;
  const VY = 84;
  const LAMP = { x: 138, y: 78 };
  const BW = { x0: 46, x1: 254, y0: 10, y1: 124 };
  const WIN = { x0: 150, x1: 236, y0: 22, y1: 94 };
  const DK = { x0: 128, x1: 252, y: 104 };
  const SH = { x0: 58, x1: 128 };
  const BD = { x0: 60, y0: 70, x1: 124, y1: 98 };
  const CB = { x0: 44, x1: 116, y0: 112, y1: 140 };
  const TT = { x: 52, y: CB.y0 - 9 };
  const SL = { x: CB.x1 - 10, y: CB.y1 - 20 };
  const LP = { x: 166, y: DK.y };
  const spots: RoomSpots = {
    laptop: { x: LP.x - 2, y: LP.y - 22, w: 37, h: 23 },
    turntable: { x: CB.x0, y: TT.y - 2, w: CB.x1 - CB.x0 - 12, h: CB.y1 - TT.y + 2 },
    sleeve: { x: SL.x, y: SL.y, w: 22, h: 22 },
    shelf: { x: SH.x0, y: 14, w: SH.x1 - SH.x0, h: 52 },
    board: { x: BD.x0 - 2, y: BD.y0 - 2, w: BD.x1 - BD.x0 + 4, h: BD.y1 - BD.y0 + 4 },
    tray: { x: 202, y: DK.y - 8, w: 24, h: 9 },
    window: { x: WIN.x0 - 4, y: WIN.y0 - 4, w: WIN.x1 - WIN.x0 + 8, h: WIN.y1 - WIN.y0 + 7 },
  };
  if (!g) return spots;
  const a = new Px(g);

  /* ── the room's shell ── */
  a.poly([[0, 0], [W, 0], [BW.x1, BW.y0], [BW.x0, BW.y0]], L.ceil);
  a.poly([[0, 0], [BW.x0, BW.y0], [BW.x0, BW.y1], [0, H]], L.side);
  a.poly([[W, 0], [BW.x1, BW.y0], [BW.x1, BW.y1], [W, H]], L.sideDk);
  a.poly([[BW.x0, BW.y1], [BW.x1, BW.y1], [W, H], [0, H]], L.floor);
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
  a.r(BW.x0, BW.y1 - 3, BW.x1 - BW.x0, 3, shade(L.wall, -0.45));
  // floor planks converging on the vanishing point
  for (let i = -10; i <= 10; i++) {
    const xb = BW.x0 + ((BW.x1 - BW.x0) * (i + 10)) / 20;
    const xf = (xb - VX) * ((H - VY) / (BW.y1 - VY)) + VX;
    a.line(xb, BW.y1, xf, H, PLANK);
  }
  const floorDk = shade(L.floor, -0.3);
  for (let y = BW.y1 + 1; y < H; y++) {
    const k = (y - BW.y1) / (H - BW.y1);
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - 160) * 0.7, (y - 140) * 1.6);
      if (L.lamp && d < 58 + bayer(x, y) * 10) a.p(x, y, L.floorLt);
      else if (k > 0.75 && bayer(x, y) < (k - 0.75) * 2) a.p(x, y, floorDk);
    }
  }
  // by day the sun lays the window on the floor
  if (L.sunPatch) {
    for (let y = 128; y < 168; y++) {
      const k = (y - 128) / 40;
      const l = 160 - k * 30;
      const r = 236 - k * 8;
      for (let x = Math.round(l); x < r; x++) if (bayer(x, y) < 0.85) a.p(x, y, shade(L.floorLt, 0.12));
    }
  }
  // the rug
  a.poly([[96, 140], [214, 140], [236, 170], [74, 170]], "#4c5a52");
  a.poly([[100, 143], [210, 143], [229, 167], [81, 167]], "#5b6b60");
  for (let x = 84; x < 226; x += 6) a.line(x, 155, x + 3, 155, "#6f8072");

  /* ── the window: the Garonne and the Dôme de la Grave, in the sky outside ── */
  a.vgrad(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, 46, L.sky);
  if (L.stars) for (let i = 0; i < 22; i++) a.p(WIN.x0 + 3 + ((i * 41) % (WIN.x1 - WIN.x0 - 6)), WIN.y0 + 2 + ((i * 17) % 26), i % 4 ? "#bcc2ba" : "#ebe9e1");
  const bankY = WIN.y0 + 46;
  for (let x = WIN.x0; x < WIN.x1; x++) {
    const hgt = 8 + ((x * 7) % 5) + (((x / 9) | 0) % 3) * 2;
    for (let y = bankY - hgt; y < bankY + 4; y++) a.p(x, y, bayer(x, y) < 0.3 ? L.bank[0] : L.bank[1]);
  }
  for (let i = 0; i < 26; i++) {
    const x = WIN.x0 + 3 + ((i * 37) % (WIN.x1 - WIN.x0 - 6));
    const y = bankY - 3 - ((i * 13) % 7);
    a.r(x, y, 1, 2, (i * 7) % 10 < L.windows * 10 ? "#f0c070" : shade(L.bank[0], -0.25));
  }
  const dx = 206;
  const dy = bankY - 16;
  for (let y = -9; y <= 0; y++)
    for (let x = -10; x <= 10; x++)
      if ((x * x) / 100 + (y * y) / 81 <= 1) a.p(dx + x, dy + y, x < -3 ? "#4f8f7c" : bayer(dx + x, dy + y) < 0.4 ? "#2f6b5c" : "#3f7f6d");
  a.r(dx - 11, dy, 22, 3, "#c79a7a");
  a.r(dx - 9, dy + 3, 18, 10, "#9a5e4c");
  a.r(dx - 1, dy - 14, 2, 5, "#d9c7b0");
  for (let k = -7; k <= 5; k += 4) a.r(dx + k, dy + 6, 2, 4, L.windows > 0.3 ? "#e0b060" : "#5a3329");
  a.vgrad(WIN.x0, bankY + 4, WIN.x1 - WIN.x0, WIN.y1 - bankY - 4, L.river);
  // the far lights on the water (or the sky's glint by day)
  for (let i = 0; i < 18; i++) {
    const x = WIN.x0 + 4 + ((i * 29) % (WIN.x1 - WIN.x0 - 8));
    for (let k = 0; k < 6; k++)
      if (bayer(x, bankY + 6 + k * 2) < (L.windows > 0.3 ? 0.6 : 0.25) - k * 0.08) a.r(x - (k % 2), bankY + 6 + k * 2, 2, 1, L.windows > 0.3 ? "#e0a86a" : shade(L.river[0][1], 0.25));
  }
  // rain on the glass
  if (s.rain)
    for (let i = 0; i < 40; i++) {
      const x = WIN.x0 + ((i * 53) % (WIN.x1 - WIN.x0));
      const y = WIN.y0 + ((i * 31) % (WIN.y1 - WIN.y0 - 4));
      a.p(x, y, "rgba(220,230,235,0.55)");
      a.p(x, y + 1, "rgba(220,230,235,0.35)");
      if (i % 3 === 0) a.p(x, y + 2, "rgba(220,230,235,0.2)");
    }
  // sash, mullions, sill
  const FR = "#d8cbb6";
  const FRD = "#a8987f";
  a.r(WIN.x0 - 4, WIN.y0 - 4, WIN.x1 - WIN.x0 + 8, 4, FR);
  a.r(WIN.x0 - 4, WIN.y1, WIN.x1 - WIN.x0 + 8, 3, FR);
  a.r(WIN.x0 - 4, WIN.y0, 4, WIN.y1 - WIN.y0, FR);
  a.r(WIN.x1, WIN.y0, 4, WIN.y1 - WIN.y0, FRD);
  a.r((WIN.x0 + WIN.x1) / 2 - 1, WIN.y0, 3, WIN.y1 - WIN.y0, FR);
  a.r(WIN.x0, WIN.y0 + 30, WIN.x1 - WIN.x0, 2, FR);
  a.r(WIN.x0 - 7, WIN.y1 + 3, WIN.x1 - WIN.x0 + 14, 3, "#c8b89f");
  a.r(WIN.x0 - 7, WIN.y1 + 6, WIN.x1 - WIN.x0 + 14, 1, "#7d6c58");
  for (let k = 0; k < 9; k++) {
    a.p(WIN.x0 + 6 + k, WIN.y0 + 4 + k, "rgba(255,255,255,0.3)");
    a.p(WIN.x0 + 50 + k, WIN.y0 + 4 + k, "rgba(255,255,255,0.2)");
  }
  // curtains
  for (const cx of [WIN.x0 - 12, WIN.x1 + 5])
    for (let y = WIN.y0 - 8; y < WIN.y1 + 14; y++)
      for (let x = 0; x < 9; x++) a.p(cx + x, y, (x + ((y / 6) | 0)) % 4 === 0 ? "#3f4f4a" : bayer(cx + x, y) < 0.3 ? "#4f6159" : "#5b6f66");
  a.r(WIN.x0 - 18, WIN.y0 - 9, WIN.x1 - WIN.x0 + 36, 2, "#2a2420");

  /* ── the shelf: a book per post, then the record sleeves ── */
  for (const y of [36, 62]) {
    a.r(SH.x0, y, SH.x1 - SH.x0, 2, WOOD_LT);
    a.r(SH.x0, y + 2, SH.x1 - SH.x0, 1, WOOD_DK);
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
  a.r(BD.x0, BD.y0, BD.x1 - BD.x0, BD.y1 - BD.y0, "#9c7650");
  a.dither(BD.x0, BD.y0, BD.x1 - BD.x0, BD.y1 - BD.y0, "#9c7650", "#8a6644", 0.4);
  a.r(BD.x0 - 2, BD.y0 - 2, BD.x1 - BD.x0 + 4, 2, WOOD_DK);
  a.r(BD.x0 - 2, BD.y1, BD.x1 - BD.x0 + 4, 2, WOOD_DK);
  a.r(BD.x0 - 2, BD.y0, 2, BD.y1 - BD.y0, WOOD_DK);
  a.r(BD.x1, BD.y0, 2, BD.y1 - BD.y0, WOOD_DK);
  const slots: [number, number][] = [[63, 72], [79, 73], [95, 72], [109, 73], [72, 85], [90, 85]];
  slots.slice(0, Math.max(0, Math.min(6, s.places))).forEach(([x, y], i) => {
    const [sky, land, deep] = CARDS[i];
    a.r(x + 1, y + 1, 14, 11, "rgba(0,0,0,0.25)");
    a.r(x, y, 14, 11, "#efe6d4");
    a.r(x + 1, y + 1, 12, 5, sky);
    a.r(x + 1, y + 6, 12, 4, land);
    a.r(x + 1 + (i % 3) * 3, y + 7, 4, 3, deep);
    a.r(x + 10, y + 1, 3, 3, "#f0334a");
    a.p(x + 7, y, "#e0c15c");
  });

  /* ── the desk under the window ── */
  a.r(DK.x0, DK.y, DK.x1 - DK.x0, 3, WOOD_LT);
  a.r(DK.x0, DK.y + 3, DK.x1 - DK.x0, 3, WOOD);
  a.r(DK.x0, DK.y + 6, DK.x1 - DK.x0, 1, WOOD_DK);
  a.r(DK.x0 + 3, DK.y + 7, 3, 30, WOOD_DK);
  a.r(DK.x1 - 6, DK.y + 7, 3, 30, WOOD_DK);
  a.r(DK.x0 + 70, DK.y + 7, 40, 14, WOOD);
  a.r(DK.x0 + 70, DK.y + 20, 40, 1, WOOD_DK);
  a.r(DK.x0 + 88, DK.y + 12, 4, 1, "#c8a070");
  // the lamp (lit at dusk and by night) and its pool on the desk
  a.r(LAMP.x - 5, DK.y - 2, 10, 2, "#2c3436");
  a.line(LAMP.x, DK.y - 2, LAMP.x - 4, DK.y - 16, "#2c3436");
  a.line(LAMP.x - 4, DK.y - 16, LAMP.x + 6, DK.y - 24, "#2c3436");
  a.poly([[LAMP.x + 2, DK.y - 27], [LAMP.x + 12, DK.y - 24], [LAMP.x + 10, DK.y - 19], [LAMP.x + 1, DK.y - 22]], L.lamp ? "#e0c15c" : "#8a8f86");
  if (L.lamp) for (let x = LAMP.x - 4; x < LAMP.x + 34; x++) a.p(x, DK.y, Math.abs(x - LAMP.x - 14) < 12 ? "#e6b47c" : "#c89a6a");
  // the laptop, the last push on its screen
  a.poly([[LP.x - 2, LP.y], [LP.x + 34, LP.y], [LP.x + 31, LP.y - 3], [LP.x + 1, LP.y - 3]], "#8a9690");
  a.r(LP.x + 3, LP.y - 21, 26, 18, "#2c3436");
  a.r(LP.x + 4, LP.y - 20, 24, 16, "#131516");
  ([["#819890", 8], ["#f8ebe3", 18], ["#e0c15c", 14], ["#a5b5ab", 19], ["#819890", 10]] as [string, number][]).forEach(([c, w], i) => a.r(LP.x + 6, LP.y - 18 + i * 3, w, 1, c));
  a.r(LP.x + 21, LP.y - 6, 2, 2, "#f4e276");
  // the letter tray, one envelope
  a.r(204, DK.y - 4, 20, 4, "#3a4849");
  a.r(206, DK.y - 6, 16, 3, "#efe6d4");
  a.poly([[206, DK.y - 6], [222, DK.y - 6], [214, DK.y - 3]], "#d9cdb6");
  a.r(219, DK.y - 6, 2, 2, "#f0334a");
  // a plant, a mug
  a.r(236, DK.y - 7, 9, 7, "#b0644a");
  a.r(235, DK.y - 8, 11, 2, "#c27a5c");
  for (const [x, y, c] of [[238, -14, "#5d7f45"], [241, -17, "#4f6b3e"], [244, -13, "#5d7f45"], [236, -11, "#3c5a33"], [242, -11, "#6f9a55"], [239, -20, "#5d7f45"]] as [number, number, string][])
    a.r(x, DK.y + y, 2, 5, c);
  a.r(150, DK.y - 6, 6, 6, "#d9e0d8");
  a.r(156, DK.y - 4, 2, 3, "#d9e0d8");
  a.r(151, DK.y - 6, 4, 1, "#5a3d2c");

  /* ── the turntable on its cabinet ── */
  a.r(CB.x0, CB.y0, CB.x1 - CB.x0, CB.y1 - CB.y0, WOOD);
  a.r(CB.x0, CB.y0, CB.x1 - CB.x0, 2, WOOD_LT);
  a.r(CB.x0 + 3, CB.y0 + 5, 33, 20, WOOD_DK);
  a.r(CB.x0 + 38, CB.y0 + 5, 33, 20, WOOD_DK);
  ["#2f4a6a", "#b0544a", "#e0c15c", "#4f6b3e", "#6a4a7a", "#c98a62", "#7fa6c9", "#a5b5ab", "#8f5648"].forEach((c, i) => a.r(CB.x0 + 5 + i * 3.4, CB.y0 + 8, 2, 16, c));
  a.r(CB.x0 + 2, CB.y1, 4, 3, WOOD_DK);
  a.r(CB.x1 - 6, CB.y1, 4, 3, WOOD_DK);
  a.r(TT.x, TT.y, 46, 9, "#d6cdbd");
  a.r(TT.x, TT.y, 46, 1, "#efe7d8");
  a.r(TT.x, TT.y + 8, 46, 1, "#9a907e");
  for (let y = -4; y <= 4; y++)
    for (let x = -17; x <= 17; x++) {
      const e = (x * x) / 289 + (y * y) / 16;
      if (e <= 1) a.p(TT.x + 19 + x, TT.y + 4 + y, e > 0.86 ? "#3a4446" : x > 3 && x < 12 && y < 0 ? "#4a5456" : Math.round(Math.sqrt(e) * 8) % 2 ? "#202526" : "#2a3032");
    }
  a.r(TT.x + 16, TT.y + 3, 6, 3, "#e0c15c");
  a.p(TT.x + 19, TT.y + 4, "#2c3436");
  a.r(TT.x + 40, TT.y + 1, 3, 3, "#8a9690");
  // the arm: on the record while one plays, on its rest when not
  if (s.playing) {
    a.line(TT.x + 41, TT.y + 2, TT.x + 30, TT.y + 6, "#c9d0cb");
    a.r(TT.x + 29, TT.y + 6, 2, 1, "#f8ebe3");
  } else {
    a.line(TT.x + 41, TT.y + 2, TT.x + 41, TT.y + 8, "#c9d0cb");
    a.r(TT.x + 41, TT.y + 8, 1, 1, "#f8ebe3");
  }
  a.r(TT.x + 3, TT.y + 6, 2, 1, s.playing ? "#9fd09a" : "#819890");
  // the sleeve against the cabinet (its art is laid over it by the page)
  a.r(SL.x + 1, SL.y + 1, 22, 22, "rgba(0,0,0,0.3)");
  a.vgrad(SL.x, SL.y, 22, 22, [[0, "#30306a"], [0.55, "#b0507a"], [1, "#f0a86a"]]);
  a.circle(SL.x + 11, SL.y + 12, 5, "#f6c46d");

  /* ── the clock: Toulouse time ── */
  const CK = { x: 136, y: 50 };
  a.circle(CK.x, CK.y, 8, "#d8cbb6");
  a.circle(CK.x, CK.y, 6, "#efe6d4");
  const ha = (((s.hour % 12) + s.minute / 60) / 12) * Math.PI * 2;
  const ma = (s.minute / 60) * Math.PI * 2;
  a.line(CK.x, CK.y, Math.round(CK.x + Math.sin(ha) * 3.5), Math.round(CK.y - Math.cos(ha) * 3.5), "#2c3436");
  a.line(CK.x, CK.y, Math.round(CK.x + Math.sin(ma) * 5), Math.round(CK.y - Math.cos(ma) * 5), "#2c3436");
  a.p(CK.x, CK.y, "#f0334a");

  return spots;
}

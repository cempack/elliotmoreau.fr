import type { Box, Face, Model, Paint, Ramp, Vec3 } from "./models";

/**
 * The machine's renderer: a handful of boxes ray-cast into 3px cells, the
 * way the Atlas globe paints its planet (same inks, same 4×4 Bayer dither,
 * a dotted rim and a halo), on the CPU, into one Uint32 view of an
 * ImageData. The camera is orthographic and looks down a little; the
 * model turns on a turntable that carries the globe's grid. One sun,
 * upper left, with shadows: a second ray from every lit point.
 *
 * The screen is unlit: it samples the project's picture, with scanlines,
 * a soft edge, a band of brightness rolling down it, and a power-on (static,
 * then the picture opening out of a bright line) when it changes.
 */

export type Tex = { w: number; h: number; px: Uint32Array };

export type View = {
  model: Model;
  yaw: number;
  tilt: number;
  /** object units per cell */
  unit: number;
  /** where the model's center lands, in cells */
  cx: number;
  cy: number;
  /** what the camera looks at (the model's center, or the screen when looking closer) */
  look: Vec3;
  t: number;
  screen: Tex | null;
  marquee: Tex | null;
  /** seconds since the screen last changed (Infinity: settled); with no picture yet, static */
  since: number;
};

const pack = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const scale = (c: number, k: number) =>
  pack(Math.min(255, (c & 255) * k) | 0, Math.min(255, ((c >>> 8) & 255) * k) | 0, Math.min(255, ((c >>> 16) & 255) * k) | 0);

/* the Atlas inks (atlas/planet.ts), and a light-to-dark ramp per material */
const INK = {
  ocean: pack(15, 20, 55),
  oceanDeep: pack(10, 13, 38),
  oceanNight: pack(5, 6, 17),
  oceanNight2: pack(8, 9, 24),
  grid: pack(24, 31, 78),
  gridNight: pack(11, 13, 33),
  halo: pack(30, 33, 62),
  orbit: pack(74, 77, 86),
  off: pack(4, 5, 14),
  lightHot: pack(245, 242, 236),
};
const RAMPS: Record<Ramp, number[]> = {
  body: [[8, 10, 30], [18, 22, 58], [40, 46, 108], [70, 78, 168], [118, 116, 220], [170, 164, 240]].map(([r, g, b]) => pack(r, g, b)),
  dark: [[4, 5, 14], [8, 10, 28], [16, 20, 50], [28, 34, 80]].map(([r, g, b]) => pack(r, g, b)),
  key: [[18, 22, 58], [40, 46, 108], [86, 93, 192], [150, 146, 236]].map(([r, g, b]) => pack(r, g, b)),
  ember: [[70, 30, 26], [140, 66, 40], [210, 120, 66], [255, 184, 107]].map(([r, g, b]) => pack(r, g, b)),
  flare: [[80, 18, 28], [170, 40, 60], [240, 51, 74]].map(([r, g, b]) => pack(r, g, b)),
};

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
/** an 8×8 threshold map, for the dissolve between two machines */
const B8 = (() => {
  const m = new Float32Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) m[y * 8 + x] = (B4[((y & 3) << 2) | (x & 3)] * 4 + [0, 2, 3, 1][((y >> 2) << 1) | (x >> 2)] + 0.5) / 64;
  return m;
})();
export const bayer8 = (x: number, y: number) => B8[((y & 7) << 3) | (x & 7)];

function hash(a: number, b: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* rotations: object → world is rotX(rotY(p, yaw), tilt); the camera undoes it */
function inv(v: Vec3, yaw: number, tilt: number): Vec3 {
  const ct = Math.cos(-tilt), st = Math.sin(-tilt);
  const y1 = v[1] * ct - v[2] * st, z1 = v[1] * st + v[2] * ct;
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
  return [v[0] * cy + z1 * sy, y1, -v[0] * sy + z1 * cy];
}
/** where an object-space point lands, in cells from the view's (cx, cy) */
export function project(p: Vec3, v: Pick<View, "yaw" | "tilt" | "unit" | "look">): [number, number] {
  const q: Vec3 = [p[0] - v.look[0], p[1] - v.look[1], p[2] - v.look[2]];
  const cyw = Math.cos(v.yaw), syw = Math.sin(v.yaw);
  const x1 = q[0] * cyw + q[2] * syw, z1 = -q[0] * syw + q[2] * cyw;
  const ct = Math.cos(v.tilt), st = Math.sin(v.tilt);
  const y2 = q[1] * ct - z1 * st;
  return [x1 / v.unit, -y2 / v.unit];
}

/** the bounding sphere around `look`, so most rays skip the boxes entirely */
function bounds(model: Model, look: Vec3) {
  let r2 = 0;
  for (const b of model.boxes)
    for (let i = 0; i < 8; i++) {
      const x = (i & 1 ? b.b[0] : b.a[0]) - look[0], y = (i & 2 ? b.b[1] : b.a[1]) - look[1], z = (i & 4 ? b.b[2] : b.a[2]) - look[2];
      r2 = Math.max(r2, x * x + y * y + z * z);
    }
  return r2;
}

/**
 * One ray against the boxes; the nearest hit lands in HIT. `any` stops at
 * the first hit (shadows). `rects` (the boxes' outlines on screen, four
 * numbers each) lets a camera ray at cell (sx, sy) skip the boxes it
 * can't be over.
 */
const HIT = { t: 0, box: -1, axis: 0, sign: 0 };
function cast(boxes: Box[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number, any = false, rects?: Float32Array, sx = 0, sy = 0) {
  HIT.box = -1;
  HIT.t = tMax;
  for (let n = 0; n < boxes.length; n++) {
    if (rects && (sx < rects[n * 4] || sx > rects[n * 4 + 1] || sy < rects[n * 4 + 2] || sy > rects[n * 4 + 3])) continue;
    const { a, b } = boxes[n];
    let t0 = -1e9, t1 = 1e9, ax = 0, sg = 0;
    // x
    if (dx !== 0) {
      let ta = (a[0] - ox) / dx, tb = (b[0] - ox) / dx, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; ax = 0; sg = s; }
      if (tb < t1) t1 = tb;
    } else if (ox < a[0] || ox > b[0]) continue;
    // y
    if (dy !== 0) {
      let ta = (a[1] - oy) / dy, tb = (b[1] - oy) / dy, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; ax = 1; sg = s; }
      if (tb < t1) t1 = tb;
    } else if (oy < a[1] || oy > b[1]) continue;
    // z
    if (dz !== 0) {
      let ta = (a[2] - oz) / dz, tb = (b[2] - oz) / dz, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; ax = 2; sg = s; }
      if (tb < t1) t1 = tb;
    } else if (oz < a[2] || oz > b[2]) continue;
    if (t0 <= t1 && t0 > 1e-4 && t0 < HIT.t) {
      HIT.t = t0; HIT.box = n; HIT.axis = ax; HIT.sign = sg;
      if (any) return true;
    }
  }
  return HIT.box >= 0;
}

const FACES: Face[][] = [["nx", "px"], ["ny", "py"], ["nz", "pz"]];
/** u (left to right as you face it) and v (top to bottom; back to front on top) on a box's face, into UV */
const UV = { u: 0, v: 0 };
function faceUV(box: Box, axis: number, sign: number, x: number, y: number, z: number) {
  const fx = (x - box.a[0]) / (box.b[0] - box.a[0]), fy = (y - box.a[1]) / (box.b[1] - box.a[1]), fz = (z - box.a[2]) / (box.b[2] - box.a[2]);
  if (axis === 2) { UV.u = sign > 0 ? fx : 1 - fx; UV.v = 1 - fy; }
  else if (axis === 1) { UV.u = fx; UV.v = fz; }
  else { UV.u = sign > 0 ? 1 - fz : fz; UV.v = 1 - fy; }
}

/** what's under one cell, for the pointer: the screen, the machine, or nothing */
export function pick(view: View, w: number, h: number, x: number, y: number): "screen" | "machine" | null {
  const { model, yaw, tilt, unit, look } = view;
  const d = inv([0, 0, -1], yaw, tilt), U = inv([unit, 0, 0], yaw, tilt), V = inv([0, unit, 0], yaw, tilt), O = inv([0, 0, 40], yaw, tilt);
  const sx = x - view.cx, sy = view.cy - y;
  const ox = look[0] + O[0] + U[0] * sx + V[0] * sy, oy = look[1] + O[1] + U[1] * sx + V[1] * sy, oz = look[2] + O[2] + U[2] * sx + V[2] * sy;
  if (!cast(model.boxes, ox, oy, oz, d[0], d[1], d[2], 1e9)) return null;
  const s = model.screen;
  const px = ox + d[0] * HIT.t, py = oy + d[1] * HIT.t, pz = oz + d[2] * HIT.t;
  if (HIT.axis === 2 && HIT.sign > 0 && Math.abs(pz - s.z) < 1e-3 && px > s.x0 && px < s.x1 && py > s.y0 && py < s.y1) return "screen";
  return "machine";
}

/**
 * Paint one frame into `out` (w×h cells). Cells with nothing on them are
 * left transparent, so the window's own background shows through.
 */
export function paint(out: Uint32Array, w: number, h: number, view: View) {
  const { model, yaw, tilt, unit, look, t } = view;
  const boxes = model.boxes, scr = model.screen;
  const d = inv([0, 0, -1], yaw, tilt), U = inv([unit, 0, 0], yaw, tilt), V = inv([0, unit, 0], yaw, tilt), O = inv([0, 0, 40], yaw, tilt);
  const L = inv([-0.52, 0.66, 0.54].map((c) => c / Math.hypot(-0.52, 0.66, 0.54)) as Vec3, yaw, tilt);
  const R2 = bounds(model, look);
  const turn2 = model.turn * model.turn;
  // halo: around the turntable's centre as it lands on screen
  const [hx, hy] = project([0, model.floorY + 0.9, 0], view);
  const hr = (model.turn * 1.25) / unit;
  // the screen's effects this frame
  const band = ((t * 0.11) % 1.4) - 0.2;
  const since = view.since;
  const sw = scr.x1 - scr.x0, sh = scr.y1 - scr.y0;
  const tex = view.screen, mq = view.marquee;
  const chase = Math.floor(t * 6);
  // each box's outline on screen, a cell wider all round
  const rects = new Float32Array(boxes.length * 4);
  boxes.forEach((b, n) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const [px, py] = project([i & 1 ? b.b[0] : b.a[0], i & 2 ? b.b[1] : b.a[1], i & 4 ? b.b[2] : b.a[2]], view);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    rects.set([x0 - 1, x1 + 1, y0 - 1, y1 + 1], n * 4);
  });
  /** a ray from p towards the sun meets a box (most miss the bounding sphere and skip the boxes) */
  const shadowed = (px: number, py: number, pz: number) => {
    const qx = px - look[0], qy = py - look[1], qz = pz - look[2];
    const q2 = qx * qx + qy * qy + qz * qz, along = qx * L[0] + qy * L[1] + qz * L[2];
    if ((along > 0 && q2 > R2) || q2 - along * along > R2) return false;
    return cast(boxes, px, py, pz, L[0], L[1], L[2], 50, true);
  };

  for (let y = 0; y < h; y++) {
    const sy = view.cy - (y + 0.5);
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const sx = x + 0.5 - view.cx;
      const ox = look[0] + O[0] + U[0] * sx + V[0] * sy;
      const oy = look[1] + O[1] + U[1] * sx + V[1] * sy;
      const oz = look[2] + O[2] + U[2] * sx + V[2] * sy;
      const bx = bayer(x, y);
      // the turntable, under everything
      let tf = Infinity;
      if (d[1] < 0) {
        const tt = (model.floorY - oy) / d[1];
        if (tt > 0) tf = tt;
      }
      // the boxes, when the ray comes near them at all
      const qx = ox - look[0], qy = oy - look[1], qz = oz - look[2];
      const along = qx * d[0] + qy * d[1] + qz * d[2];
      const near = qx * qx + qy * qy + qz * qz - along * along <= R2;
      if (near && cast(boxes, ox, oy, oz, d[0], d[1], d[2], tf, false, rects, sx, -sy)) {
        const box = boxes[HIT.box], axis = HIT.axis, sign = HIT.sign;
        const px = ox + d[0] * HIT.t, py = oy + d[1] * HIT.t, pz = oz + d[2] * HIT.t;
        // the screen
        if (axis === 2 && sign > 0 && Math.abs(pz - scr.z) < 1e-4 && px > scr.x0 && px < scr.x1 && py > scr.y0 && py < scr.y1) {
          const u = (px - scr.x0) / sw, v = (scr.y1 - py) / sh;
          let c: number;
          if (!tex || since < 0.14) c = hash(k, Math.floor(t * 30)) < 0.5 ? INK.grid : INK.off;
          else if (since < 0.42 && Math.abs(v - 0.5) > ((since - 0.14) / 0.28) * 0.5 + 0.006) c = INK.off;
          else if (since < 0.42 && Math.abs(v - 0.5) < 0.012) c = INK.lightHot;
          else {
            c = tex.px[Math.min(tex.h - 1, (v * tex.h) | 0) * tex.w + Math.min(tex.w - 1, (u * tex.w) | 0)];
            let kk = y & 1 ? 0.86 : 1;
            const edge = Math.min(u, 1 - u, v * 1.4, (1 - v) * 1.4);
            if (edge < 0.05 && bx > edge / 0.05) kk *= 0.55;
            if (Math.abs(v - band) < 0.04) kk *= 1.12;
            if (u + v < 0.22 && bx < 0.1) kk *= 1.35;
            // the bezel's shadow in the recess
            if (shadowed(px, py, pz + 1e-3)) kk *= 0.8;
            if (kk !== 1) c = scale(c, kk);
          }
          out[k] = c;
          continue;
        }
        const n0 = axis === 0 ? sign : 0, n1 = axis === 1 ? sign : 0, n2 = axis === 2 ? sign : 0;
        const fn = box.faces?.[FACES[axis][sign > 0 ? 1 : 0]];
        let paint: Paint | null = null;
        if (fn) {
          faceUV(box, axis, sign, px, py, pz);
          paint = fn(UV.u, UV.v);
        }
        if (paint === "marquee") {
          if (mq) {
            const mu = (UV.u - 0.04) / 0.92, mv = (UV.v - 0.14) / 0.72;
            const tx = Math.min(mq.w - 1, Math.max(0, (mu * mq.w) | 0)), ty = Math.min(mq.h - 1, Math.max(0, (mv * mq.h) | 0));
            let c = mq.px[ty * mq.w + tx];
            // chase lights along the top and bottom rows
            if ((ty === 0 || ty === mq.h - 1) && (tx + chase) % 4 < 2) c = RAMPS.ember[3];
            out[k] = c;
          } else out[k] = RAMPS.ember[1];
          continue;
        }
        if (paint && typeof paint === "object") {
          out[k] = paint.emit;
          continue;
        }
        const ramp = RAMPS[paint ?? box.ramp];
        const lam = Math.max(0, n0 * L[0] + n1 * L[1] + n2 * L[2]);
        const lit = lam > 0 && !shadowed(px + n0 * 1e-3, py + n1 * 1e-3, pz + n2 * 1e-3);
        const level = 0.16 + 0.84 * lam * (lit ? 1 : 0.4);
        out[k] = ramp[Math.min(ramp.length - 1, Math.floor(level * (ramp.length - 1) + bx))];
        continue;
      }
      if (tf < Infinity) {
        const fx = ox + d[0] * tf, fz = oz + d[2] * tf, fr2 = fx * fx + fz * fz;
        if (fr2 < turn2) {
          const fr = Math.sqrt(fr2);
          const ang = Math.atan2(fz, fx);
          if (fr > model.turn - 0.06) {
            out[k] = Math.floor((ang + Math.PI) * 26) % 2 ? INK.orbit : 0;
            continue;
          }
          const shadow = shadowed(fx, model.floorY + 1e-3, fz);
          const deg = ((ang * 180) / Math.PI + 360) % 30;
          const line = (fr / 0.42) % 1 < 0.1 || deg < 1.5 / Math.max(fr, 0.3);
          let c = line ? INK.grid : INK.ocean;
          if (shadow) c = line ? INK.gridNight : bx < 0.5 ? INK.oceanNight : INK.oceanNight2;
          else if (fr > model.turn * 0.72 && bx < (fr / model.turn - 0.72) * 3) c = INK.oceanDeep;
          out[k] = c;
          continue;
        }
      }
      // the halo, as around the Atlas globe
      const gx = x + 0.5 - view.cx - hx, gy = y + 0.5 - view.cy - hy, g2 = (gx * gx + gy * gy) / (hr * hr);
      out[k] = g2 < 1 && (1 - Math.sqrt(g2)) * 0.32 > bx ? INK.halo : 0;
    }
  }
}

/* ───────────────────────── textures ───────────────────────── */

/**
 * A picture for the screen at `w`×`h` cells: drawn to cover (centred, like
 * object-fit), halved step by step so a big screenshot keeps its detail on
 * the way down, then quantised with the Bayer map: 12 levels a channel for a
 * colour screen (its whites held down a little, as a tube's are), the four greens of a phosphor terminal, or a handheld's
 * four yellows.
 */
export function screenTexture(src: CanvasImageSource & { width: number; height: number }, w: number, h: number, tint?: "phosphor" | "pocket"): Tex | null {
  if (!src.width || !src.height) return null;
  let cur: CanvasImageSource = src;
  let cw = src.width, ch = src.height;
  // crop to 16:10 first
  const want = w / h;
  let sx = 0, sy = 0, sw = cw, sh = ch;
  if (cw / ch > want) { sw = ch * want; sx = (cw - sw) / 2; } else { sh = cw / want; sy = (ch - sh) / 2; }
  const step = document.createElement("canvas");
  step.width = Math.max(w, Math.round(sw));
  step.height = Math.max(h, Math.round(sh));
  let ctx = step.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(cur, sx, sy, sw, sh, 0, 0, step.width, step.height);
  cur = step; cw = step.width; ch = step.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    const half = document.createElement("canvas");
    half.width = Math.round(cw / 2); half.height = Math.round(ch / 2);
    const hc = half.getContext("2d");
    if (!hc) break;
    hc.imageSmoothingQuality = "high";
    hc.drawImage(cur, 0, 0, half.width, half.height);
    cur = half; cw = half.width; ch = half.height;
  }
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, w, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // a picture from elsewhere that the browser won't let us read
  }
  const d = data.data, px = new Uint32Array(w * h);
  const PHOSPHOR = [pack(6, 12, 6), pack(36, 70, 24), pack(110, 170, 52), pack(198, 255, 94)];
  const POCKET = [pack(24, 18, 6), pack(96, 70, 20), pack(200, 150, 60), pack(255, 226, 140)];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, b = bayer(x, y) - 0.5;
      if (tint) {
        const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
        const ramp = tint === "phosphor" ? PHOSPHOR : POCKET;
        px[y * w + x] = ramp[Math.max(0, Math.min(3, Math.round(l * 3 + b * 0.9)))];
        continue;
      }
      // a tube never quite reaches white: the highlights are held down and lean to the inks' indigo
      const q = (c: number, ink: number) => {
        const v = (c * 0.84 + ink * 0.1) / 255;
        return Math.max(0, Math.min(255, Math.round(v * 11 + b * 0.7) * (255 / 11)));
      };
      px[y * w + x] = pack(q(d[i], 40), q(d[i + 1], 46), q(d[i + 2], 108));
    }
  return { w, h, px };
}

/**
 * The marquee: the project's name in the site's 3×5 pixel letters, lit
 * ember on a dark red ground, at `w`×`h` cells. A name too long to fit keeps
 * its longest word; failing that, just the lights.
 */
export function marqueeTexture(name: string, w: number, h: number, glyphs: Record<string, string[]>, fold: Record<string, string>): Tex {
  const px = new Uint32Array(w * h).fill(pack(50, 22, 20));
  const width = (s: string) => [...s].reduce((n, ch) => n + (ch === " " ? 3 : 4), -1);
  const upper = [...name.toUpperCase()].map((ch) => fold[ch] ?? ch).join("").replace(/[^A-Z0-9 .'/:-]/g, " ").replace(/\s+/g, " ").trim();
  let text = upper;
  if (width(text) > w - 2) text = upper.split(" ").sort((a, b) => b.length - a.length)[0] ?? "";
  if (width(text) > w - 2 || h < 7) return { w, h, px };
  let x = Math.floor((w - width(text)) / 2);
  const y = Math.floor((h - 5) / 2);
  const hot = pack(255, 184, 107), white = pack(245, 242, 236);
  for (const ch of text) {
    if (ch === " ") { x += 3; continue; }
    const g = glyphs[ch];
    if (g) g.forEach((row, gy) => [...row].forEach((bit, gx) => { if (bit === "1") px[(y + gy) * w + x + gx] = gy === 0 ? white : hot; }));
    x += 4;
  }
  return { w, h, px };
}

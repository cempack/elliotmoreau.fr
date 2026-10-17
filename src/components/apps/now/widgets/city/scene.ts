import type { SiteCity } from "@/lib/github";
import { sunAt } from "@/lib/sun";
import {
  P,
  box,
  clamp,
  clearDepth,
  draw,
  halo,
  hash2,
  inShadow,
  lit,
  makeCam,
  makeShadow,
  norm,
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

/**
 * emOS at night: this site's source as a city on a turntable. Every file
 * is a building, in districts by folder (a plinth per top-level folder);
 * its height is its size, its colour its kind (.tsx, .ts, .css). Windows
 * are lit by how recently a file changed, so the parts being worked on
 * glow after dark. The sky is Toulouse's: the sun
 * where it really is by day, lamps and a low moon by night.
 */

export type Building = {
  path: string;
  bytes: number;
  changed: number;
  ext: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y0: number;
  y1: number;
  cx: number;
  cz: number;
};

type Dir = { name: string; path: string; depth: number; w: number; kids: Node[] };
type Leaf = { file: true; path: string; bytes: number; changed: number; ext: string; w: number; dir: Dir };
type Node = Dir | Leaf;
const isLeaf = (n: Node): n is Leaf => "file" in n;

const PAD = [0.07, 0.042, 0.026, 0.016, 0.011, 0.008];
const PLINTH = 0.022;
export const TURN_R = 1.46;
const PITCH = 0.64;

/** squarified treemap: kids laid out in rows whose cells stay close to square */
function squarify(kids: Node[], x: number, y: number, w: number, h: number, place: (n: Node, x: number, y: number, w: number, h: number) => void) {
  const total = kids.reduce((s, k) => s + k.w, 0);
  if (!total || w <= 0 || h <= 0) return;
  const sc = (w * h) / total;
  const items = kids.map((k) => ({ k, a: k.w * sc })).sort((p, q) => q.a - p.a);
  let row: typeof items = [];
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;
  const worst = (r: typeof items, side: number) => {
    let s = 0;
    let mx = 0;
    let mn = Infinity;
    for (const it of r) {
      s += it.a;
      if (it.a > mx) mx = it.a;
      if (it.a < mn) mn = it.a;
    }
    const s2 = s * s;
    const d2 = side * side;
    return Math.max((d2 * mx) / s2, s2 / (d2 * mn));
  };
  const flush = () => {
    const s = row.reduce((t, it) => t + it.a, 0);
    if (rw >= rh) {
      const cw = s / rh;
      let yy = ry;
      for (const it of row) {
        const hh = it.a / cw;
        place(it.k, rx, yy, cw, hh);
        yy += hh;
      }
      rx += cw;
      rw -= cw;
    } else {
      const ch = s / rw;
      let xx = rx;
      for (const it of row) {
        const ww = it.a / ch;
        place(it.k, xx, ry, ww, ch);
        xx += ww;
      }
      ry += ch;
      rh -= ch;
    }
    row = [];
  };
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const side = Math.min(rw, rh);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) {
      row.push(it);
      i++;
    } else flush();
  }
  if (row.length) flush();
}

/** the city's buildings and plinths, from the file list */
function layoutCity(data: SiteCity) {
  const root: Dir = { name: "src", path: "", depth: 0, w: 0, kids: [] };
  for (const [path, bytes, changed] of data.files) {
    const parts = path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let kid = node.kids.find((k): k is Dir => !isLeaf(k) && k.name === parts[i]);
      if (!kid) {
        kid = { name: parts[i], path: node.path ? `${node.path}/${parts[i]}` : parts[i], depth: node.depth + 1, w: 0, kids: [] };
        node.kids.push(kid);
      }
      node = kid;
    }
    // area by the square root of the size, so a big file is a tower, not a whole district
    node.kids.push({ file: true, path, bytes, changed, ext: path.slice(path.lastIndexOf(".") + 1), w: Math.sqrt(bytes / 35) + 2.5, dir: node });
  }
  const sumW = (n: Node): number => (isLeaf(n) ? n.w : (n.w = n.kids.reduce((s, k) => s + sumW(k), 0)));
  sumW(root);

  const maxBytes = Math.max(1, ...data.files.map((f) => f[1]));
  const B: Building[] = [];
  const plinths: [number, number, number, number][] = [];
  const place = (node: Node, x: number, y: number, w: number, h: number) => {
    if (isLeaf(node)) {
      const g = Math.min(0.0062, w * 0.2, h * 0.2);
      const x0 = x + g;
      const z0 = y + g;
      const x1 = x + w - g;
      const z1 = y + h - g;
      if (x1 <= x0 || z1 <= z0) return;
      const base = node.dir.depth >= 1 ? PLINTH : 0;
      B.push({
        path: node.path,
        bytes: node.bytes,
        changed: node.changed,
        ext: node.ext,
        x0,
        z0,
        x1,
        z1,
        y0: base,
        y1: base + 0.028 + 0.6 * Math.pow(node.bytes / maxBytes, 0.75),
        cx: (x0 + x1) / 2,
        cz: (z0 + z1) / 2,
      });
      return;
    }
    const p = Math.min(PAD[Math.min(node.depth, PAD.length - 1)] * 0.5, w * 0.15, h * 0.15);
    const nx = x + p;
    const ny = y + p;
    const nw = w - 2 * p;
    const nh = h - 2 * p;
    if (node.depth === 1) plinths.push([nx, ny, nx + nw, ny + nh]);
    squarify(node.kids, nx, ny, nw, nh, place);
  };
  place(root, -1, -1, 2, 2);
  return { B, plinths };
}

/* the inks: buildings by kind, by day and (dimmer) by night; the hovered one in ion */
const DAY: Record<string, number[]> = {
  tsx: ramp([[30, 33, 80], [58, 63, 140], [86, 93, 192], [136, 129, 234]]),
  ts: ramp([[20, 28, 74], [38, 52, 138], [62, 82, 180], [104, 124, 222]]),
  css: ramp([[72, 68, 132], [124, 118, 208], [178, 172, 234], [216, 212, 247]]),
};
const NIGHT: Record<string, number[]> = {
  tsx: ramp([[16, 17, 44], [30, 32, 76], [46, 49, 108]]),
  ts: ramp([[13, 17, 46], [26, 33, 78], [38, 50, 108]]),
  css: ramp([[30, 28, 62], [48, 46, 96], [68, 64, 128]]),
};
const ION = ramp([[16, 44, 64], [44, 112, 140], [96, 190, 220], [139, 233, 255]]);
const PL_DAY = ramp([[15, 20, 55], [25, 33, 84], [34, 44, 104]]);
const PL_NIGHT = ramp([[5, 6, 17], [8, 9, 24], [13, 15, 36]]);

export type CityStage = { cx: number; cy: number; w: number; h: number };

export function makeCity(reduced: boolean) {
  let B: Building[] = [];
  let faces: Face[] = [];
  let lights: { lit: number; hot: number }[] = [];
  const floor: Face[] = [];
  turntable(floor, TURN_R, 0, "floor");

  const st = {
    night: true,
    L: norm([-0.55, 0.62, 0.42]),
    S: null as Shadow | null,
    skyAt: -Infinity,
    yaw: 0.72,
    vYaw: 0,
    dragging: false,
    lastInput: -1e9,
    hover: -1,
    cam: null as Cam | null,
    stage: null as CityStage | null,
    born: -1,
  };

  /** the sky over Toulouse now: the sun's real direction by day; by night a low moon */
  function sky(force = false) {
    const now = Date.now();
    if (!force && now - st.skyAt < 5 * 60_000) return;
    st.skyAt = now;
    const sun = sunAt(now);
    st.night = sun.elevation < -4;
    if (st.night) st.L = norm([-0.55, 0.62, 0.42]);
    else {
      const el = (Math.max(sun.elevation, 14) * Math.PI) / 180;
      const az = (sun.azimuth * Math.PI) / 180;
      st.L = norm([Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]);
    }
    // how lit each building's windows are: most of them when it changed in the last hours
    lights = B.map((b) => {
      const h = b.changed ? (now - b.changed) / 3_600_000 : Infinity;
      return { lit: 0.04 + 0.78 * Math.exp(-h / 14), hot: h < 2 ? 0.35 : h < 8 ? 0.15 : 0.03 };
    });
    st.S = makeShadow(360, st.L, 1.75, [0, 0.2, 0]);
    renderShadow(st.S, faces);
  }

  function setData(data: SiteCity) {
    const city = layoutCity(data);
    B = city.B;
    faces = [...floor];
    for (const [x0, z0, x1, z1] of city.plinths) box(faces, [x0, 0, z0], [x1, PLINTH, z1], "plinth");
    B.forEach((b, i) => box(faces, [b.x0, b.y0, b.z0], [b.x1, b.y1, b.z1], "bldg", { b: i }));
    st.born = -1;
    sky(true);
  }

  function shade(f: Face, u: number, v: number, wx: number, wy: number, wz: number, x: number, y: number) {
    const { night, L, S } = st;
    const cam = st.cam as Cam;
    if (f.mat === "floor") return turntableInk(wx, wz, TURN_R, x, y, cam.scale, inShadow(S, wx, wy, wz, 0.012), night);
    if (f.mat === "plinth") return lit(night ? PL_NIGHT : PL_DAY, f, L, S, wx, wy, wz, x, y, 0.3, 0.6, 0.012);
    const b = B[f.b];
    const hov = st.hover === f.b;
    const kind = DAY[b.ext] ? b.ext : "ts";
    if (f.side === "top") {
      if (hov) return lit(ION, f, L, S, wx, wy, wz, x, y, 0.5, 0.5);
      return lit(night ? NIGHT[kind] : DAY[kind], f, L, S, wx, wy, wz, x, y, night ? 0.45 : 0.3, night ? 0.5 : 0.7, 0.015);
    }
    // windows: a grid that keeps its size whatever the wall's, a cell each, none on the ground floor
    const G = 0.026;
    const lu = (u * f.fw) / G;
    const lv = (v * f.fh) / G;
    const ci = Math.floor(lu);
    const ri = Math.floor(lv);
    if (ri >= 1 && f.fw > G * 1.4 && lu - ci < 0.5 && lv - ri < 0.5 && lv < f.fh / G - 0.6) {
      if (hov) return P.iceHi;
      const h = hash2(f.b * 977 + f.k * 131 + ci, ri * 7919 + 3);
      const l = lights[f.b];
      if (night) return h < l.lit ? (hash2(f.b + ci * 3, ri + f.k * 17) < l.hot ? P.lightHot : P.light) : P.oceanNight2;
      return h < 0.22 ? P.oceanLit : P.ocean;
    }
    return lit(hov ? ION : night ? NIGHT[kind] : DAY[kind], f, L, S, wx, wy, wz, x, y, night ? 0.22 : 0.16, night ? 0.6 : 0.84, 0.015);
  }

  /** a frame; then how long until the picture changes again (seconds) */
  function frame(R: Raster, t: number, dt: number) {
    sky();
    const W = R.w;
    const H = R.h;
    if (!st.dragging) {
      if (st.vYaw) {
        st.yaw += st.vYaw * dt;
        st.vYaw *= Math.exp(-dt * 2.4);
        if (Math.abs(st.vYaw) < 0.03) st.vYaw = 0;
      }
      if (!reduced && t - st.lastInput > 1.5) st.yaw += dt * 0.06;
    }
    const s = st.stage ?? { cx: W / 2, cy: H / 2, w: W, h: H };
    const scale = Math.min((s.w * 0.96) / (2 * TURN_R), (s.h * 1.05) / (2 * TURN_R * Math.sin(PITCH) + 0.5 * Math.cos(PITCH)));
    const cam = makeCam(st.yaw, PITCH, scale, s.cx, s.cy + scale * 0.12, [0, 0.16, 0]);
    st.cam = cam;
    halo(R, s.cx, s.cy + scale * 0.12, scale * TURN_R * 1.25);
    clearDepth(R);
    // the city rises out of the turntable when it arrives
    if (B.length && st.born < 0) st.born = t;
    const rise = reduced || !B.length ? 1 : clamp((t - st.born) / 0.9, 0, 1);
    if (rise < 1) {
      const k = 1 - Math.pow(1 - rise, 3);
      const grown = faces.map((f) =>
        f.mat === "bldg" ? { ...f, p: f.p.map((p): V3 => [p[0], B[f.b].y0 + (p[1] - B[f.b].y0) * k, p[2]]) } : f
      );
      draw(R, grown, cam, shade);
    } else draw(R, faces.length ? faces : floor, cam, shade);

    // turning on its own, the picture only changes once the rim has moved most of a cell: wake for that
    if (st.dragging || st.vYaw || rise < 1) return 0;
    if (reduced) return 60;
    const hold = 1.5 - (t - st.lastInput);
    return hold > 0 ? hold : 0.7 / (scale * TURN_R * 0.06);
  }

  return {
    setData,
    frame,
    /** where the city should stand in the raster, in cells */
    setStage(s: CityStage) {
      st.stage = s;
    },
    /** the building under a cell, or -1 */
    pick(R: Raster, x: number, y: number) {
      if (x < 0 || y < 0 || x >= R.w || y >= R.h) return -1;
      return R.id[y * R.w + x];
    },
    building: (i: number) => B[i] ?? null,
    get count() {
      return B.length;
    },
    get hover() {
      return st.hover;
    },
    set hover(i: number) {
      st.hover = i;
    },
    /** drag to turn: px of horizontal travel, and the time it took */
    turn(dx: number, ms: number, t: number) {
      const k = 0.006;
      st.yaw += dx * k;
      st.vYaw = (dx * k) / (Math.max(1, ms) / 1000);
      st.lastInput = t;
    },
    grab(t: number) {
      st.dragging = true;
      st.vYaw = 0;
      st.lastInput = t;
    },
    /** let go; returns the spin it keeps (rad/s) */
    release(t: number, still: boolean) {
      if (still) st.vYaw = 0;
      st.dragging = false;
      st.lastInput = t;
      return st.vYaw;
    },
  };
}

export type City = ReturnType<typeof makeCity>;

import {
  P,
  b4,
  clamp,
  clearDepth,
  draw,
  face,
  halo,
  hash2,
  inShadow,
  makeCam,
  makeShadow,
  norm,
  pack,
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
 * The country, lifted out: a place's land as a block standing on the
 * globe's turntable. The outline and the heights are real (the relief
 * route bakes them); heights are stretched so the highest ground stands
 * about a fifteenth of the block's width, and the sides are cut like a
 * geology model, in strata. It is lit by the sun where the place is: by
 * day a hillshade with real shadows and snow on the high ground; by night
 * the globe's dark land and its city lights, under a low moon. A place on
 * the wish list is a contour map in ion until it's been visited.
 *
 * It paints when something changes (the place, the sun, a drag) and
 * otherwise not at all.
 */

export type ReliefData = {
  W: number;
  H: number;
  max: number;
  b: [number, number, number, number];
  km: number;
  d: string;
};

export type ReliefPlace = { lat: number; lon: number; status: "been" | "want"; home: boolean };

const BASE = 2.4;
const PITCH = 0.52;
/** the highest ground's height, as a share of the block's longest side */
const PEAK = 0.068;

const LAND = ramp([
  [34, 37, 84],
  [58, 63, 140],
  [70, 76, 165],
  [86, 93, 192],
  [110, 112, 214],
  [136, 129, 234],
]);
const SNOW = ramp([
  [120, 116, 196],
  [178, 172, 234],
  [216, 212, 247],
  [245, 242, 236],
]);
const NIGHT = ramp([
  [8, 9, 24],
  [27, 29, 68],
  [34, 37, 84],
  [48, 52, 112],
]);
const SIDE = [
  ramp([
    [12, 14, 36],
    [24, 27, 64],
    [38, 42, 94],
    [52, 57, 124],
  ]),
  ramp([
    [9, 11, 30],
    [19, 22, 54],
    [30, 34, 80],
    [44, 48, 108],
  ]),
];
const WISH = ramp([
  [10, 13, 38],
  [14, 18, 50],
  [19, 24, 62],
  [24, 31, 78],
]);
const ION = pack([139, 233, 255]);
const ION_DIM = pack([69, 111, 133]);
const MOON = norm([-0.7, 0.45, -0.3]);
const RAD = Math.PI / 180;

export function decodeRelief(r: ReliefData) {
  const bin = atob(r.d);
  const hm = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const q = bin.charCodeAt(i);
    hm[i] = q ? Math.pow((q - 1) / 254, 2) * r.max : -1;
  }
  return hm;
}

export function makeRelief(reduced: boolean) {
  let data: ReliefData | null = null;
  let place: ReliefPlace | null = null;
  let hm = new Float32Array(0);
  let faces: Face[] = [];
  let floor: Face[] = [];
  let ex = 1;
  let turnR = 10;

  const st = {
    yaw: -0.42,
    vYaw: 0,
    dragging: false,
    born: -1,
    /** the sun where the place is: elevation in degrees, direction towards it */
    elev: 30,
    L: norm([0.3, 0.7, 0.5]) as V3,
    S: null as Shadow | null,
    cam: null as Cam | null,
  };

  const Y = (m: number) => ((m / 1000 / (data?.km ?? 1)) * ex);

  function build() {
    if (!data) return;
    const { W, H } = data;
    const hy = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : hm[j * W + i]);
    // heights at the cells' corners, so the land is one smooth sheet and only the coast is cut
    const CW = W + 1;
    const cy = new Float32Array(CW * (H + 1));
    for (let j = 0; j <= H; j++)
      for (let i = 0; i <= W; i++) {
        let sum = 0;
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const h = hy(i - (k & 1), j - (k >> 1));
          if (h >= 0) {
            sum += h;
            n++;
          }
        }
        cy[j * CW + i] = n ? Y(sum / n) : 0;
      }
    const C = (i: number, j: number) => cy[j * CW + i];
    faces = [];
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const h = hm[j * W + i];
        if (h < 0) continue;
        const x0 = i - W / 2;
        const z0 = j - H / 2;
        const x1 = x0 + 1;
        const z1 = z0 + 1;
        const a = C(i, j);
        const b = C(i + 1, j);
        const c = C(i + 1, j + 1);
        const e = C(i, j + 1);
        const gx = (b + c - a - e) / 2;
        const gz = (e + c - a - b) / 2;
        face(faces, [[x0, a, z0], [x1, b, z0], [x1, c, z1], [x0, e, z1]], "land", { n: norm([-gx, 1, -gz]), k: j * W + i });
        if (hy(i, j + 1) < 0) face(faces, [[x0, e, z1], [x1, c, z1], [x1, -BASE, z1], [x0, -BASE, z1]], "cliff", { n: [0, 0, 1] });
        if (hy(i, j - 1) < 0) face(faces, [[x1, b, z0], [x0, a, z0], [x0, -BASE, z0], [x1, -BASE, z0]], "cliff", { n: [0, 0, -1] });
        if (hy(i + 1, j) < 0) face(faces, [[x1, c, z1], [x1, b, z0], [x1, -BASE, z0], [x1, -BASE, z1]], "cliff", { n: [1, 0, 0] });
        if (hy(i - 1, j) < 0) face(faces, [[x0, a, z0], [x0, e, z1], [x0, -BASE, z1], [x0, -BASE, z0]], "cliff", { n: [-1, 0, 0] });
      }
    turnR = Math.max(W, H) * 0.54 + 2;
    floor = [];
    turntable(floor, turnR, -BASE - 0.01, "floor");
    shadows();
  }

  function shadows() {
    st.S = null;
    if (!data || st.elev < 2) return;
    st.S = makeShadow(320, st.L, Math.max(data.W, data.H) * 0.7, [0, 0, 0]);
    renderShadow(st.S, faces);
  }

  /** contour lines every 500 m, for the wish list */
  function contour(cell: number, h: number) {
    if (!data) return false;
    const W = data.W;
    const band = Math.floor(h / 500);
    const i = cell % W;
    for (const k of [i > 0 ? cell - 1 : -1, i < W - 1 ? cell + 1 : -1, cell - W, cell + W]) {
      if (k < 0 || k >= hm.length) return true;
      const hh = hm[k];
      if (hh < 0) return true;
      if (hh > h && Math.floor(hh / 500) !== band) return true;
    }
    return false;
  }

  function shade(f: Face, _u: number, _v: number, wx: number, wy: number, wz: number, x: number, y: number) {
    const bx = b4(x, y);
    const { L, S, elev } = st;
    const night = elev < -4;
    // twilight: day and night dithered together over 8°
    const dusk = clamp((elev + 4) / 8, 0, 1);
    const dark = night || dusk < bx;
    if (f.mat === "floor") return turntableInk(wx, wz, turnR, x, y, (st.cam as Cam).scale, !dark && inShadow(S, wx, wy, wz, 0.4), dark);
    if (f.mat === "cliff") {
      // the cut, in strata; the sea's line at the top for land that's been
      const rp = SIDE[Math.floor((wy + BASE) / 0.9) & 1];
      if (wy > -0.35 && wy < 0.02) return place?.status === "want" ? ION_DIM : bx < 0.5 ? P.grid : rp[2];
      const lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]) * (dark ? 0.25 : 1);
      return rp[clamp(Math.floor((0.12 + 0.8 * lam) * (rp.length - 1) + bx), 0, rp.length - 1)];
    }
    const h = hm[f.k];
    if (place?.status === "want") {
      if (contour(f.k, h)) return bx < 0.75 ? ION : ION_DIM;
      let lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]);
      if (inShadow(S, wx, wy, wz, 0.6)) lam *= 0.3;
      return WISH[clamp(Math.floor((0.1 + 0.6 * lam * (dark ? 0 : 1)) * 3 + bx), 0, 3)];
    }
    if (dark) {
      // the globe's night side: dark land and its city lights, thinning out with height
      const c = hash2(f.k * 7 + 3, f.k * 13 + 1);
      const low = h < 700 ? 1 : h < 1300 ? 0.35 : 0;
      if (c < 0.022 * low) return c < 0.004 ? P.lightHot : P.light;
      const m = Math.max(0, f.n[0] * MOON[0] + f.n[1] * MOON[1] + f.n[2] * MOON[2]);
      return NIGHT[clamp(Math.floor((0.15 + 0.85 * m * m) * 3.2 + bx - 0.5 + Math.min(1, h / 2500) * 0.9), 0, 3)];
    }
    let lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]);
    if (lam > 0 && inShadow(S, wx, wy, wz, 0.6)) lam *= 0.18;
    const max = data?.max ?? 1;
    const rp = max > 2400 && h > 1900 ? SNOW : LAND;
    // hillshade against flat ground, so slopes read even under a high sun
    const flat = Math.max(0.05, L[1]);
    const lift = Math.sqrt(Math.min(1, h / Math.max(800, max))) * 0.35;
    const v = 0.38 + 1.25 * (lam - flat) + lift + (lam === 0 ? -0.3 : 0);
    return rp[clamp(Math.floor(v * (rp.length - 1) + bx), 0, rp.length - 1)];
  }

  /** a frame; then how long until the picture changes again (seconds) */
  function frame(R: Raster, t: number, dt: number) {
    const W = R.w;
    const H = R.h;
    if (!st.dragging && st.vYaw) {
      st.yaw += st.vYaw * dt;
      st.vYaw *= Math.exp(-dt * 2.6);
      if (Math.abs(st.vYaw) < 0.03) st.vYaw = 0;
    }
    const span = (data ? Math.max(data.W, data.H) : 96) * 1.08 + 4;
    const scale = Math.min(W / span, H / (span * 0.62));
    const cx = W / 2;
    const cy = H * 0.5;
    halo(R, cx, cy, Math.min(W, H) * 0.62);
    clearDepth(R);
    const cam = makeCam(st.yaw, PITCH, scale, cx, cy, [0, 1.2, 0]);
    st.cam = cam;
    if (!data) {
      draw(R, floor, cam, shade);
      return Infinity;
    }
    // the land comes up out of the turntable when it arrives
    if (st.born < 0) st.born = t;
    const rise = reduced ? 1 : clamp((t - st.born) / 0.8, 0, 1);
    draw(R, floor, cam, shade);
    if (rise < 1) {
      const k = 1 - Math.pow(1 - rise, 3);
      const drop = (1 - k) * (Y(data.max) + BASE + 1);
      const grown = faces.map((f) => ({ ...f, p: f.p.map((p): V3 => [p[0], Math.max(-BASE, p[1] - drop), p[2]]) }));
      draw(R, grown, cam, shade);
    } else draw(R, faces, cam, shade);
    if (rise >= 1 && place) pin(R, cam);
    return st.dragging || st.vYaw || rise < 1 ? 0 : Infinity;
  }

  /** the place itself: a pin, amber at home */
  function pin(R: Raster, cam: Cam) {
    if (!data || !place) return;
    const [x0, x1, y0, y1] = data.b;
    const pi = ((place.lon - x0) / (x1 - x0)) * data.W;
    const pj = ((y1 - place.lat) / (y1 - y0)) * data.H;
    const ci = clamp(Math.floor(pi), 0, data.W - 1);
    const cj = clamp(Math.floor(pj), 0, data.H - 1);
    const h = Math.max(0, hm[cj * data.W + ci]);
    const p = cam.proj([pi - data.W / 2, Y(h), pj - data.H / 2]);
    const px = Math.round(p[0]);
    const py = Math.round(p[1]);
    const col = place.home ? P.light : place.status === "been" ? P.iceHi : ION;
    const put = (x: number, y: number, c: number) => {
      if (x >= 0 && y >= 0 && x < R.w && y < R.h) R.c[y * R.w + x] = c;
    };
    for (let k = 1; k <= 8; k++) if (k % 2 || place.status === "been") put(px, py - k, col);
    for (let yy = -12; yy <= -9; yy++) for (let xx = -1; xx <= 1; xx++) put(px + xx, py + yy, col);
    put(px, py, P.lightHot);
  }

  return {
    frame,
    /** a place's relief arrives: it rises in */
    setData(next: ReliefData, at: ReliefPlace) {
      data = next;
      place = at;
      hm = decodeRelief(next);
      ex = clamp((Math.max(next.W, next.H) * PEAK) / Math.max(0.01, next.max / 1000 / next.km), 6, 90);
      st.born = -1;
      build();
    },
    /** how much the heights are stretched */
    get stretch() {
      return ex;
    },
    /** the sun at the place: elevation and azimuth in degrees (azimuth clockwise from north) */
    setSun(elevation: number, azimuth: number) {
      const el = Math.max(elevation, 10) * RAD;
      const az = azimuth * RAD;
      st.elev = elevation;
      st.L = norm([Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]);
      shadows();
    },
    turn(dx: number, ms: number) {
      const k = 0.008;
      st.yaw += dx * k;
      st.vYaw = (dx * k) / (Math.max(1, ms) / 1000);
    },
    grab() {
      st.dragging = true;
      st.vYaw = 0;
    },
    release(still: boolean) {
      if (still || reduced) st.vYaw = 0;
      st.dragging = false;
    },
  };
}

export type ReliefScene = ReturnType<typeof makeRelief>;

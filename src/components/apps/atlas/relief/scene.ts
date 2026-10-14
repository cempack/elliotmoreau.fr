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

/**
 * The country, lifted out: a place's land as a contour model, cut in five
 * layers like a laser-cut relief map, standing in a puck of sea on the
 * globe's turntable. The outline and the heights are real (the relief route
 * bakes them); the heights are smoothed so the layers come out as clean
 * shapes, and the layers break at shares of the highest ground so every
 * country shows its lowlands, hills and ranges. Like the globe, each layer
 * is one flat ink (indigo lowlands up to lilac; ice and snow only where the
 * mountains really are), and what makes it solid is the light: it's lit by
 * the sun where the place is, so the layers' edges catch it or fall into
 * shade and the high ground shadows the low. The sea is lighter over the
 * shelf round the coast. By night it's the globe's night side: dark land,
 * moonlit edges, the lowlands' city lights.
 *
 * It paints when something changes (the place, the sun, a drag) and
 * otherwise not at all.
 */

export type ReliefData = {
  W: number;
  H: number;
  max: number;
  top: number;
  b: [number, number, number, number];
  km: number;
  d: string;
};

export type ReliefPlace = { lat: number; lon: number; status: "been" | "want"; home: boolean };

/** the puck's depth under the sea */
const BASE = 2.4;
const PITCH = 0.56;
/** the top layer's height, as a share of the model's longest side (for a country with real mountains) */
const PEAK = 0.1;
/** the lowest layer's top, over the sea */
const LIFT = 0.35;
/** where the layers break, as shares of the highest ground */
const BREAKS = [0.08, 0.24, 0.46, 0.72];
/** how far the shelf reaches out from the coast, in cells */
const SHELF_W = 3.5;
/** cells of sea round the grid that the shelf can reach */
const PAD = 6;

/** by day, dark to light: the globe's land inks up to lilac, then ice and snow */
const DAY = ramp([
  [27, 29, 68],
  [34, 37, 84],
  [46, 50, 112],
  [58, 63, 140],
  [70, 76, 165],
  [86, 93, 192],
  [110, 112, 214],
  [136, 129, 234],
  [178, 172, 234],
  [216, 212, 247],
  [245, 242, 236],
]);
/** the lowest layer's place on DAY (the ones under it are shade) */
const LOW = 4;
const NIGHT = ramp([
  [8, 9, 24],
  [16, 18, 46],
  [27, 29, 68],
  [34, 37, 84],
  [44, 48, 104],
  [58, 63, 132],
]);
/** the shelf, deep to shallow, by day and by night */
const SHELF = ramp([
  [15, 20, 55],
  [20, 29, 72],
  [27, 41, 92],
  [36, 58, 112],
]);
const SHELF_NIGHT = ramp([
  [8, 9, 24],
  [10, 13, 33],
  [13, 19, 44],
  [18, 27, 58],
]);
/** the puck's side, in two strata */
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
const ION = pack([139, 233, 255]);
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

/** a binomial blur over the land only (the sea stays sea), so the layers come out as shapes, not specks */
function smooth(hm: Float32Array, W: number, H: number, passes: number) {
  let a = hm;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (a[k] < 0) {
          b[k] = -1;
          continue;
        }
        let sum = 0;
        let wt = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            const h = a[jj * W + ii];
            if (h < 0) continue;
            const w = (di ? 1 : 2) * (dj ? 1 : 2);
            sum += h * w;
            wt += w;
          }
        b[k] = sum / wt;
      }
    a = b;
  }
  return a;
}

/**
 * Each cell's level, continuous (0 at sea, 1 for the lowlands, 2 where the
 * second layer starts, and so on), for the layers' contours to be traced
 * through. A level never rises more than half a step a cell in from the
 * coast, so each layer is set back from the one under it and the coast is
 * one clean edge.
 */
function levelsOf(hs: Float32Array, W: number, H: number, hmax: number) {
  // how far each land cell is from the sea, in steps (off the grid is sea)
  const far = new Uint8Array(W * H);
  for (let k = 0; k < hs.length; k++) far[k] = hs[k] < 0 ? 0 : 255;
  for (let pass = 0; pass < 2; pass++)
    for (let n = 0; n < W * H; n++) {
      const k = pass ? W * H - 1 - n : n;
      if (!far[k]) continue;
      const i = k % W;
      const j = (k - i) / W;
      let d = far[k];
      for (const [di, dj] of FOUR) {
        const ii = i + di;
        const jj = j + dj;
        const nb = ii < 0 || jj < 0 || ii >= W || jj >= H ? 0 : far[jj * W + ii];
        if (nb + 1 < d) d = nb + 1;
      }
      far[k] = d;
    }
  const at = [0, ...BREAKS.map((b) => b * hmax), hmax * 1.0001];
  const ev = new Float32Array(W * H);
  for (let k = 0; k < hs.length; k++) {
    const h = hs[k];
    if (h < 0) continue;
    let i = 0;
    while (i < at.length - 2 && h >= at[i + 1]) i++;
    ev[k] = Math.min(far[k] + 0.5, 1 + i + (h - at[i]) / (at[i + 1] - at[i]));
  }
  return ev;
}

const FOUR = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** where a layer starts on the levels: the coast halfway between sea (0) and land (1), the rest at their breaks */
const START = (l: number) => (l === 1 ? 0.5 : l);

export function makeRelief(reduced: boolean) {
  let data: ReliefData | null = null;
  let place: ReliefPlace | null = null;
  /** each cell's level (levelsOf) */
  let ev = new Float32Array(0);
  const layers = BREAKS.length + 1;
  /** each layer's top, and its ink on DAY */
  let tops: number[] = [];
  let inks: number[] = [];
  let faces: Face[] = [];
  let floor: Face[] = [];
  let coast = new Float32Array(0);
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

  function build() {
    if (!data) return;
    const { W, H } = data;
    const E = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : ev[j * W + i]);
    faces = [];
    // marching squares between the cells' centres: a square every corner of which is on a layer
    // is that layer's top (in runs along the row); where a layer's contour crosses a square, that
    // layer's piece of top, and its edge down to the layer under it (or to the sea)
    for (let j = -1; j < H; j++) {
      const z0 = j + 0.5 - H / 2;
      const z1 = z0 + 1;
      let run = -1;
      let runL = 0;
      const flush = (end: number) => {
        if (runL) {
          const y = tops[runL];
          const xa = run + 0.5 - W / 2;
          const xb = end + 0.5 - W / 2;
          face(faces, [[xa, y, z0], [xb, y, z0], [xb, y, z1], [xa, y, z1]], "land", { n: [0, 1, 0], k: runL });
        }
      };
      for (let i = -1; i < W; i++) {
        const c: [number, number, number][] = [
          [i + 0.5 - W / 2, z0, E(i, j)],
          [i + 1.5 - W / 2, z0, E(i + 1, j)],
          [i + 1.5 - W / 2, z1, E(i + 1, j + 1)],
          [i + 0.5 - W / 2, z1, E(i, j + 1)],
        ];
        const lo = Math.min(c[0][2], c[1][2], c[2][2], c[3][2]);
        const hi = Math.max(c[0][2], c[1][2], c[2][2], c[3][2]);
        let full = 0;
        for (let l = layers; l >= 1; l--)
          if (lo >= START(l)) {
            full = l;
            break;
          }
        if (full !== runL) {
          flush(i);
          run = i;
          runL = full;
        }
        for (let l = full + 1; l <= layers && hi >= START(l); l++) piece(c, l);
      }
      flush(W);
    }
    // the puck it stands in: the sea on top, strata round the side
    turnR = Math.max(W, H) * 0.54 + 2;
    floor = [];
    turntable(floor, turnR, 0, "sea");
    prism(floor, "y", [0, -BASE / 2, 0], turnR, BASE / 2, 64, "rim", null);
    coastField();
    shadows();
  }

  /** a layer's piece of top inside one square, and its edge where the contour runs through */
  function piece(c: [number, number, number][], l: number) {
    const th = START(l);
    const y = tops[l];
    const lo = l > 1 ? tops[l - 1] : 0;
    const pts: V3[] = [];
    const cross: boolean[] = [];
    for (let n = 0; n < 4; n++) {
      const a = c[n];
      const b = c[(n + 1) & 3];
      if (a[2] >= th) {
        pts.push([a[0], y, a[1]]);
        cross.push(false);
      }
      if (a[2] >= th !== b[2] >= th) {
        const t = (th - a[2]) / (b[2] - a[2]);
        pts.push([a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t]);
        cross.push(true);
      }
    }
    if (pts.length < 3) return;
    face(faces, pts, "land", { n: [0, 1, 0], k: l, uv: pts.map((): [number, number] => [0, 0]) });
    for (let n = 0; n < pts.length; n++) {
      const m = (n + 1) % pts.length;
      if (!cross[n] || !cross[m]) continue;
      const P = pts[n];
      const Q = pts[m];
      const dx = Q[0] - P[0];
      const dz = Q[2] - P[2];
      if (Math.abs(dx) + Math.abs(dz) < 1e-4) continue;
      face(faces, [P, Q, [Q[0], lo, Q[2]], [P[0], lo, P[2]]], l > 1 ? "edge" : "coast", { n: norm([dz, 0, -dx]), k: l });
    }
  }

  function shadows() {
    st.S = null;
    if (!data || st.elev < 2) return;
    st.S = makeShadow(400, st.L, Math.max(data.W, data.H) * 0.7, [0, 0, 0]);
    renderShadow(st.S, faces);
  }

  /** how far each cell is from the land (cells), over the grid and a margin round it, for the shelf */
  function coastField() {
    if (!data) return;
    const { W, H } = data;
    const GW = W + PAD * 2;
    const GH = H + PAD * 2;
    const d = new Float32Array(GW * GH).fill(1e9);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (ev[j * W + i] > 0) d[(j + PAD) * GW + i + PAD] = 0;
    // two chamfer passes (1 straight, 1.4 diagonal)
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        if (i > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
        if (j > 0) {
          d[k] = Math.min(d[k], d[k - GW] + 1);
          if (i > 0) d[k] = Math.min(d[k], d[k - GW - 1] + 1.4);
          if (i < GW - 1) d[k] = Math.min(d[k], d[k - GW + 1] + 1.4);
        }
      }
    for (let j = GH - 1; j >= 0; j--)
      for (let i = GW - 1; i >= 0; i--) {
        const k = j * GW + i;
        if (i < GW - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
        if (j < GH - 1) {
          d[k] = Math.min(d[k], d[k + GW] + 1);
          if (i < GW - 1) d[k] = Math.min(d[k], d[k + GW + 1] + 1.4);
          if (i > 0) d[k] = Math.min(d[k], d[k + GW - 1] + 1.4);
        }
      }
    coast = d;
  }

  /** a sea point's distance from the land, in cells */
  function coastAt(wx: number, wz: number) {
    if (!data) return 1e9;
    const GW = data.W + PAD * 2;
    const i = Math.floor(wx + data.W / 2) + PAD;
    const j = Math.floor(wz + data.H / 2) + PAD;
    if (i < 0 || j < 0 || i >= GW || j >= data.H + PAD * 2) return 1e9;
    return coast[j * GW + i];
  }

  /** the cell under a world point */
  function cellAt(wx: number, wz: number) {
    if (!data) return 0;
    const i = clamp(Math.floor(wx + data.W / 2), 0, data.W - 1);
    const j = clamp(Math.floor(wz + data.H / 2), 0, data.H - 1);
    return j * data.W + i;
  }

  function shade(f: Face, _u: number, _v: number, wx: number, wy: number, wz: number, x: number, y: number) {
    const bx = b4(x, y);
    const { L, S, elev } = st;
    // twilight: day and night dithered together over 8°
    const dark = elev < -4 || clamp((elev + 4) / 8, 0, 1) < bx;
    const scale = (st.cam as Cam).scale;
    if (f.mat === "sea") {
      const shadowed = !dark && inShadow(S, wx, wy, wz, 0.3 + 0.3 / Math.max(0.1, L[1]));
      const d = coastAt(wx, wz);
      if (d < SHELF_W) {
        // the shelf: lighter water near the coast, dithered out into the deep
        const t = 1 - d / SHELF_W;
        const rp = dark ? SHELF_NIGHT : SHELF;
        return rp[clamp(Math.floor(t * t * 3.6 + bx - 0.5 - (shadowed ? 1 : 0)), 0, 3)];
      }
      return turntableInk(wx, wz, turnR, x, y, scale, shadowed, dark);
    }
    if (f.mat === "rim") {
      // the puck's side: the sea's edge, then two strata
      if (wy > -0.25) return dark ? P.gridNight : P.grid;
      const lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]) * (dark ? 0.25 : 1);
      const rp = SIDE[Math.floor((wy + BASE) / 0.8) & 1];
      return rp[clamp(Math.floor((0.12 + 0.8 * lam) * (rp.length - 1) + bx), 0, rp.length - 1)];
    }
    const l = f.k;
    if (dark) {
      // the globe's night side: dark layers, edges catching the moon, the lowlands' city lights
      if (f.mat !== "land") {
        const m = f.n[0] * MOON[0] + f.n[2] * MOON[2];
        return NIGHT[clamp((m > 0.1 ? 4 : 2) + (l > 3 ? 1 : 0) + (f.mat === "coast" ? -1 : 0), 0, NIGHT.length - 1)];
      }
      if (l <= 2) {
        const k = cellAt(wx, wz);
        const c = hash2(k * 7 + 3, k * 13 + 1);
        if (c < (l === 1 ? 0.05 : 0.02)) return c < 0.01 ? P.lightHot : P.light;
      }
      return NIGHT[clamp(3 + (l >= 3 ? 1 : 0), 0, NIGHT.length - 1)];
    }
    // by day: the layer's ink; its edges catch the sun or fall into shade; the high ground shadows the low
    const ink = inks[l];
    if (f.mat !== "land") {
      const lam = f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2];
      // (lambert only: a shadow map is too coarse for faces this thin to test against)
      const lit = lam > 0.04;
      const v = f.mat === "coast" ? (lit ? ink - 1.2 + lam * 1.8 : ink - 3.4) : lit ? ink + 0.8 + lam * 1.4 : ink - 2.2;
      return DAY[clamp(Math.floor(v + bx - 0.5), 0, DAY.length - 1)];
    }
    // a low sun dims the flat tops a step (the edges keep their light); shadows, two
    const low = L[1] < 0.3 ? 1 : 0;
    // (the bias grows as the sun gets low, or flat ground shadows itself in stripes)
    const shadow = inShadow(S, wx, wy, wz, 0.3 + 0.3 / Math.max(0.1, L[1]));
    return DAY[clamp(ink - low - (shadow ? 2 : 0), 0, DAY.length - 1)];
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
    const scale = Math.min(W / span, H / (span * 0.66));
    const cx = W / 2;
    const cy = H * 0.47;
    halo(R, cx, cy, Math.min(W, H) * 0.62);
    clearDepth(R);
    const cam = makeCam(st.yaw, PITCH, scale, cx, cy, [0, 1.2, 0]);
    st.cam = cam;
    if (!data) {
      draw(R, floor, cam, shade);
      return Infinity;
    }
    // the land comes up out of the sea when it arrives
    if (st.born < 0) st.born = t;
    const rise = reduced ? 1 : clamp((t - st.born) / 0.8, 0, 1);
    draw(R, floor, cam, shade);
    if (rise < 1) {
      const k = 1 - Math.pow(1 - rise, 3);
      const drop = (1 - k) * (tops[layers] + 1);
      const grown = faces.map((f) => ({ ...f, p: f.p.map((p): V3 => [p[0], Math.max(-0.1, p[1] - drop), p[2]]) }));
      draw(R, grown, cam, shade);
    } else draw(R, faces, cam, shade);
    if (rise >= 1 && place) pin(R, cam);
    return st.dragging || st.vYaw || rise < 1 ? 0 : Infinity;
  }

  /** the place itself: a pin, amber at home, ion on the wish list */
  function pin(R: Raster, cam: Cam) {
    if (!data || !place) return;
    const [x0, x1, y0, y1] = data.b;
    const pi = ((place.lon - x0) / (x1 - x0)) * data.W;
    const pj = ((y1 - place.lat) / (y1 - y0)) * data.H;
    const ci = clamp(Math.floor(pi), 0, data.W - 1);
    const cj = clamp(Math.floor(pj), 0, data.H - 1);
    const e = ev[cj * data.W + ci];
    let l = 0;
    while (l < layers && e >= START(l + 1)) l++;
    const p = cam.proj([pi - data.W / 2, tops[l], pj - data.H / 2]);
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
      const { W, H } = next;
      const big = Math.max(W, H);
      const hs = smooth(decodeRelief(next), W, H, big > 60 ? 3 : 2);
      let hmax = 1;
      for (let k = 0; k < hs.length; k++) if (hs[k] > hmax) hmax = hs[k];
      ev = levelsOf(hs, W, H, hmax);
      // as tall as the land is rugged (a flat country stays low), the layers evenly stacked
      const tall = big * PEAK * clamp(Math.sqrt(hmax / 2000), 0.4, 1.25);
      tops = [0];
      inks = [LOW];
      for (let l = 1; l <= layers; l++) {
        tops.push(LIFT + (tall * l) / layers);
        // the inks climb with the layers, but only as far as the real heights go: lilac for hills,
        // ice for ranges, snow for the high mountains
        const from = l > 1 ? BREAKS[l - 2] * hmax : 0;
        const cap = from > 2600 ? 10 : from > 1900 ? 9 : from > 1200 ? 8 : from > 500 ? 7 : 6;
        inks.push(Math.min(LOW + l - 1, cap));
      }
      st.born = -1;
      build();
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

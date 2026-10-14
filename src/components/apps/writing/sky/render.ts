/**
 * The sky a post went out under, flat: the band that rides under the bar
 * while a post is read on a narrow window, looking north over Saint-Sernin
 * as the stars trail round the pole (the long exposure, below). Everywhere
 * else the sky is on the dome (./dome).
 *
 * The camera is stereographic (circles stay circles). Under the sky runs a
 * roofline all the way round, with Saint-Sernin to the north, Saint-Étienne
 * to the south-east and the dome of La Grave to the west, floodlit at
 * night, and windows lit by the local hour.
 *
 * Nothing here runs on its own: a `Sky` paints when asked (a new size, a
 * scroll step). `render` does the costly part once per camera and minute;
 * `compose` puts the names and the date stamp on top.
 */

import {
  A30,
  A45,
  A60,
  A80,
  LANDMARKS,
  NS,
  P,
  R,
  SBV,
  SMAG,
  SV,
  b4,
  clamp,
  cross,
  darkness,
  hash2,
  limitOf,
  litShare,
  paintMoon,
  rng,
  skyAt,
  skyShader,
  starInk,
  type SkyAt,
  type Vec,
} from "./astro";

export { clockOf, exposureStart, faceOf, skyAt } from "./astro";
export { Dome, type DomeOptions } from "./dome";

/* ───── the roofline: Toulouse from a window near the Capitole, a quarter degree a sample ───── */
const ROOF = new Float32Array(1440);
/** 1 Saint-Sernin, 2 La Grave, 3 Saint-Étienne */
const RK = new Uint8Array(1440);
{
  const rnd = rng(1229);
  let a = 0;
  while (a < 360) {
    const w = 2.4 + rnd() * 7;
    const h = 2 + rnd() * 3.6 + (rnd() < 0.16 ? 2.2 : 0);
    const gable = rnd() < 0.72;
    const pk = 0.4 + rnd() * 0.7;
    const ch1 = rnd() < 0.7 ? a + 0.5 + rnd() * (w - 1) : -9;
    const ch2 = rnd() < 0.3 ? a + 0.5 + rnd() * (w - 1) : -9;
    const ant = rnd() < 0.2 ? a + 0.5 + rnd() * (w - 1) : -9;
    for (let i = Math.round(a * 4); i < Math.round((a + w) * 4) && i < 1440; i++) {
      const az = i / 4;
      const t = (az - a) / w;
      let top = h + (gable ? pk * (1 - Math.abs(t * 2 - 1)) : 0);
      if (Math.abs(az - ch1) < 0.32 || Math.abs(az - ch2) < 0.32) top = Math.max(top, h + pk + 0.85);
      if (Math.abs(az - ant) < 0.12) top = Math.max(top, h + pk + 2.4);
      ROOF[i] = top;
    }
    a += w;
  }
  const landmark = (c: number, kind: number, prof: (d: number) => number) => {
    for (let d = -12; d <= 12; d += 0.25) {
      const t = prof(Math.abs(d));
      const i = (((Math.round((c + d) * 4) % 1440) + 1440) % 1440);
      if (t > ROOF[i] - 0.01) {
        ROOF[i] = Math.max(ROOF[i], t);
        RK[i] = kind;
      }
    }
  };
  // Saint-Sernin, north: the long nave, then the octagonal belltower in five tiers and its spire
  landmark(LANDMARKS[0], 1, (d) =>
    d < 1 ? 18.4 + (1 - d) * 5.4 : d < 1.2 ? 18.4 : d < 1.5 ? 16.9 : d < 1.85 ? 15.2 : d < 2.25 ? 13.3 : d < 2.65 ? 11.2 : d < 3.6 ? 8.6 : d < 9.5 ? 7.4 : 0,
  );
  // Saint-Étienne, south-east: the square tower, its little pyramid
  landmark(LANDMARKS[1], 3, (d) => (d < 1.8 ? 12.4 + (d < 1 ? (1 - d) * 1.1 : 0) : d < 4.5 ? 6.6 : 0));
  // La Grave, west across the Garonne: a dome on its drum, the lantern on top
  landmark(LANDMARKS[2], 2, (d) => (d < 0.35 ? 12.6 : d < 3 ? 7.6 + Math.sqrt(9 - d * d) * 1.05 : d < 3.4 ? 7.6 : 0));
}


/* ───── the view: a stereographic camera on the sky ───── */
type View = { W: number; H: number; S: number; f: Vec; r: Vec; u: Vec; cx: number; cy: number };
function makeView(W: number, H: number, alt: number, fovV: number): View {
  const S = H / 2 / (2 * Math.tan((fovV * R) / 2));
  const B = alt * R;
  const f: Vec = [0, Math.cos(B), Math.sin(B)];
  const r: Vec = [1, 0, 0];
  return { W, H, S, f, r, u: cross(r, f), cx: W / 2, cy: H / 2 };
}

export type SkyOptions = {
  /** the field from top to bottom, in degrees */
  fov: number;
  /** the altitude, in degrees, at the bottom edge */
  bottom: number;
  moonR: number;
  sunR: number;
};

/**
 * One flat sky, north over Saint-Sernin, on one grid of cells. Give it a
 * size and a moment, then `paint` into an ImageData's Uint32 view;
 * `trail` lays a long exposure under the stars.
 */
export class Sky {
  W = 0;
  H = 0;
  ms = 0;
  trail: Exposure | null = null;
  /** 1 where the roofs are */
  mask = new Uint8Array(0);
  private alt = 20;
  private dirs: Float32Array | null = null;
  private v: View | null = null;

  constructor(public o: SkyOptions) {}

  /** true when the grid changed */
  size(W: number, H: number) {
    if (W < 8 || H < 6 || (W === this.W && H === this.H)) return false;
    this.W = W;
    this.H = H;
    this.mask = new Uint8Array(W * H);
    // the camera's altitude that puts the bottom edge at `bottom` degrees
    const S = makeView(W, H, 0, this.o.fov).S;
    this.alt = this.o.bottom + (2 * Math.atan(H / 2 / S / 2)) / R;
    this.v = makeView(W, H, this.alt, this.o.fov);
    this.dirs = null;
    return true;
  }

  /** where a direction on the sky (horizon x east, y north, z up) lands, in cells; null behind the camera */
  project(hx: number, hy: number, hz: number): [number, number] | null {
    const v = this.v;
    if (!v) return null;
    const cz = hx * v.f[0] + hy * v.f[1] + hz * v.f[2];
    if (cz < -0.3) return null;
    const k = (2 / (1 + cz)) * v.S;
    return [v.cx + (hx * v.r[0] + hy * v.r[1] + hz * v.r[2]) * k, v.cy - (hx * v.u[0] + hy * v.u[1] + hz * v.u[2]) * k];
  }

  private view() {
    const v = this.v!;
    if (!this.dirs) {
      // each cell's direction on the sky, kept while the size holds
      const d = new Float32Array(this.W * this.H * 3);
      for (let y = 0, k = 0; y < this.H; y++)
        for (let x = 0; x < this.W; x++, k += 3) {
          const X = (x + 0.5 - v.cx) / v.S;
          const Y = (v.cy - y - 0.5) / v.S;
          const q = X * X + Y * Y;
          const den = 4 + q;
          const a = (4 * X) / den;
          const b = (4 * Y) / den;
          const c = (4 - q) / den;
          d[k] = a * v.r[0] + b * v.u[0] + c * v.f[0];
          d[k + 1] = a * v.r[1] + b * v.u[1] + c * v.f[1];
          d[k + 2] = a * v.r[2] + b * v.u[2] + c * v.f[2];
        }
      this.dirs = d;
    }
    return v;
  }

  paint(out: Uint32Array) {
    if (!this.W || !this.ms || out.length !== this.W * this.H) return;
    const v = this.view();
    const sky = skyAt(this.ms);
    this.paintSky(out, sky);
    this.trail?.draw(out, this.mask);
    this.paintStars(out, v, sky);
    this.paintMoonSun(out, v, sky);
  }

  private paintSky(buf: Uint32Array, sky: SkyAt) {
    const { W, H, mask } = this;
    const dirs = this.dirs!;
    const shade = skyShader(sky);
    const dark = darkness(sky.sunAlt);
    const lit = litShare(sky.ms, sky.sunAlt);
    const night = dark > 0.5;
    const body = dark > 0.35 ? P.oceanNight : P.oceanLit;
    const rim = dark > 0.35 ? P.landNight : P.landLo;
    for (let y = 0, k = 0, j = 0; y < H; y++) {
      for (let x = 0; x < W; x++, k++, j += 3) {
        const hx = dirs[j];
        const hy = dirs[j + 1];
        const hz = dirs[j + 2];
        const alt = Math.asin(hz > 1 ? 1 : hz < -1 ? -1 : hz) / R;
        let az = Math.atan2(hx, hy) / R;
        if (az < 0) az += 360;
        const ri = (az * 4) | 0;
        const roof = ROOF[ri];
        if (alt < roof) {
          mask[k] = 1;
          buf[k] = this.roofInk(ri, az, alt, roof, b4(x, y), night, lit, body, rim);
          continue;
        }
        mask[k] = 0;
        buf[k] = shade(hx, hy, hz, x, y);
      }
    }
  }
  private roofInk(ri: number, az: number, alt: number, roof: number, b: number, night: boolean, lit: number, body: number, rim: number) {
    let kind = RK[ri];
    // below its own walls a monument is just the street in front of it
    if (kind && alt < (kind === 1 ? 2.8 : kind === 2 ? 3.6 : 6.4)) kind = 0;
    if (kind === 2 && night) {
      // La Grave, lit cool: the dome shaded as a sphere, its drum dark with lit arches, the lantern
      const d = Math.abs(((az - LANDMARKS[2] + 540) % 360) - 180);
      if (alt > 10.6) return roof - alt < 0.5 ? P.iceHi : P.ice;
      if (alt > 7.6) {
        const s = Math.sqrt(Math.max(0, 1 - (d / 3.05) ** 2)) * 0.75 + 0.35 * (1 - (alt - 7.6) / 3.2) - 0.1;
        return roof - alt < 0.45 ? P.ice : s > b ? (s - 0.55 > b * 0.5 ? P.ice : P.landHi) : P.landLo;
      }
      if (d < 3.2 && d % 0.95 < 0.42 && alt > 4.4 && alt < 6.9) return alt > 6.2 ? P.landHi : P.landLo;
      return alt > 7.2 ? P.landLo : P.landNight2;
    }
    if (kind && night) {
      // the floodlit churches: Saint-Sernin and Saint-Étienne, warm
      const top = kind === 1 ? 23.8 : 13.5;
      const f = 0.25 + 0.55 * clamp(alt / top, 0, 1);
      if (kind === 1 && alt > 8.6 && alt < 18.2) {
        // arcades on each tier of the belltower
        const d = Math.abs(((az - LANDMARKS[0] + 540) % 360) - 180);
        if (d % 0.62 < 0.3 && (alt - 8.6) % 2.05 > 0.55 && (alt - 8.6) % 2.05 < 1.55) return A30;
      }
      return f > b ? (f > 0.62 + b * 0.3 ? P.light : A80) : A45;
    }
    if (kind && !night) return roof - alt < 0.5 ? P.land : alt / roof > b ? P.landLo : P.landNight2;
    if (roof - alt < 0.5) return rim;
    if (alt > -9 && alt < roof - 1.1) {
      const ca = az / 1.25;
      const row = (alt + 10) / 1.5;
      if (ca % 1 < 0.44 && row % 1 > 0.32 && row % 1 < 0.86) {
        const h = hash2(ca | 0, row | 0);
        if (!night && lit === 0) return h < 0.5 ? P.oceanDeep : body;
        if (h < lit) {
          const c = hash2((ca | 0) + 7, row | 0);
          return c < 0.06 ? P.lightHot : c < 0.12 ? P.ice : c < 0.4 ? A60 : P.light;
        }
        return night ? P.oceanNight2 : P.landNight;
      }
    }
    return body;
  }
  private paintStars(buf: Uint32Array, v: View, sky: SkyAt) {
    const { W, H, mask } = this;
    const M = sky.M;
    const put = (x: number, y: number, c: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H && !mask[y * W + x]) buf[y * W + x] = c;
    };
    const lim0 = limitOf(sky);
    if (lim0 >= -2)
      for (let i = 0; i < NS; i++) {
        const e0 = SV[i * 3];
        const e1 = SV[i * 3 + 1];
        const e2 = SV[i * 3 + 2];
        const hz = M[6] * e0 + M[7] * e1 + M[8] * e2;
        if (hz < 0.005) continue;
        const alt = Math.asin(hz) / R;
        const mag = SMAG[i];
        // stars fade into the haze near the horizon
        const lim = alt < 18 ? lim0 - (18 - alt) * 0.1 : lim0;
        if (mag > lim) continue;
        const p = this.project(M[0] * e0 + M[1] * e1 + M[2] * e2, M[3] * e0 + M[4] * e1 + M[5] * e2, hz);
        if (!p) continue;
        const x = p[0] | 0;
        const y = p[1] | 0;
        if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x]) continue;
        buf[y * W + x] = starInk(mag, SBV[i], lim);
        if (mag < 1.1 && lim > 1.8) {
          const arm = mag < 0.3 ? P.ice : P.landHi;
          put(x - 1, y, arm);
          put(x + 1, y, arm);
          put(x, y - 1, arm);
          put(x, y + 1, arm);
        }
      }
    for (const pl of sky.planets) {
      if (pl.h[2] < 0.01 || pl.mag > lim0 + 1.2) continue;
      const p = this.project(pl.h[0], pl.h[1], pl.h[2]);
      if (p) put(p[0] | 0, p[1] | 0, pl.ink);
    }
  }
  private paintMoonSun(buf: Uint32Array, v: View, sky: SkyAt) {
    const { W, H, mask } = this;
    const put = (x: number, y: number, c: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H && !mask[y * W + x]) buf[y * W + x] = c;
    };
    if (sky.sunAlt > -1.5) {
      const p = this.project(sky.sunH[0], sky.sunH[1], sky.sunH[2]);
      if (p) {
        const r = this.o.sunR;
        for (let dy = -6; dy <= 6; dy++)
          for (let dx = -6; dx <= 6; dx++) {
            const d = Math.hypot(dx, dy);
            if (d <= r) put((p[0] | 0) + dx, (p[1] | 0) + dy, d < r - 1.2 ? P.lightHot : P.iceHi);
          }
      }
    }
    if (sky.moonAlt < -1.5) return;
    const p = this.project(sky.moonH[0], sky.moonH[1], sky.moonH[2]);
    if (p) paintMoon(sky, Math.round(p[0]), Math.round(p[1]), this.o.moonR, v.r, put);
  }
}

/* ═════════ the long exposure: every star's path, from the first minute to where the reader is ═════════ */
/** the exposure advances in this many steps from the first line to the last */
export const STEPS = 240;
/** each minute of reading is this many minutes of sky */
export const SKY_MIN_PER_READ_MIN = 40;

/** what an exposure is laid on: a grid of cells, and where a direction on the sky lands on it */
export type Film = { W: number; H: number; project(hx: number, hy: number, hz: number): [number, number] | null };

export class Exposure {
  t0 = 0;
  span = 0;
  step = -1;
  private trail: Float32Array | null = null;
  private cls = new Uint8Array(0);
  private last = new Float32Array(NS * 2);
  private ok = new Uint8Array(NS);

  constructor(private sky: Film) {}

  reset(t0: number, minutes: number) {
    this.t0 = t0;
    this.span = minutes * SKY_MIN_PER_READ_MIN * 60000;
    this.step = -1;
    this.trail = null;
  }
  at(s: number) {
    return this.t0 + (this.span * s) / STEPS;
  }
  /** add every star's path up to step `to` (from the start again when going back, or after the camera moved) */
  advance(to: number) {
    const sk = this.sky;
    const { W, H } = sk;
    if (!W) return;
    if (!this.trail || this.trail.length !== W * H || to < this.step) {
      this.trail = new Float32Array(W * H);
      this.cls = new Uint8Array(W * H);
      this.ok.fill(0);
      this.step = -1;
    }
    for (let s = this.step + 1; s <= to; s++) {
      const sky = skyAt(this.at(s));
      const M = sky.M;
      const lim0 = limitOf(sky);
      for (let i = 0; i < NS; i++) {
        const mag = SMAG[i];
        if (mag > lim0) {
          this.ok[i] = 0;
          continue;
        }
        const e0 = SV[i * 3];
        const e1 = SV[i * 3 + 1];
        const e2 = SV[i * 3 + 2];
        const hz = M[6] * e0 + M[7] * e1 + M[8] * e2;
        if (hz < 0.01) {
          this.ok[i] = 0;
          continue;
        }
        const p = sk.project(M[0] * e0 + M[1] * e1 + M[2] * e2, M[3] * e0 + M[4] * e1 + M[5] * e2, hz);
        if (!p) {
          this.ok[i] = 0;
          continue;
        }
        const px = p[0];
        const py = p[1];
        if (px < -8 || py < -8 || px > W + 8 || py > H + 8) {
          this.ok[i] = 0;
          continue;
        }
        // only the brighter stars leave a trail worth seeing; red giants leave amber ones
        if (this.ok[i])
          this.stroke(
            this.last[i * 2],
            this.last[i * 2 + 1],
            px,
            py,
            clamp((lim0 - 0.6 - mag) / 4.2, 0, 1) ** 1.3 * (mag < 1 ? 1.2 : 1),
            SBV[i] > 1.15 && mag < 3.2 ? 1 : 0,
          );
        this.last[i * 2] = px;
        this.last[i * 2 + 1] = py;
        this.ok[i] = 1;
      }
    }
    this.step = Math.max(this.step, to);
  }
  private stroke(x0: number, y0: number, x1: number, y1: number, I: number, c: number) {
    if (I <= 0.02 || !this.trail) return;
    const { W, H } = this.sky;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let k = 1; k <= n; k++) {
      const x = (x0 + ((x1 - x0) * k) / n) | 0;
      const y = (y0 + ((y1 - y0) * k) / n) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (I > this.trail[i]) {
        this.trail[i] = I;
        this.cls[i] = c;
      }
    }
  }
  /** lay the trails over the sky, under the stars */
  draw(buf: Uint32Array, mask: Uint8Array) {
    const T = this.trail;
    const { W, H } = this.sky;
    if (!T || T.length !== W * H) return;
    const C = this.cls;
    for (let y = 0, i = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        const I = T[i];
        if (I <= 0 || mask[i]) continue;
        const lv = Math.floor(I * 4.4 + (b4(x, y) - 0.5) * 1.1);
        if (lv <= 0) continue;
        buf[i] = C[i] ? [A30, A45, A80, P.light][Math.min(3, lv - 1)] : [P.landLo, P.landHi, P.ice, P.iceHi][Math.min(3, lv - 1)];
      }
  }
}


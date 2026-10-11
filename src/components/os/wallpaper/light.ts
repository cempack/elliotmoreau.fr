import { moonAt, sunAt } from "@/lib/sun";
import { MAT, WATER, type City } from "./city";
import { project } from "./sunClock";

/**
 * The light over the city: turns ./city's indexed buffer into colour for
 * any instant. The sun's real elevation picks a blend of keyframe palettes
 * (night, blue hour, sunset, golden hour, day; dawn has its own paler
 * set), its azimuth decides which walls it reaches: the Daurade fronts
 * face west and catch the evening, La Grave faces east and takes the
 * morning, the Pont Neuf's face looks north and is always backlit, the
 * dome turns its light around with the sun. Brick goes pale pink at dawn,
 * terracotta at noon, ember at golden hour, violet at night.
 *
 * One palette entry per code in use, then one lookup per pixel: a 1440
 * screen relights in a few milliseconds, so the sun can be dragged.
 */

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = c01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const B4 = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));

/* ───────────────────────────── keyframes ───────────────────────────── */

type Key = {
  /** sun elevation, degrees */
  e: number;
  /** sky, top of screen to the horizon */
  sky: [string, string, string, string, string];
  glow: string;
  glowAmt: number;
  /** light from the whole sky, per channel */
  amb: RGB;
  /** direct sun, per channel */
  sun: RGB;
  /** the river's own colour under the reflections */
  water: string;
  cloud: [string, string, string]; // lit, body, shade
};

const EVENING: Key[] = [
  {
    e: -18,
    sky: ["#040607", "#060a0c", "#0a1214", "#101a1d", "#16201f"],
    glow: "#6a4a33",
    glowAmt: 0.32,
    amb: [0.13, 0.15, 0.22],
    sun: [0, 0, 0],
    water: "#05090a",
    cloud: ["#1b2224", "#121819", "#0c1112"],
  },
  {
    e: -8,
    sky: ["#070a10", "#121a26", "#253041", "#4a4658", "#6e5160"],
    glow: "#9a6070",
    glowAmt: 0.4,
    amb: [0.24, 0.22, 0.36],
    sun: [0, 0, 0],
    water: "#0a0f16",
    cloud: ["#5a4656", "#2e2c3c", "#1d1e2a"],
  },
  {
    e: -3,
    sky: ["#0b0f16", "#1f2a36", "#4b4e5c", "#a06c66", "#d88d68"],
    glow: "#f0a676",
    glowAmt: 0.55,
    amb: [0.36, 0.3, 0.42],
    sun: [0, 0, 0],
    water: "#11161c",
    cloud: ["#e09a7e", "#5d4a54", "#2f2c36"],
  },
  {
    e: 1,
    sky: ["#121a22", "#2c3a44", "#6a6a6a", "#c88d6c", "#f2ab72"],
    glow: "#ffbe7a",
    glowAmt: 0.6,
    amb: [0.4, 0.35, 0.4],
    sun: [1.35, 0.62, 0.32],
    water: "#161c20",
    cloud: ["#f0b08a", "#80645e", "#463c40"],
  },
  {
    e: 6,
    sky: ["#16222a", "#34484f", "#78837e", "#c9a886", "#efc794"],
    glow: "#ffd9a0",
    glowAmt: 0.42,
    amb: [0.46, 0.45, 0.5],
    sun: [1.3, 0.88, 0.56],
    water: "#1a2426",
    cloud: ["#f6d6b0", "#a39486", "#6c665e"],
  },
  {
    e: 20,
    sky: ["#16252a", "#2c434a", "#58767b", "#8ca6a5", "#b4c6bf"],
    glow: "#eef0de",
    glowAmt: 0.2,
    amb: [0.52, 0.57, 0.64],
    sun: [1.08, 1.0, 0.86],
    water: "#1d3434",
    cloud: ["#e6ede8", "#b7c6c2", "#86a09c"],
  },
  {
    e: 50,
    sky: ["#142429", "#29424a", "#547379", "#86a1a2", "#a9bdb9"],
    glow: "#f2f4e6",
    glowAmt: 0.14,
    amb: [0.56, 0.62, 0.68],
    sun: [1.02, 1.0, 0.92],
    water: "#1f3a38",
    cloud: ["#eef3ef", "#bccbc6", "#8aa39f"],
  },
];

/** Dawn: the same structure, cooler and paler (rose, not ember). */
const MORNING: Key[] = EVENING.map((k) => {
  switch (k.e) {
    case -8:
      return { ...k, sky: ["#070b10", "#152030", "#2d3a4c", "#56586a", "#7a6670"], glow: "#a07888", amb: [0.24, 0.24, 0.36] };
    case -3:
      return {
        ...k,
        sky: ["#0a1014", "#22303a", "#55606a", "#a88a88", "#d8ab98"],
        glow: "#f2c0a8",
        glowAmt: 0.5,
        amb: [0.36, 0.33, 0.42],
        cloud: ["#e8b6a6", "#6a5c66", "#38343e"],
      };
    case 1:
      return {
        ...k,
        sky: ["#101a20", "#2c3c46", "#6c7074", "#c8a092", "#f0c2a2"],
        glow: "#ffd2b4",
        sun: [1.0, 0.8, 0.84],
        cloud: ["#f4c8b4", "#8a7a78", "#4a4448"],
      };
    case 6:
      return { ...k, sky: ["#14222a", "#32474f", "#768684", "#c4b0a0", "#ead0b4"], glow: "#ffe2c8", sun: [1.02, 0.9, 0.88] };
    default:
      return k;
  }
});

type Interp = {
  sky: RGB[];
  glow: RGB;
  glowAmt: number;
  amb: RGB;
  sun: RGB;
  water: RGB;
  cloud: [RGB, RGB, RGB];
};

function interp(keys: Key[], e: number): Interp {
  let j = 0;
  while (j < keys.length - 2 && e > keys[j + 1].e) j++;
  const a = keys[j];
  const b = keys[j + 1];
  const t = smoothstep(0, 1, c01((e - a.e) / (b.e - a.e)));
  const m3 = (x: RGB, y: RGB): RGB => mix(x, y, t);
  const mh = (x: string, y: string) => mix(hex(x), hex(y), t);
  return {
    sky: a.sky.map((c, i) => mh(c, b.sky[i])),
    glow: mh(a.glow, b.glow),
    glowAmt: a.glowAmt + (b.glowAmt - a.glowAmt) * t,
    amb: m3(a.amb, b.amb),
    sun: m3(a.sun, b.sun),
    water: mh(a.water, b.water),
    cloud: [mh(a.cloud[0], b.cloud[0]), mh(a.cloud[1], b.cloud[1]), mh(a.cloud[2], b.cloud[2])],
  };
}

/* ───────────────────────────── materials ───────────────────────────── */

const BRICK = hex("#c4826a");
const BRICK_DEEP = hex("#a0604e");
const ROOF = hex("#b06048");
const STONE = hex("#d8ccb4");
const COPPER = hex("#6fae94");
const DRUM = hex("#c88466");
const LEAF = hex("#58743e");
const TRUNK = hex("#4a4038");
const DARK = hex("#1a1716");
const GLASS = hex("#2a3036");
const WARM = hex("#ffcf86");
const WARM2 = hex("#ffb066");
const LAMP_ON = hex("#ffe0a0");
const LAMP_OFF = hex("#3a3632");
const STAR_INK = hex("#ebe9e1");
const UPLIGHT: RGB = [0.95, 0.62, 0.32];
const VIG = hex("#020404");
const EXPOSURE = 0.8;

type V3 = [number, number, number];
/* normals: x+ west (screen right), y up, z+ south (into the screen) */
const N_WEST: V3 = [1, 0, 0];
const N_EAST: V3 = [-1, 0, 0];
const N_NORTH: V3 = [0, 0, -1];
const N_UP: V3 = [0, 1, 0];

/** around a vertical axis: dir 0–7 from east (left) to west (right), lifted by `up` */
function around(dir: number, up: number): V3 {
  const th = ((dir + 0.5) / 8 - 0.5) * Math.PI; // -90° east .. +90° west
  const cu = Math.cos(up);
  return [Math.sin(th) * cu, Math.sin(up), -Math.cos(th) * cu];
}

type Light = {
  i: Interp;
  /** the sun's direction */
  d: V3;
  /** how much direct sun there is (0 below the horizon) */
  sunUp: number;
  /** twilight fill from the sun's side of the sky */
  fill: RGB;
  fd: V3;
  horizon: RGB;
  stars: number;
  windows: number;
  quayLamps: number;
  uplight: number;
};

function shadeLit(albedo: RGB, n: V3, L: Light, mul = 1): RGB {
  const ndl = Math.max(0, n[0] * L.d[0] + n[1] * L.d[1] + n[2] * L.d[2]) * L.sunUp;
  const ndf = Math.max(0, n[0] * L.fd[0] + n[1] * 0.3 + n[2] * L.fd[2]);
  const { amb, sun } = L.i;
  return [
    albedo[0] * (amb[0] + sun[0] * ndl + L.fill[0] * ndf) * mul,
    albedo[1] * (amb[1] + sun[1] * ndl + L.fill[1] * ndf) * mul,
    albedo[2] * (amb[2] + sun[2] * ndl + L.fill[2] * ndf) * mul,
  ];
}

const FACE_MUL = [1, 0.9, 0.78, 0.66];

function colourOf(code: number, L: Light): RGB {
  const mat = (code >> 4) & 63;
  const s = code & 15;
  const fl = code >> 10;
  let c: RGB;
  switch (mat) {
    case MAT.STAR: {
      const base = skyAt(L, s / 15);
      return mix(base, STAR_INK, L.stars * (0.18 + (fl / 7) * 0.82));
    }
    case MAT.CLOUD: {
      const [lit, body, shade] = L.i.cloud;
      // by day the tops are lit; below the horizon the bellies catch the light
      const under = L.sunUp < 0.5;
      const t = s / 3;
      c = under ? mix(body, lit, t) : mix(lit, shade, t);
      return mix(c, skyAt(L, 0.4), 0.25);
    }
    case MAT.RANGE:
    case MAT.SNOW: {
      const facing = s >> 2;
      const haze = s & 3;
      const n: V3 = facing === 0 ? [-0.7, 0.45, -0.55] : [0.7, 0.45, -0.55];
      c = shadeLit(mat === MAT.SNOW ? [242, 242, 238] : [120, 132, 150], n, L);
      return mix(c.map((v) => v * EXPOSURE) as RGB, L.horizon, 0.5 + haze * 0.12);
    }
    case MAT.FAR: {
      const sil = shadeLit(BRICK_DEEP, N_NORTH, L, 0.8).map((v) => v * EXPOSURE) as RGB;
      return mix(sil, L.horizon, s === 0 ? 0.38 : 0.3);
    }
    case MAT.FARWATER:
      return mix(L.horizon, L.i.water, 0.22 + s * 0.13);
    case MAT.FACADE_W:
      c = shadeLit(BRICK, N_WEST, L, FACE_MUL[s & 3]);
      break;
    case MAT.FACADE_E:
      c = shadeLit(BRICK, N_EAST, L, FACE_MUL[s & 3]);
      break;
    case MAT.FACADE_N:
      c = shadeLit(BRICK, N_NORTH, L, FACE_MUL[s & 3]);
      break;
    case MAT.ROOF:
      c = shadeLit(ROOF, [0, 0.8, -0.6], L, s ? 0.85 : 1);
      break;
    case MAT.STONE:
      c = shadeLit(STONE, s === 0 ? N_UP : N_NORTH, L, s === 2 ? 0.8 : 1);
      break;
    case MAT.COPPER:
      c = shadeLit(COPPER, around(s & 7, s & 8 ? 0.85 : 0.3), L);
      break;
    case MAT.DRUM:
      c = shadeLit(DRUM, around(s & 7, 0), L);
      break;
    case MAT.LEAF: {
      const side = s >> 2;
      const n: V3 = side === 0 ? [-0.8, 0.35, -0.5] : side === 1 ? [0, 0.9, -0.45] : [0.8, 0.35, -0.5];
      c = shadeLit(LEAF, n, L, [1, 0.85, 0.7, 0.56][s & 3]);
      break;
    }
    case MAT.TRUNK:
      c = shadeLit(TRUNK, N_NORTH, L);
      break;
    case MAT.WINDOW: {
      if (s / 15 < L.windows) return s & 1 ? WARM : WARM2;
      c = mix(shadeLit(GLASS, N_NORTH, L), L.horizon, 0.18);
      break;
    }
    case MAT.DARK:
      c = shadeLit(DARK, N_NORTH, L, s ? 1.3 : 1);
      break;
    case MAT.BRIDGE: {
      c = shadeLit(BRICK, N_NORTH, L, [1, 0.94, 0.86, 0.76][s & 3]);
      // at night the Pont Neuf is lit from below, warmer toward the water
      const u = L.uplight * (0.35 + (s / 3) * 0.65);
      c = [c[0] + BRICK[0] * UPLIGHT[0] * u, c[1] + BRICK[1] * UPLIGHT[1] * u, c[2] + BRICK[2] * UPLIGHT[2] * u];
      break;
    }
    case MAT.LAMP:
      return s === 1 ? mix(LAMP_OFF, LAMP_ON, L.quayLamps) : LAMP_OFF;
    default:
      c = [255, 0, 255];
  }
  return tone([c[0] * EXPOSURE, c[1] * EXPOSURE, c[2] * EXPOSURE]);
}

function skyAt(L: Light, t: number): RGB {
  const st = L.i.sky;
  const f = c01(t) * 4;
  const j = Math.min(3, Math.floor(f));
  return mix(st[j], st[j + 1], f - j);
}

/** what the river does to whatever it reflects */
function inWater(c: RGB, fl: number, L: Light): RGB {
  let o = mix(c, L.i.water, fl & 4 ? 0.52 : 0.34);
  if (fl & 2) o = mix(o, L.horizon, 0.16);
  return o;
}

/** a soft shoulder: lit brick glows instead of clipping to flat orange */
const TONE = new Uint8Array(1024);
for (let v = 0; v < 1024; v++) TONE[v] = v < 180 ? v : Math.round(180 + 75 * (1 - Math.exp(-(v - 180) / 75)));
const tone = (c: RGB): RGB => [TONE[c[0] < 0 ? 0 : c[0] > 1023 ? 1023 : c[0] | 0], TONE[c[1] < 0 ? 0 : c[1] > 1023 ? 1023 : c[1] | 0], TONE[c[2] < 0 ? 0 : c[2] > 1023 ? 1023 : c[2] | 0]];

const pack = (c: RGB) =>
  ((255 << 24) |
    ((c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2] | 0) << 16) |
    ((c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1] | 0) << 8) |
    (c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0] | 0)) >>>
  0;

/* ───────────────────────────── relight ───────────────────────────── */

export type Sky = {
  /** the instant to light the city for */
  ms: number;
  /** how many of the Pont Neuf's lamps are lit, from the Daurade side */
  lamps: number;
  /** draw the sun, moon and glitter (off where a sprite is the sun instead) */
  bodies?: boolean;
};

const pal = new Uint32Array(8192);
const skyTab = new Uint32Array(8 * 16 * 5);

/** Where a body at (elevation, azimuth) sits on screen, in art pixels. */
export function bodyXY(city: City, elevation: number, azimuth: number) {
  return project(city, elevation, azimuth);
}

/** Lamps lit at an instant with nothing animating: all after civil dusk, none by day. */
export function lampsAt(ms: number, city: City) {
  return sunAt(ms).elevation < -6 ? city.lamps.length : 0;
}

/** Relight the city into `out` (RGBA as little-endian uint32). */
export function relight(city: City, sky: Sky, out: Uint32Array) {
  const { W, H, idx, vig, yw, hz } = city;
  const sun = sunAt(sky.ms);
  const moon = moonAt(sky.ms);
  const e = sun.elevation;
  const morning = sun.hourAngle < 0;
  const i = interp(morning ? MORNING : EVENING, e);
  const az = (sun.azimuth * Math.PI) / 180;
  const el = (e * Math.PI) / 180;
  const d: V3 = [-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  // after sunset the western sky still lights west faces, rose then violet
  const tw = smoothstep(-10, -1, e) * (1 - smoothstep(1, 6, e));
  const fill: RGB = [0.34 * tw, 0.2 * tw, 0.18 * tw];
  const hn = Math.hypot(d[0], d[2]) || 1;
  const L: Light = {
    i,
    d,
    sunUp: smoothstep(-1.2, 2.5, e),
    fill,
    fd: [d[0] / hn, 0, d[2] / hn],
    horizon: i.sky[4],
    stars: 1 - smoothstep(-13, -4, e),
    windows: (1 - smoothstep(-8, 3, e)) * 0.5 + 0.04 * (1 - smoothstep(6, 12, e)),
    quayLamps: 1 - smoothstep(-5, -1, e),
    uplight: city.lamps.length ? (Math.min(sky.lamps, city.lamps.length) / city.lamps.length) * 0.55 : 0,
  };

  // the palette, only for codes in use
  const codes = city.codes;
  for (let k = 0; k < codes.length; k++) {
    const c = codes[k];
    const mat = (c >> 4) & 63;
    if (mat === MAT.SKY) continue;
    const fl = c >> 10;
    const base = colourOf(c & (mat === MAT.STAR ? 0xffff : 0x3ff), L);
    pal[c] = pack(mat !== MAT.STAR && fl & 1 ? inWater(base, fl, L) : base);
  }
  // the sky: band × glow level, plain and in the water
  const glowC = i.glow;
  for (let fl = 0; fl < 8; fl++) {
    for (let band = 0; band < 16; band++) {
      const base = skyAt(L, band / 15);
      for (let g = 0; g < 5; g++) {
        let c = mix(base, glowC, (g / 4) * i.glowAmt);
        if (fl & 1) c = inWater(c, fl, L);
        skyTab[((fl << 4) | band) * 5 + g] = pack(c);
      }
    }
  }

  // glow geometry: pooled on the horizon toward the sun, or over the city at night
  const body = bodyXY(city, e, sun.azimuth);
  const night = e < -9;
  const gxC = night ? W * 0.5 : body.x;
  const spread = W * (night ? 0.42 : e > 15 ? 0.6 : 0.4);
  const gx = new Float32Array(W);
  for (let x = 0; x < W; x++) gx[x] = Math.exp(-(((x - gxC) / spread) ** 2));
  const gy = new Float32Array(H);
  for (let y = 0; y < H; y++) gy[y] = y >= hz ? 1 : Math.pow(c01(1 - (hz - y) / (H * 0.5)), 2.2);

  const vr = VIG[0];
  const vg = VIG[1];
  const vb = VIG[2];
  let p = 0;
  for (let y = 0; y < H; y++) {
    const by = (y & 3) << 2;
    for (let x = 0; x < W; x++, p++) {
      const c = idx[p];
      let col: number;
      if ((c & 0x3f0) === 0) {
        const fl = c >> 10;
        let row = y;
        if (fl & 1) {
          row = 2 * yw[x] - y;
          if (row < 0) row = 0;
        }
        const g = Math.floor(gx[x] * gy[row] * 4 + B4[by | (x & 3)]);
        col = skyTab[((fl << 4) | (c & 15)) * 5 + (g > 4 ? 4 : g)];
      } else col = pal[c];
      const v = vig[p];
      if (v) {
        const a = v / 15;
        const r = col & 255;
        const gg = (col >> 8) & 255;
        const bb = (col >> 16) & 255;
        col =
          ((255 << 24) | (((bb + (vb - bb) * a) | 0) << 16) | (((gg + (vg - gg) * a) | 0) << 8) | ((r + (vr - r) * a) | 0)) >>> 0;
      }
      out[p] = col;
    }
  }

  // the moon, then the sun, behind the city (only sky pixels take them);
  // a moon too close to new is lost in the glare
  if (sky.bodies !== false) {
    const mb = bodyXY(city, moon.elevation, moon.azimuth);
    if (moon.elevation > -2 && moon.lit > 0.08) drawMoon(city, out, mb.x, mb.y, moon.phase, 1 - smoothstep(-2, 10, e) * 0.62);
    if (e > -2.5) drawSun(city, out, body.x, body.y, e, i);
    // the glitter path on the river under whichever is up
    if (e > -1.5) glitter(city, out, body.x, e > 12 ? hex("#f6f4e6") : mix(i.glow, [255, 240, 210], 0.4), e > 12 ? 0.6 : 0.85, 1.4);
    else if (moon.elevation > 0 && e < -6) glitter(city, out, mb.x, hex("#eae6d4"), 0.25 + 0.55 * moon.lit, 1);
  }

  // the Pont Neuf's lamps, and their streaks on the water
  const n = Math.min(sky.lamps, city.lamps.length);
  for (let k = 0; k < n; k++) {
    const l = city.lamps[k];
    setPx(city, out, l.x, l.y, LAMP_ON, 1);
    setPx(city, out, l.x, l.y - 1, WARM, 0.35);
    if (l.ry >= 0) {
      setPx(city, out, l.x, l.ry, WARM, 0.75);
      setPx(city, out, l.x, l.ry + 1, WARM2, 0.5);
      setPx(city, out, l.x, l.ry + 3, WARM2, 0.25);
    }
  }
}

function setPx(city: City, out: Uint32Array, x: number, y: number, c: RGB, a: number) {
  if (x < 0 || y < 0 || x >= city.W || y >= city.H) return;
  const p = y * city.W + x;
  const o = out[p];
  const r = o & 255;
  const g = (o >> 8) & 255;
  const b = (o >> 16) & 255;
  out[p] = pack([r + (c[0] - r) * a, g + (c[1] - g) * a, b + (c[2] - b) * a]);
}

const isSkyAt = (city: City, x: number, y: number) => {
  const m = (city.idx[y * city.W + x] >> 4) & 63;
  return !(city.idx[y * city.W + x] & WATER) && (m === MAT.SKY || m === MAT.STAR || m === MAT.CLOUD);
};

function drawSun(city: City, out: Uint32Array, bx: number, by: number, e: number, i: Interp) {
  const { W, H, S } = city;
  const r = Math.max(2, Math.round(S * 0.027));
  const R = r * 5;
  const low = 1 - smoothstep(2, 20, e);
  const core = mix(hex("#fffbe6"), hex("#ffe0b0"), low);
  const rim = mix(hex("#ffe49a"), hex("#f2a060"), low);
  const halo = i.glow;
  const cx = Math.round(bx);
  const cy = Math.round(by);
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || !isSkyAt(city, x, y)) continue;
      const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
      if (d <= r) setPx(city, out, x, y, d > r - 1.1 ? rim : core, 1);
      else if (d < r + 1.6) setPx(city, out, x, y, halo, 0.42);
      else if (d < r + 3.4) setPx(city, out, x, y, halo, 0.2);
      else if (d < R) {
        const a = Math.pow(1 - (d - r - 3.4) / (R - r - 3.4), 2.2) * 0.9;
        if (a * 4 > B4[((y & 3) << 2) | (x & 3)] * 4 + 0.5) setPx(city, out, x, y, halo, 0.12);
      }
    }
  }
}

function drawMoon(city: City, out: Uint32Array, bx: number, by: number, phase: number, alpha: number) {
  const { W, H, S } = city;
  const r = Math.max(2, Math.round(S * 0.019));
  const ph = phase < 0.12 ? 0.12 : phase > 0.88 ? 0.88 : phase;
  const k = Math.cos(2 * Math.PI * ph);
  const waxing = ph < 0.5;
  const core = hex("#efeee4");
  const rim = hex("#c9c6b0");
  const dark = hex("#18201f");
  const cx = Math.round(bx);
  const cy = Math.round(by);
  const lit = (1 - k) / 2;
  for (let y = cy - r - 3; y <= cy + r + 3; y++) {
    for (let x = cx - r - 3; x <= cx + r + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || !isSkyAt(city, x, y)) continue;
      const nx = (x + 0.5 - bx) / r;
      const ny = (y + 0.5 - by) / r;
      const n2 = nx * nx + ny * ny;
      if (n2 > 1) {
        const dd = Math.sqrt(n2) * r - r;
        if (dd < 1.6) setPx(city, out, x, y, core, 0.16 * lit * alpha);
        continue;
      }
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      const on = waxing ? nx > k * half : nx < -k * half;
      if (!on) {
        setPx(city, out, x, y, dark, 0.85 * alpha);
        continue;
      }
      setPx(city, out, x, y, n2 > 0.72 ? rim : core, alpha);
    }
  }
}

function glitter(city: City, out: Uint32Array, bx: number, c: RGB, power: number, big: number) {
  const { W, H, yw } = city;
  if (bx < -W * 0.1 || bx > W * 1.1) return;
  for (let y = city.hz + 2; y < H; y += 2) {
    const half = (1.2 + (y - city.hz) * 0.16) * big;
    for (let x = Math.floor(bx - half); x <= bx + half; x++) {
      if (x < 0 || x >= W || y < yw[x] + 1) continue;
      const off = Math.abs(x + 0.5 - bx) / half;
      if (off > 1) continue;
      const h = Math.imul((x >> 1) * 374761393 + y * 668265263, 1274126177) >>> 0;
      if (h / 4294967296 > 0.25 + (1 - off) * 0.5) continue;
      setPx(city, out, x, y, c, (0.85 - off * 0.55) * power * (1 - ((y - city.hz) / (H - city.hz)) * 0.4));
    }
  }
}


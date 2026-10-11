/**
 * The Writing plate: a tiny pixel world per post, seeded by its slug. A
 * Bayer-dithered sky in one of the four emOS phases, stars or clouds, a
 * low sun or moon over three ranges of pixel hills, a warm window on the
 * middle ridge, and a dithered fade into the glass at the bottom so the
 * title can sit on it.
 *
 * It is painted once per size as depth layers (sky, sun, far, mid, near),
 * one canvas cell per art pixel so everything shares one grid.
 * `composite()` stacks them with each layer offset by whole cells in
 * proportion to its depth: the parallax moves in pixel steps, never in
 * blurry sub-cell slides.
 */

type RGB = [number, number, number];
type Phase = "night" | "dawn" | "day" | "dusk";

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

const PHASES: Record<Phase, { sky: string[]; far: string; mid: string; near: string; rim: string; glow: string; stars: number }> = {
  night: { sky: ["#040607", "#0a1314", "#152626", "#1f3533"], far: "#1d2e2c", mid: "#111d1b", near: "#060a09", rim: "#3f5a50", glow: "#2c4440", stars: 1 / 60 },
  dawn: { sky: ["#0a1213", "#20302f", "#5e6a62", "#d6b48c"], far: "#4a5650", mid: "#26332e", near: "#0b130f", rim: "#b39a80", glow: "#9a8a6e", stars: 1 / 170 },
  day: { sky: ["#16252a", "#2b4249", "#557379", "#a9bdb9"], far: "#3e5c58", mid: "#22402f", near: "#0b1a11", rim: "#86a1a2", glow: "#6f8f8a", stars: 0 },
  dusk: { sky: ["#07090c", "#1b2228", "#4b4a4f", "#c98762"], far: "#3b3a3c", mid: "#1d2425", near: "#070c0a", rim: "#a36f5c", glow: "#7c5a4e", stars: 1 / 130 },
};
const PHASE_ORDER: Phase[] = ["night", "dusk", "dawn", "night", "day"];

const STAR_INKS = ["#ebe9e1", "#ebe9e1", "#bcc2ba", "#89b4a8", "#aea3c8"].map(hex);
const EMBER = hex("#e0bd6e");
const EMBER_SOFT = hex("#ffe2b8");
const CLOUD = hex("#e3ebe7");

/** Spare cells painted past each side of a moving layer: the largest shift. */
export const PLATE_MARGIN = 6;
/** Cells per unit of shift, by layer (sun, far, mid, near): near moves most. */
const DEPTHS = [0.5, 1, 2, 3];
/** The largest |shift| `composite` honours (near layer: 3 × 2 = the margin). */
export const MAX_SHIFT = PLATE_MARGIN / DEPTHS[DEPTHS.length - 1];

export type PlateLayers = {
  W: number;
  H: number;
  /** opaque W×H: sky, halo, stars or clouds */
  sky: Uint8ClampedArray;
  /** (W + 2·margin)×H, transparent outside their shapes, back to front */
  layers: Uint8ClampedArray[];
  /** rows of dithered fade at the bottom */
  fade: number;
  /** where the sun (or moon) sits, in cells */
  sun: { x: number; y: number };
};

function seed32(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise with two octaves, 0..1. */
function ridge(rng: () => number, width: number, period: number) {
  const n = Math.ceil(width / period) + 3;
  const a = Array.from({ length: n }, rng);
  const b = Array.from({ length: n * 3 }, rng);
  const at = (pts: number[], x: number, p: number) => {
    const i = Math.floor(x / p);
    const f = x / p - i;
    const s = f * f * (3 - 2 * f);
    return pts[i] * (1 - s) + pts[i + 1] * s;
  };
  return (x: number) => at(a, x, period) * 0.72 + at(b, x, period / 3) * 0.28;
}

/** A pixel writer over one RGBA buffer: source-over, alpha 0..1. */
function writer(d: Uint8ClampedArray, w: number, h: number) {
  return (x: number, y: number, c: RGB, a = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
    const i = (y * w + x) * 4;
    const da = d[i + 3] / 255;
    if (a >= 1 || da <= 0) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = Math.max(d[i + 3], Math.round(Math.min(1, a) * 255));
      return;
    }
    const oa = a + da * (1 - a);
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  };
}

/** Paint a W×H-cell plate for a seed, as depth layers. */
export function paintPlateLayers(seed: string, W: number, H: number): PlateLayers {
  const M = PLATE_MARGIN;
  const LW = W + 2 * M;
  const rng = mulberry32(seed32(`plate:${seed}`));
  const phase = PHASE_ORDER[Math.floor(rng() * PHASE_ORDER.length)];
  const P = PHASES[phase];
  const skyInk = P.sky.map(hex);
  const horizon = Math.round(H * (0.6 + rng() * 0.06));

  const sky = new Uint8ClampedArray(W * H * 4);
  const putSky = writer(sky, W, H);
  const layer = () => new Uint8ClampedArray(LW * H * 4);
  const planetL = layer();
  const farL = layer();
  const midL = layer();
  const nearL = layer();
  // layer writers take sky coordinates; the margin is added here
  const at = (d: Uint8ClampedArray) => {
    const put = writer(d, LW, H);
    return (x: number, y: number, c: RGB, a = 1) => put(x + M, y, c, a);
  };
  const putPlanet = at(planetL);
  const putFar = at(farL);
  const putMid = at(midL);
  const putNear = at(nearL);

  // sky: dithered bands from zenith to a little below the horizon
  const skyEnd = horizon + 6;
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / skyEnd) * (skyInk.length - 1);
    const i = Math.min(skyInk.length - 2, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < W; x++) putSky(x, y, f > bayer(x, y) ? skyInk[i + 1] : skyInk[i]);
  }

  // the sun (or moon): right of centre, high enough to clear the hills
  const cx = Math.round(W * (0.6 + rng() * 0.16));
  const cy = Math.round(Math.max(30, horizon * (0.42 + rng() * 0.14)));

  // a dithered halo around it, so it reads as lit from within the sky
  const glow = hex(P.glow);
  const R = 58;
  for (let y = Math.max(0, cy - R); y < Math.min(horizon + 4, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x++) {
      const r = Math.hypot(x - cx, (y - cy) * 1.08) / R;
      if (r >= 1) continue;
      const k = (1 - r) * (1 - r) * 0.9;
      if (k > bayer(x + 1, y + 2)) putSky(x, y, glow, 0.45);
    }
  }

  // stars (dark phases) or a few flat pixel clouds (day)
  if (P.stars > 0) {
    const n = Math.round(W * horizon * P.stars);
    for (let s = 0; s < n; s++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(Math.pow(rng(), 1.5) * horizon * 0.8);
      if (Math.hypot(x - cx, y - cy) < 36) continue;
      const ink = STAR_INKS[Math.floor(rng() * STAR_INKS.length)];
      putSky(x, y, ink, 0.45 + rng() * 0.55);
      if (rng() > 0.93) {
        // the odd bright one gets a cross
        putSky(x - 1, y, ink, 0.35);
        putSky(x + 1, y, ink, 0.35);
        putSky(x, y - 1, ink, 0.35);
        putSky(x, y + 1, ink, 0.35);
      }
    }
  } else {
    const clouds = 3 + Math.floor(rng() * 3);
    for (let c = 0; c < clouds; c++) {
      const w = 10 + Math.floor(rng() * 22);
      const x0 = Math.floor(rng() * (W - w));
      const y0 = Math.floor(horizon * (0.12 + rng() * 0.55));
      for (let row = 0; row < 3; row++) {
        const inset = row === 0 ? Math.floor(w * 0.25) : row === 2 ? 2 : 0;
        for (let x = x0 + inset; x < x0 + w - inset; x++) putSky(x, y0 + row, CLOUD, row === 2 ? 0.28 : 0.42);
      }
    }
  }

  // the sun or moon: a small dithered disc
  const disc = hex(P.stars > 0 && P.sky[0] === PHASES.night.sky[0] ? "#e9e6d8" : "#f1d79a");
  const DR = 8;
  for (let y = -DR; y <= DR; y++) {
    for (let x = -DR; x <= DR; x++) {
      const r = Math.hypot(x, y) / DR;
      if (r > 1) continue;
      putPlanet(cx + x, cy + y, disc, r > 0.82 ? (r - 0.82 < bayer(x + 8, y + 8) * 0.18 ? 1 : 0.5) : 1);
    }
  }

  // three ranges of hills, far to near, painted past both edges so a
  // shifted layer never shows its end
  const ranges: { base: number; amp: number; period: number; color: RGB; put: typeof putFar; rim?: RGB }[] = [
    { base: horizon - 2, amp: Math.max(8, H * 0.16), period: 34 + rng() * 26, color: hex(P.far), put: putFar, rim: hex(P.rim) },
    { base: horizon + Math.round(H * 0.08), amp: Math.max(6, H * 0.1), period: 22 + rng() * 14, color: hex(P.mid), put: putMid },
    { base: horizon + Math.round(H * 0.2), amp: Math.max(5, H * 0.08), period: 16 + rng() * 10, color: hex(P.near), put: putNear },
  ];
  /** ridge tops per range, indexed by x + M */
  const tops: Int16Array[] = [];
  for (const r of ranges) {
    const n = ridge(rng, LW, r.period);
    const top = new Int16Array(LW);
    for (let lx = 0; lx < LW; lx++) {
      // pixel-art hills move in whole steps
      const h = Math.round(r.base - n(lx) * r.amp);
      top[lx] = h;
      for (let y = Math.max(0, h); y < H; y++) r.put(lx - M, y, r.color);
      if (r.rim && h >= 0) r.put(lx - M, h, r.rim, 0.55);
    }
    tops.push(top);
  }

  // pines along the middle ridge, in the near colour
  const mid = tops[1];
  const front = tops[2];
  const near = hex(P.near);
  const trees = Math.floor(LW / 22);
  for (let k = 0; k < trees; k++) {
    const x = Math.floor(rng() * LW) - M;
    const h = 3 + Math.floor(rng() * 4);
    const y0 = mid[x + M];
    for (let j = 0; j < h; j++) {
      const half = Math.min(2, Math.floor(j / 2));
      for (let dx = -half; dx <= half; dx++) putMid(x + dx, y0 - h + j + 1, near);
    }
  }

  // somebody's home: a warm window or two on the middle ridge, right of
  // the copy (the tag and date sit on the plate's left foot) and high
  // enough to stay clear of it at every width
  const lights = rng() > 0.4 ? 2 : 1;
  const ceiling = Math.floor(H * 0.66);
  for (let k = 0; k < lights; k++) {
    for (let tries = 0; tries < 6; tries++) {
      const x = Math.floor(W * (0.62 + rng() * 0.3));
      const y = mid[x + M] + 2 + Math.floor(rng() * 2);
      // only where the middle ridge shows above the near one
      if (y > Math.min(front[x + M], front[x + M + 1]) - 2 || y > ceiling) continue;
      putMid(x, y, EMBER);
      putMid(x + 1, y, EMBER_SOFT);
      putMid(x, y - 1, EMBER, 0.35);
      putMid(x + 1, y - 1, EMBER, 0.35);
      break;
    }
  }

  return { W, H, sky, layers: [planetL, farL, midL, nearL], fade: Math.max(6, Math.round(H * 0.22)), sun: { x: cx, y: cy } };
}

/** Whole-cell offsets of each layer for a shift (symmetric rounding). */
export function layerOffsets(shift: number): number[] {
  const s = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, shift));
  return DEPTHS.map((d) => {
    const v = d * s;
    return Math.sign(v) * Math.floor(Math.abs(v) + 0.5);
  });
}

/** Stack the layers into `out` (W×H RGBA) at the given whole-cell offsets. */
export function composite(L: PlateLayers, offsets: number[], out: Uint8ClampedArray) {
  const { W, H, sky, layers, fade } = L;
  const M = PLATE_MARGIN;
  const LW = W + 2 * M;
  out.set(sky);
  for (let k = 0; k < layers.length; k++) {
    const src = layers[k];
    const dx = M - (offsets[k] ?? 0);
    for (let y = 0; y < H; y++) {
      let o = y * W * 4;
      let s = (y * LW + dx) * 4;
      for (let x = 0; x < W; x++, o += 4, s += 4) {
        const a = src[s + 3];
        if (a === 0) continue;
        if (a === 255) {
          out[o] = src[s];
          out[o + 1] = src[s + 1];
          out[o + 2] = src[s + 2];
          continue;
        }
        const f = a / 255;
        out[o] += (src[s] - out[o]) * f;
        out[o + 1] += (src[s + 1] - out[o + 1]) * f;
        out[o + 2] += (src[s + 2] - out[o + 2]) * f;
      }
    }
  }
  // dithered fade into the glass along the bottom edge (fixed to the frame)
  for (let y = H - fade; y < H; y++) {
    const keep = (H - y) / fade;
    for (let x = 0; x < W; x++) {
      out[(y * W + x) * 4 + 3] = bayer(x, y) >= keep ? 0 : 255;
    }
  }
}

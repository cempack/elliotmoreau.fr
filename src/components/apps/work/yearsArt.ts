/**
 * The Years view's picture: a dusk over mountain ranges, one range per
 * project, its peaks the weeks with the most commits. Ranges stand one
 * behind another (the busiest in front), hazier the further back; a low
 * sun lights their left-facing slopes, each ridge catches the light in its
 * project's language colour, and the busiest weeks of the year carry snow.
 *
 * `layoutYears` turns the weeks into ridge lines once per size;
 * `paintYears` paints them with a selection and a scrubbed week, in whole
 * cells, quickly enough to follow a pointer.
 */

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/* dusk, from the zenith to the horizon */
const SKY = ["#13132a", "#1d1b36", "#2c2542", "#46344f", "#6c4c60", "#8f626c"].map(hex);
const FRONT = hex("#18212b");
const HAZE = hex("#7d5d6b");
const SUN = hex("#f6c983");
const SUN_CORE = hex("#fbe3b0");
const SNOW = hex("#ebe7f2");
const STAR = hex("#e9e6f5");
const MARK = hex("#f4efe6");

export const WEEKS = 52;

export type YearsLayout = {
  W: number;
  H: number;
  /** the x (in cells) of each week's middle */
  xs: number[];
  /** ridge tops per range (front first), one per column */
  tops: Int16Array[];
  /** per range and column: the snow's depth there (0 for none) */
  snow: Uint8Array[];
  /** per range and column: how far the ridge stands above its foothills */
  heights: Float32Array[];
  /** the sky's horizon row, the sun, the stars */
  horizon: number;
  sun: { x: number; y: number; r: number };
  stars: { x: number; y: number; a: number }[];
};

/**
 * Lay the ranges out for a W×H-cell stage. `ranges` is front first; their
 * weeks share one scale, so a busy project stands taller than a quiet one.
 */
export function layoutYears(ranges: { weeks: number[] }[], W: number, H: number, compact: boolean): YearsLayout {
  const pad = 2;
  const pitch = (W - pad * 2) / WEEKS;
  const xs = Array.from({ length: WEEKS }, (_, w) => pad + (w + 0.5) * pitch);
  const vmax = Math.max(1, ...ranges.flatMap((r) => r.weeks));
  // on phones the summits keep below the card that reads the picture
  const top = Math.round(H * (compact ? 0.34 : 0.16));
  // the ranges step back up the stage; on phones they stand closer together
  const step = H * (compact ? 0.06 : 0.08);
  // alpine slopes: a peak's base is as wide as its height allows
  const slope = compact ? 1.15 : 1.35;
  const tops: Int16Array[] = [];
  const snow: Uint8Array[] = [];
  const heights: Float32Array[] = [];
  ranges.forEach((r, k) => {
    const base = H - 2 - k * step;
    const amp = (base - top) * (1 - k * 0.07);
    const ridge = new Int16Array(W);
    const caps = new Uint8Array(W);
    const hs = new Float32Array(W);
    const seed = (k + 1) * 7919;
    const peaks = r.weeks.map((v) => (v ? amp * Math.pow(v / vmax, 0.72) : 0));
    for (let x = 0; x < W; x++) {
      // rolling foothills where nothing happened
      const f = 2.5 + 3.5 * (0.5 + 0.5 * Math.sin(x * 0.07 + k * 1.7) * Math.cos(x * 0.023 + k * 0.6));
      let h = f;
      let peakV = 0;
      for (let w = 0; w < WEEKS; w++) {
        const hv = peaks[w] - Math.abs(x - xs[w]) * slope;
        if (hv > h) {
          h = hv;
          peakV = r.weeks[w];
        }
      }
      // a little rock: the slopes step unevenly
      if (h > f + 3 && hash(seed + x) > 0.8) h += hash(seed + x * 3) > 0.5 ? 1 : -1;
      hs[x] = h - f;
      ridge[x] = Math.round(base - h);
      // snow on the year's busiest weeks, deeper the busier, only near the summit
      const s = peakV / vmax;
      const summit = peaks[r.weeks.indexOf(peakV)] - h < amp * 0.12;
      caps[x] = s > 0.55 && summit ? Math.max(1, Math.round((s - 0.5) * 9)) : 0;
    }
    tops.push(ridge);
    snow.push(caps);
    heights.push(hs);
  });
  const horizon = Math.round(H * 0.72);
  const sunR = Math.max(3, Math.round(H * 0.06));
  const stars: YearsLayout["stars"] = [];
  const count = Math.round((W * H) / 260);
  for (let i = 0; i < count; i++) {
    const y = Math.floor(Math.pow(hash(i * 13 + 5), 1.6) * horizon * 0.7);
    stars.push({ x: Math.floor(hash(i * 31 + 1) * W), y, a: 0.35 + 0.65 * hash(i * 7 + 3) });
  }
  return { W, H, xs, tops, snow, heights, horizon, sun: { x: Math.round(W * (compact ? 0.3 : 0.5)), y: Math.round(H * (compact ? 0.5 : 0.38)), r: sunR }, stars };
}

/**
 * Paint into `out` (W×H RGBA). `colors` are the ranges' language colours
 * (front first); `sel` is the selected range (or -1), `k` how far it has
 * come forward (0..1); `week` the scrubbed week (or -1).
 */
export function paintYears(L: YearsLayout, colors: string[], sel: number, k: number, week: number, out: Uint8ClampedArray) {
  const { W, H, tops, snow, heights, horizon } = L;
  const n = tops.length;
  const put = (x: number, y: number, c: RGB, a = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    if (a >= 1) {
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
    } else {
      out[i] += (c[0] - out[i]) * a;
      out[i + 1] += (c[1] - out[i + 1]) * a;
      out[i + 2] += (c[2] - out[i + 2]) * a;
    }
    out[i + 3] = 255;
  };

  // sky: dithered bands, down to the horizon and on behind the ranges
  const bands = SKY.length - 1;
  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / horizon) * bands;
    const i = Math.min(bands - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < W; x++) put(x, y, f > bayer(x, y) ? SKY[i + 1] : SKY[i]);
  }
  for (const s of L.stars) put(s.x, s.y, STAR, s.a * 0.8);

  // the low sun and its dithered halo
  const { x: sx, y: sy, r } = L.sun;
  const R = r * 4.2;
  for (let y = Math.max(0, Math.floor(sy - R)); y < Math.min(H, sy + R); y++)
    for (let x = Math.max(0, Math.floor(sx - R)); x < Math.min(W, sx + R); x++) {
      const d = Math.hypot(x - sx, y - sy) / R;
      if (d < 1 && (1 - d) * (1 - d) * 0.85 > bayer(x + 2, y + 1)) put(x, y, SUN, 0.38);
    }
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y) / r;
      if (d <= 1) put(sx + x, sy + y, d < 0.55 ? SUN_CORE : SUN);
    }

  // the ranges, back to front
  for (let j = n - 1; j >= 0; j--) {
    const depth = n > 1 ? j / (n - 1) : 0;
    let body = mix(FRONT, HAZE, depth * 0.78);
    const lang = hex(colors[j] ?? "#a7ad9c");
    const isSel = j === sel;
    if (sel >= 0) body = isSel ? mix(body, lang, 0.16 * k) : mix(body, HAZE, 0.22 * k * (1 - depth * 0.5));
    const lit = mix(body, SUN, 0.13);
    const rim = mix(lang, SUN, 0.25);
    const ridge = tops[j];
    const caps = snow[j];
    const hs = heights[j];
    for (let x = 0; x < W; x++) {
      const t0 = Math.max(0, ridge[x]);
      // a slope rising to the right faces the low sun on the left
      const facing = x > 0 && ridge[x] < ridge[x - 1] ? 1 : x + 1 < W && ridge[x + 1] > ridge[x] ? 0 : 0.5;
      const litDepth = Math.round((H - t0) * 0.35);
      for (let y = t0; y < H; y++) {
        const into = y - t0;
        const c = facing > 0 && into < litDepth && (into / litDepth) * (facing === 1 ? 1 : 1.6) < bayer(x, y) ? lit : body;
        put(x, y, c);
      }
      // snow on the busiest peaks
      const cap = caps[x];
      for (let y = 0; y < cap; y++) if (y === 0 || bayer(x, t0 + y) > y / (cap + 1)) put(x, t0 + y, SNOW, depth > 0.6 ? 0.7 : 1);
      // the peaks' ridges catch the light in the project's colour (the foothills don't: no lines)
      const rise = Math.min(1, Math.max(0, (hs[x] - 2) / 6));
      if (!cap && rise > bayer(x, t0)) put(x, t0, rim, (isSel ? 0.95 : 0.6 - depth * 0.2) * rise);
    }
  }

  // the scrubbed week: a dotted line down to the selected (or front) ridge, and a mark on it
  if (week >= 0 && week < L.xs.length) {
    const x = Math.round(L.xs[week]);
    const j = sel >= 0 ? sel : 0;
    const y1 = tops[j]?.[x] ?? H;
    for (let y = Math.round(H * 0.08); y < y1 - 2; y += 2) put(x, y, MARK, 0.7);
    put(x, y1 - 1, MARK);
    put(x - 1, y1, MARK);
    put(x + 1, y1, MARK);
    put(x, y1, MARK);
  }
}

/** The range under a point (in cells), front first; -1 in the sky. */
export function rangeAt(L: YearsLayout, x: number, y: number) {
  const cx = Math.max(0, Math.min(L.W - 1, Math.floor(x)));
  for (let j = 0; j < L.tops.length; j++) if (y >= L.tops[j][cx]) return j;
  return -1;
}

/** The week under an x (in cells). */
export function weekAt(L: YearsLayout, x: number) {
  const pitch = (L.W - 4) / WEEKS;
  return Math.max(0, Math.min(WEEKS - 1, Math.floor((x - 2) / pitch)));
}

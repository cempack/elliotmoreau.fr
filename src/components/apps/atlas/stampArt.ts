import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";
import type { RGB, SkyLight } from "@/components/os/wallpaper/light";

/**
 * A stamp, painted: the place's own sky at an instant (the wallpaper's sky
 * stops for that latitude and longitude, the sun or the moon at its true
 * height, stars after dark) over a calm landscape seeded by the place id
 * (rolling hills, a mountain line or a sea horizon, always the same one
 * for a place), its country code and value printed in the pixel font on
 * the paper margin, and, once the place has been visited, the postmark: a
 * round date-stamp and three wavy lines in ink, multiplied over whatever
 * it lands on. One unit is one art pixel; the stamp is drawn at two CSS
 * px a unit, so the lettering is never smaller than 10px caps. The
 * perforations are the CSS mask on the canvas's parent.
 */

/* ───────────────────────────── helpers ───────────────────────────── */

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const angleTo = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** FNV-1a: a place id to a 32-bit seed */
function seedOf(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** a 32-bit finaliser, so neighbouring ids land far apart */
function scramble(h: number) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
/** a fixed pseudo-random number in [0, 1) per (seed, n) */
function rnd(seed: number, n: number) {
  let h = Math.imul(seed ^ Math.imul(n, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ───────────────────────────── lettering ───────────────────────────── */

const GLYPH_W = 3;
const GLYPH_H = 5;
const TRACK = 1;
const SPACE = 2;

/** pixel caps never had accents: fold them, and the narrow spaces Intl uses */
export function pixelText(s: string) {
  let out = "";
  for (const raw of s.toUpperCase().replace(/[  ]/g, " ")) {
    const ch = PIXEL_FOLD[raw] ?? raw;
    if (ch === " " || PIXEL_GLYPHS[ch]) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** width of a line of pixel caps, in units */
export function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += (ch === " " ? SPACE : GLYPH_W) + TRACK;
  return Math.max(0, w - TRACK);
}

/** "7038" → "7 038": thousands apart by a thin pixel space, in either language */
export const groupDigits = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** The postmark's date, short, in the reader's language: "12 OCT 26". */
export function stampDate(ms: number, lang: "en" | "fr") {
  const s = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(ms);
  return pixelText(s.replace(/\./g, ""));
}

/** A name for the date-stamp: one line, or two at the most even word break. */
export function ringName(name: string, max = 32): string[] {
  const up = pixelText(name);
  if (textWidth(up) <= max || !up.includes(" ")) return [up];
  const words = up.split(" ");
  let best: string[] = [up];
  let score = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const s = Math.max(textWidth(a), textWidth(b));
    if (s < score) {
      score = s;
      best = [a, b];
    }
  }
  return best;
}

/* ───────────────────────────── layout ───────────────────────────── */

type Rect = { x: number; y: number; w: number; h: number };
type Text = { x: number; y: number; text: string };

export type StampLayout = {
  W: number;
  H: number;
  art: Rect;
  type: Text[];
  ring: { cx: number; cy: number; r: number; lines: Text[] } | null;
  waves: { x0: number; x1: number; rows: number[] } | null;
};

/**
 * Where everything goes on a W × H stamp. The code and the value share the
 * top margin when they fit (the value drops to the bottom margin when they
 * don't); a visited place gets the postmark. On a stamp wide enough, the
 * date-stamp's lettering sits on a band of paper under the picture, never
 * over it (it has to read at night too), its ring crossing into the
 * picture and its waves running off the right edge; on a smaller one the
 * waves alone cross the picture.
 */
export function layoutStamp(W: number, H: number, o: { code: string; value: string | null; ring: string[] | null; cancelled: boolean }): StampLayout {
  const m = W >= 56 ? 5 : W >= 44 ? 4 : 3;
  const textY = 3;
  const artY = textY + GLYPH_H + 2;
  const code = pixelText(o.code);
  const value = o.value ? pixelText(o.value) : null;
  const type: Text[] = [];
  let bottom = m;
  const cw = textWidth(code);
  // on the mid-size stamp the lettering may run a pixel past the picture
  const tm = W >= 44 && W < 56 ? m - 1 : m;
  if (!value) type.push({ x: Math.round((W - cw) / 2), y: textY, text: code });
  else {
    type.push({ x: tm, y: textY, text: code });
    const vw = textWidth(value);
    if (cw + 6 + vw <= W - 2 * tm) type.push({ x: W - tm - vw, y: textY, text: value });
    else {
      bottom = 3 + GLYPH_H + 2;
      type.push({ x: W - tm - vw, y: H - 3 - GLYPH_H, text: value });
    }
  }

  let ring: StampLayout["ring"] = null;
  if (o.ring && o.ring.length && W >= 44 && bottom === m) {
    const lines = o.ring.slice(0, 3);
    const bw = Math.max(...lines.map(textWidth));
    const bh = lines.length * GLYPH_H + (lines.length - 1) * 2;
    const top = H - 4 - bh;
    const r = Math.max(15, Math.ceil(Math.hypot(bw / 2, bh / 2) + 2.5));
    // the lettering starts just inside the perforations
    const cx = Math.max(m - 1 + Math.ceil(bw / 2), Math.ceil(r * 0.45));
    const cy = top + Math.floor(bh / 2);
    const artH = top - 2 - artY;
    if (bw <= W - 2 * (m - 1) && artH >= W * 0.5) {
      bottom = H - top + 2;
      ring = {
        cx,
        cy,
        r,
        lines: lines.map((t, i) => ({ x: cx - Math.floor(textWidth(t) / 2), y: top + i * (GLYPH_H + 2), text: t })),
      };
    }
  }
  const art: Rect = { x: m, y: artY, w: W - 2 * m, h: H - artY - bottom };

  let waves: StampLayout["waves"] = null;
  if (o.cancelled) {
    if (ring) {
      const gap = ring.lines.length > 1 ? 6 : 5;
      const mid = ring.cy - 2;
      waves = { x0: ring.cx + ring.r + 2, x1: W + 2, rows: [mid - gap, mid, mid + gap] };
    } else {
      const gap = Math.max(4, Math.round(art.h / 7));
      const y0 = art.y + Math.round(art.h * 0.22);
      waves = { x0: -2, x1: W + 2, rows: [y0, y0 + gap, y0 + 2 * gap] };
    }
  }
  return { W, H, art, type, ring, waves };
}

/* ───────────────────────────── painting ───────────────────────────── */

export type StampInks = {
  /** the stamp's paper (the CSS paper behind the perforations) */
  paper: string;
  /** the printed lettering */
  type: string;
};

/** the postmark's blue-black, multiplied over the paper and the picture */
const CANCEL: RGB = [34, 38, 52];
const STAR: RGB = [240, 236, 224];
const SNOW: RGB = [240, 242, 238];
const ROCK_NIGHT: RGB = [10, 13, 16];
const HILL_DAY: RGB = [74, 96, 70];
const SLATE_DAY: RGB = [56, 64, 78];
const SAND_DAY: RGB = [128, 112, 84];
const WATER_DAY: RGB = [40, 72, 84];
const WATER_NIGHT: RGB = [6, 10, 14];
/** the deepest a printed tone goes: a blue-black ink, not a black screen */
const PRINT_FLOOR: RGB = [20, 27, 38];

export type Land = "hills" | "mountains" | "sea";
/** the landscape a place always gets */
export const landOf = (id: string): Land => (["hills", "mountains", "sea"] as const)[scramble(seedOf(`${id}:scene`)) % 3];

/** Paint the stamp into `out` (W × H, RGBA as little-endian uint32). */
export function paintStamp(out: Uint32Array, lay: StampLayout, o: { id: string; L: SkyLight; inks: StampInks }) {
  const { W, H } = lay;
  const px = new Float32Array(W * H * 3);
  const paper = hex(o.inks.paper);
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = paper[0];
    px[i * 3 + 1] = paper[1];
    px[i * 3 + 2] = paper[2];
  }
  const set = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  vignette(lay.art, set, o.id, o.L, W);

  const type = hex(o.inks.type);
  for (const t of lay.type) letter(t, (x, y) => set(x, y, type));

  // the postmark: ink soaks into what's under it (multiply), a little uneven
  const seed = seedOf(`${o.id}:ink`);
  const ink = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    const a = 0.84 + 0.1 * rnd(seed, y * W + x);
    for (let k = 0; k < 3; k++) px[i + k] = px[i + k] * (1 - a) + ((px[i + k] * CANCEL[k]) / 255) * a;
  };
  if (lay.ring) {
    circle(lay.ring.cx, lay.ring.cy, lay.ring.r, ink);
    for (const t of lay.ring.lines) letter(t, ink);
  }
  if (lay.waves) for (const row of lay.waves.rows) wave(lay.waves.x0, lay.waves.x1, row, ink);

  for (let i = 0; i < W * H; i++) {
    out[i] =
      ((255 << 24) |
        (Math.max(0, Math.min(255, px[i * 3 + 2] | 0)) << 16) |
        (Math.max(0, Math.min(255, px[i * 3 + 1] | 0)) << 8) |
        Math.max(0, Math.min(255, px[i * 3] | 0))) >>>
      0;
  }
}

function letter(t: Text, put: (x: number, y: number) => void) {
  let x = t.x;
  for (const ch of t.text) {
    if (ch === " ") {
      x += SPACE + TRACK;
      continue;
    }
    const g = PIXEL_GLYPHS[ch];
    if (g) for (let r = 0; r < GLYPH_H; r++) for (let c = 0; c < GLYPH_W; c++) if (g[r][c] === "1") put(x + c, t.y + r);
    x += GLYPH_W + TRACK;
  }
}

/** a one-pixel ring (midpoint circle) */
function circle(cx: number, cy: number, r: number, put: (x: number, y: number) => void) {
  let x = r;
  let y = 0;
  let err = 1 - r;
  const seen = new Set<number>();
  const p = (a: number, b: number) => {
    const k = (b + 512) * 2048 + a + 512;
    if (seen.has(k)) return;
    seen.add(k);
    put(a, b);
  };
  while (x >= y) {
    p(cx + x, cy + y);
    p(cx + y, cy + x);
    p(cx - y, cy + x);
    p(cx - x, cy + y);
    p(cx - x, cy - y);
    p(cx - y, cy - x);
    p(cx + y, cy - x);
    p(cx + x, cy - y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

/** a cancel wave: one pixel thick, unbroken, a gentle swell a pixel either side of its row */
const WAVE = [0, -1, -1, -1, -1, 0, 1, 1, 1, 1];
function wave(x0: number, x1: number, row: number, put: (x: number, y: number) => void) {
  const n = WAVE.length;
  let prev = WAVE[((x0 % n) + n) % n];
  for (let x = x0; x <= x1; x++) {
    const d = WAVE[((x % n) + n) % n];
    put(x, row + d);
    // close the diagonal steps so the line reads as a stroke
    if (Math.abs(d - prev) > 0 && x > x0) put(x, row + prev);
    prev = d;
  }
}

/* ───────────────────────────── the picture ───────────────────────────── */

/**
 * The sky over the place, looking toward the sun (or the moon by night),
 * its height eased as the wallpaper eases it so a high sun still fits;
 * a clean gradient row by row through the five stops, warmed toward the
 * glow near the sun, then the land in front, hazier the further it is.
 */
function vignette(a: Rect, put: (x: number, y: number, c: RGB) => void, id: string, L: SkyLight, W: number) {
  // printed, not lit: the darkest tones come up to a deep ink, the way a
  // night scene on a stamp is still a colour on paper
  const lift = (x: number, y: number, c: RGB, k: number) =>
    put(x, y, [
      PRINT_FLOOR[0] * k + c[0] * (1 - (PRINT_FLOOR[0] * k) / 255),
      PRINT_FLOOR[1] * k + c[1] * (1 - (PRINT_FLOOR[1] * k) / 255),
      PRINT_FLOOR[2] * k + c[2] * (1 - (PRINT_FLOOR[2] * k) / 255),
    ]);
  const set = (x: number, y: number, c: RGB) => lift(x, y, c, 1);
  // the land takes less of it, so by night it still stands dark against the sky
  const setLand = (x: number, y: number, c: RGB) => lift(x, y, c, 0.45);
  const seed = seedOf(id);
  const land = landOf(id);
  const hy = a.y + Math.round(a.h * (land === "sea" ? 0.66 : 0.7));
  const sunEl = L.sun.elevation;
  const moonUp = sunEl < -1 && L.moon.elevation > 0 && L.moon.lit > 0.06;
  const fov = 100;
  const facing =
    (sunEl > -9 ? L.sun.azimuth : moonUp ? L.moon.azimuth : 180) + (rnd(seed, 1) - 0.5) * 36;
  const colOf = (az: number) => a.x + a.w / 2 + (angleTo(facing, az) / fov) * a.w;
  const big = W >= 56 ? 3 : W >= 40 ? 2.5 : 1.6;
  const rowOf = (el: number) => {
    const k = Math.min(1, Math.pow(Math.max(0, el) / 70, 0.75));
    return hy - 1 - k * (hy - 1 - (a.y + big + 2));
  };
  const skyAt = (t: number): RGB => {
    const f = Math.min(1, Math.max(0, t)) * 4;
    const j = Math.min(3, Math.floor(f));
    return mix(L.sky[j], L.sky[j + 1], f - j);
  };
  const horizonC = L.sky[4];
  const sunX = colOf(L.sun.azimuth);
  const glowOn = L.glowAmt * smooth(-14, -2, sunEl);

  // sky
  for (let y = a.y; y < hy; y++) {
    const t = (y - a.y + 0.5) / (hy - a.y);
    const row = skyAt(t);
    for (let x = a.x; x < a.x + a.w; x++) {
      const dx = (x + 0.5 - sunX) / (a.w * 0.5);
      const g = glowOn * Math.exp(-dx * dx) * Math.pow(t, 1.8);
      let c = g > 0.004 ? mix(row, L.glow, Math.min(0.85, g * 1.15)) : row;
      if (L.stars > 0.05 && y < hy - 4) {
        const n = rnd(seed, 1000 + y * 97 + x);
        if (n < 0.014 * L.stars) c = mix(c, STAR, (0.35 + 0.6 * rnd(seed, 5000 + y * 97 + x)) * L.stars);
      }
      set(x, y, c);
    }
  }

  // the sun, or the moon with its phase
  const disc = (cx: number, cy: number, r: number, paint: (x: number, y: number, nx: number, ny: number) => void) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if (x < a.x || x >= a.x + a.w || y < a.y || y >= hy) continue;
        const nx = (x + 0.5 - cx) / r;
        const ny = (y + 0.5 - cy) / r;
        if (nx * nx + ny * ny <= 1.08) paint(x, y, nx, ny);
      }
  };
  if (sunEl > -1.2) {
    const low = 1 - smooth(2, 22, sunEl);
    const core = mix(hex("#fff8e4"), hex("#ffd9a6"), low);
    const rim = mix(hex("#ffeab0"), hex("#f4a466"), low);
    const cy = sunEl >= 0 ? rowOf(sunEl) : hy - 1 + (-sunEl / 1.2) * big;
    disc(sunX, cy, big, (x, y, nx, ny) => set(x, y, nx * nx + ny * ny > 0.62 ? rim : core));
  } else if (moonUp) {
    const mx = colOf(L.moon.azimuth);
    const my = rowOf(L.moon.elevation);
    const r = Math.max(1.5, big - 0.5);
    const ph = Math.min(0.88, Math.max(0.12, L.moon.phase));
    const k = Math.cos(2 * Math.PI * ph);
    const waxing = ph < 0.5;
    const lit = hex("#eeece0");
    const shade = mix(skyAt(0.4), lit, 0.16);
    disc(mx, my, r, (x, y, nx, ny) => {
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      const on = waxing ? nx > k * half : nx < -k * half;
      set(x, y, on ? lit : shade);
    });
  }

  // the land: lighter and hazier far off, darker near; lit on the flank facing the sun
  const sunUp = L.sunUp;
  const day = land === "hills" ? HILL_DAY : land === "mountains" ? SLATE_DAY : SAND_DAY;
  const body = mix(ROCK_NIGHT, day, sunUp);
  const far = mix(horizonC, body, 0.42 + 0.3 * (1 - sunUp));
  const near = mix(horizonC, body, 0.88);
  const rim = mix(L.glow, horizonC, 0.3);
  const litNear = mix(near, rim, 0.3 * sunUp + 0.14 * L.twilight);
  const shadeNear = mix(near, ROCK_NIGHT, 0.2);
  const snow = mix(mix(near, STAR, 0.2), mix(SNOW, L.glow, 0.4 * L.twilight), smooth(-8, 4, sunEl));
  const p = (n: number) => rnd(seed, n);
  const farH = new Float32Array(a.w);
  const nearH = new Float32Array(a.w);
  /** the near land's clean shape, for light and snow (the crest itself is broken) */
  const nearB = new Float32Array(a.w);
  /** which summit stands over each column (mountains), for its faces */
  const apex = new Float32Array(a.w);
  const apexH = new Float32Array(a.w);
  const peaks: { at: number; tall: number; fall: number }[] = [];
  if (land === "mountains") {
    const n = 2 + (rnd(seed, 9) < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++)
      peaks.push({ at: (k + 0.25 + 0.5 * rnd(seed, 10 + k)) / n, tall: 0.3 + 0.18 * rnd(seed, 20 + k), fall: 0.85 + 0.5 * rnd(seed, 30 + k) });
  }
  const span = hy - a.y;
  for (let i = 0; i < a.w; i++) {
    const u = i / a.w;
    if (land === "hills") {
      farH[i] = span * (0.2 + 0.07 * Math.sin(u * 5.1 + p(2) * 6) + 0.05 * Math.sin(u * 11.3 + p(3) * 6));
      nearH[i] = span * (0.09 + 0.08 * Math.sin(u * 3.3 + p(4) * 6) + 0.03 * Math.sin(u * 8.7 + p(5) * 6));
    } else if (land === "mountains") {
      farH[i] = span * (0.24 + 0.08 * Math.sin(u * 6.3 + p(6) * 6) + 0.04 * Math.sin(u * 14.1 + p(7) * 6));
      // two or three summits on broad flanks, the crest a little broken
      let h = 0;
      for (const pk of peaks) {
        const v = span * (pk.tall - Math.abs(u - pk.at) * pk.fall);
        if (v > h) {
          h = v;
          apex[i] = pk.at * a.w;
          apexH[i] = span * pk.tall;
        }
      }
      const crest = Math.floor(i / 2);
      nearB[i] = Math.max(span * 0.08, h);
      nearH[i] = nearB[i] + (p(40 + crest) - 0.5) * 1.2;
    } else {
      // a headland running out to sea from one side, far off
      const side = p(8) < 0.5 ? u : 1 - u;
      farH[i] = Math.max(0, span * (0.13 - side * 0.32 + 0.025 * Math.sin(u * 17 + p(9) * 6)));
      nearH[i] = 0;
    }
  }
  const slope = (h: Float32Array, i: number) => h[Math.min(a.w - 1, i + 1)] - h[Math.max(0, i - 1)];
  for (let i = 0; i < a.w; i++) {
    const x = a.x + i;
    const toSun = sunX > x ? 1 : -1;
    const fTop = Math.round(hy - farH[i]);
    for (let y = fTop; y < hy; y++) setLand(x, y, far);
    if (land === "sea") continue;
    const nTop = Math.round(hy - nearH[i]);
    const shape = land === "mountains" ? nearB : nearH;
    const s = slope(shape, i) * toSun;
    const snowLine = land === "mountains" && shape[i] > span * 0.3 ? Math.round((shape[i] - span * 0.28) * 0.85) : 0;
    // mountains: each summit has a face toward the sun and one away, split
    // by a ridge that runs down from the top and leans into the shade
    const ax = a.x + apex[i];
    const sgn = sunX >= ax ? 1 : -1;
    const topRow = hy - apexH[i];
    for (let y = nTop; y < a.y + a.h; y++) {
      const depth = (y - hy) / Math.max(1, a.y + a.h - hy);
      let c: RGB;
      if (y >= hy) c = mix(near, mix(near, ROCK_NIGHT, 0.5), Math.max(0, depth) * 0.5);
      else if (land === "mountains") {
        const lit = (x + 0.5 - ax) * sgn >= -(y - topRow) * 0.45;
        c = lit ? litNear : shadeNear;
        if (snowLine > 0 && y < hy - shape[i] + snowLine) c = lit ? snow : mix(snow, shadeNear, 0.4);
      } else c = s < -0.05 ? litNear : near;
      setLand(x, y, c);
    }
  }

  // in front of the mountains, a low dark fold of foothills
  if (land === "mountains") {
    const foot = mix(mix(near, HILL_DAY, 0.35 * sunUp), ROCK_NIGHT, 0.3);
    for (let i = 0; i < a.w; i++) {
      const u = i / a.w;
      const h = span * (0.05 + 0.035 * Math.sin(u * 4.2 + p(50) * 6) + 0.02 * Math.sin(u * 9.1 + p(51) * 6));
      for (let y = Math.round(hy - h); y < a.y + a.h; y++) {
        const depth = Math.max(0, (y - hy) / Math.max(1, a.y + a.h - hy));
        setLand(a.x + i, y, mix(foot, ROCK_NIGHT, depth * 0.35));
      }
    }
  }

  // the sea: the horizon's colour going deep toward you, a lane of light under the sun or moon
  if (land === "sea") {
    const deep = mix(WATER_NIGHT, WATER_DAY, sunUp);
    const bx = sunEl > -1.2 ? sunX : moonUp ? colOf(L.moon.azimuth) : null;
    const shine = sunEl > -1.2 ? mix(L.glow, STAR, 0.5) : hex("#e6e2d2");
    const bottom = a.y + a.h;
    for (let y = hy; y < bottom; y++) {
      const t = (y - hy) / Math.max(1, bottom - hy);
      const base = mix(mix(horizonC, deep, 0.45), deep, Math.pow(t, 0.7));
      for (let x = a.x; x < a.x + a.w; x++) {
        let c = base;
        // long calm swell lines, sparse
        if ((y - hy) % 3 === 1 && p(200 + y * 131 + Math.floor(x / 5)) < 0.35) c = mix(base, horizonC, 0.22);
        if (bx != null && (y - hy) % 2 === 0) {
          // a lane of short dashes, widening toward you, nudged a pixel either way
          const half = 0.8 + (y - hy) * 0.3;
          const off = Math.abs(x + 0.5 - bx - Math.round((p(900 + y) - 0.5) * 2));
          if (off < half) c = mix(c, shine, (0.75 - (off / half) * 0.35) * (1 - t * 0.45));
        }
        set(x, y, c);
      }
    }
  }
}

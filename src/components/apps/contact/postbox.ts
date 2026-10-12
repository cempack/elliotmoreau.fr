import type { WeatherKind } from "@/components/os/weather";
import { sunAt, type SkyPhase } from "@/lib/sun";
import { mix, type ArtPalette } from "@/lib/theme";
import { DIGITS } from "./glyphs";
import type { Slip, Tab } from "./levee";
import { BAYER, glyph } from "./postmark";

/**
 * The letterbox, painted: a French street box in 3 px cells straight on
 * the window's glass (unpainted cells stay transparent). Two layouts: L, the
 * whole box on its post (desktop, mid widths), and S, a phone tile where the
 * box runs off the bottom edge and the plate's words become ink rules.
 *
 * The enamel is lit by the real sun over Toulouse, seen as the wallpaper
 * sees it (facing south, east on the left, the box's front facing north):
 * a light band down the side the sun is on, a rim along the hood when it's
 * high, the far edge stepping into shade. Pure painters on a cell buffer
 * (one packed ABGR value per cell); PostBox puts the result on screen.
 */

export const CELL = 3;

type Hex = string;
const R = Math.PI / 180;

/** a hex colour and an alpha, packed as one little-endian RGBA pixel */
function pack(hex: Hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return ((Math.round(a * 255) << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
}

/** src over dst, both packed */
function over(dst: number, src: number) {
  const sa = (src >>> 24) / 255;
  if (sa >= 1) return src;
  if (sa <= 0) return dst;
  const da = (dst >>> 24) / 255;
  const oa = sa + da * (1 - sa);
  const ch = (shift: number) => Math.round((((src >>> shift) & 255) * sa + ((dst >>> shift) & 255) * da * (1 - sa)) / oa);
  return ((Math.round(oa * 255) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

/* ───────────────────────────── tones ───────────────────────────── */

const TONE_NAMES = [
  "Y3", "Y2", "Yf", "Y1", "Y0", "Y3n",
  "paper", "paperEdge", "slip", "ink", "metal", "mouth", "steel", "flap", "recess",
  "post5", "post6", "post7", "post8",
  "shadow", "stamp", "ring", "bead", "tape", "slipShadow", "letterShadow",
] as const;
export type Tones = Record<(typeof TONE_NAMES)[number], number> & { key: string; night: boolean; fog: boolean };

/**
 * The enamel and everything on it, from the theme. Dawn and dusk warm the
 * enamel a little; night darkens enamel, paper and metal toward the night
 * ink (the lip keeps one crisp highlight); fog greys everything; rain wets
 * the front.
 */
export function tonesFor(P: ArtPalette, phase: SkyPhase, kind: WeatherKind): Tones {
  const night = phase === "night";
  const fog = kind === "fog";
  const warm = phase === "dawn" || phase === "dusk";
  const fogged = (c: Hex) => (fog ? mix(c, P.ink800, 0.25) : c);
  // (night stops short of the spec's 0.45 on the enamel: past ~0.35 the yellow turns olive)
  const enamel = (c: Hex) => fogged(night ? mix(c, P.night, 0.34) : warm ? mix(c, P.flare, 0.08) : c);
  const matter = (c: Hex) => fogged(night ? mix(c, P.night, 0.4) : c);
  let front = mix(P.ember, P.emberDeep, 0.35);
  if (kind === "rain") front = mix(front, P.emberDeep, 0.12);
  const Y0 = enamel(mix(P.ember, P.ink900, 0.55));
  const mouth = fogged(mix(P.ink950, "#000000", 0.4));
  const paper = mix(P.paper, P.ember, 0.12);
  const hex: Record<(typeof TONE_NAMES)[number], [Hex, number]> = {
    Y3: [enamel(P.emberLight), 1],
    Y2: [enamel(P.ember), 1],
    Yf: [enamel(front), 1],
    Y1: [enamel(P.emberDeep), 1],
    Y0: [Y0, 1],
    Y3n: [night ? fogged(mix(P.emberLight, P.night, 0.3)) : enamel(P.emberLight), 1],
    paper: [matter(paper), 1],
    paperEdge: [matter(mix(P.paper, P.ink700, 0.35)), 1],
    slip: [matter(mix(paper, P.paper, 0.4)), 1],
    ink: [fogged(P.ink800), 1],
    metal: [matter(mix(P.paper, P.ink600, 0.12)), 1],
    mouth: [mouth, 1],
    steel: [matter(P.paper3), 1],
    flap: [matter(mix(P.paper3, P.ink500, 0.5)), 1],
    recess: [mix(Y0, mouth, 0.4), 1],
    post5: [matter(P.ink500), 1],
    post6: [matter(P.ink600), 1],
    post7: [matter(P.ink700), 1],
    post8: [fogged(P.ink800), 1],
    shadow: ["#000000", 0.4],
    stamp: [matter(P.flare), 1],
    ring: [matter(P.lilac), 1],
    bead: [matter(P.paper), 0.85],
    tape: [matter(P.paper), 0.55],
    slipShadow: ["#000000", 0.25],
    letterShadow: ["#000000", 0.35],
  };
  const out = { key: "", night, fog } as Tones;
  const keys: string[] = [];
  for (const n of TONE_NAMES) {
    out[n] = pack(hex[n][0], hex[n][1]);
    keys.push(hex[n][0]);
  }
  out.key = keys.join("");
  return out;
}

/* ───────────────────────────── light ───────────────────────────── */

export type Light = { sunUp: boolean; side: "left" | "right"; band: number; rim: number; crisp: boolean; key: string };

/**
 * Where the light falls at an instant (the real one, or the middle of a
 * phase pinned in Control Center): the side the sun is on, how wide the
 * band it rakes down that side, and how bright a rim along the hood.
 */
export function lightOf(ms: number, phase: SkyPhase, kind: WeatherKind, small: boolean): Light {
  const { elevation: el, azimuth: az } = sunAt(ms);
  const sunUp = el > 0 && phase !== "night" && kind !== "fog";
  const side = az < 180 ? "left" : "right";
  const k = Math.abs(Math.sin(az * R)) * Math.cos(el * R);
  let band = small ? Math.min(4, Math.max(1, Math.round(1 + 3 * k))) : Math.min(6, Math.max(1, Math.round(1 + 5 * k)));
  let rim = el > 25 ? 2 : el > 10 ? 1 : 0;
  let crisp = true;
  if (kind === "cloudy" || kind === "rain") {
    // overcast: one dithered column, a rim of one row at most
    band = 0;
    crisp = false;
    rim = Math.min(rim, 1);
  }
  if (!sunUp) {
    band = 0;
    rim = 0;
  }
  return { sunUp, side, band, rim, crisp, key: `${+sunUp}|${side}|${band}|${rim}|${+crisp}` };
}

/* ───────────────────────────── layout ───────────────────────────── */

export type Place = { layout: "L" | "S"; ox: number; oy: number };

/** L when the canvas holds the whole box, else S; the art top-anchored when the post won't fit */
export function placeBox(N: number, M: number): Place {
  if (N >= 64 && M >= 76) return { layout: "L", ox: Math.floor((N - 60) / 2), oy: M >= 86 ? Math.floor((M - 84) / 2) : 2 };
  return { layout: "S", ox: Math.floor((N - 36) / 2), oy: 1 };
}

/** the box's parts, in box-local cells */
const GEO = {
  L: {
    w: 60, rows: 84, R: 9, hood: 10, lip: 10, body0: 12, body1: 73,
    slot: { x0: 11, x1: 48, lip: 14, top: 15, rows: 3 },
    recess: { x0: 8, x1: 51, y0: 54, y1: 68 },
    beads: [1, 2, 3, 4, 55, 56, 57, 58], beadMax: 4, beadBorn: 12, beadEnd: 73, beadStill: [[2, 30], [58, 46]],
    letter: { w: 18, h: 12 },
  },
  S: {
    w: 36, rows: 45, R: 5, hood: 6, lip: 6, body0: 8, body1: 44,
    slot: { x0: 6, x1: 29, lip: 9, top: 10, rows: 2 },
    recess: { x0: 3, x1: 32, y0: 27, y1: 35 },
    beads: [1, 2, 33, 34], beadMax: 2, beadBorn: 8, beadEnd: 44, beadStill: [[1, 25], [34, 31]],
    letter: { w: 12, h: 8 },
  },
} as const;
export type Geo = (typeof GEO)["L"] | (typeof GEO)["S"];
export const geoOf = (layout: "L" | "S"): Geo => GEO[layout];

/* ───────────────────────────── cells ───────────────────────────── */

/** a buffer with the box's origin: put/blend in box-local cells, clipped to the canvas */
function surface(buf: Uint32Array, N: number, M: number, ox: number, oy: number) {
  const idx = (x: number, y: number) => {
    const X = ox + x;
    const Y = oy + y;
    return X < 0 || Y < 0 || X >= N || Y >= M ? -1 : Y * N + X;
  };
  const put = (x: number, y: number, c: number) => {
    const i = idx(x, y);
    if (i >= 0) buf[i] = c;
  };
  const blend = (x: number, y: number, c: number) => {
    const i = idx(x, y);
    if (i >= 0) buf[i] = over(buf[i], c);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number, fn = put) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y, c);
  };
  return { put, blend, rect };
}

const bay = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)];

/** 3 × 5 caps as cells (punctuation trimmed, tracking 1, a space 2) */
function capsCells(s: string) {
  const cells: [number, number][] = [];
  let x = 0;
  for (const ch of s) {
    if (ch === " ") {
      x += 3;
      continue;
    }
    const gl = glyph(ch);
    if (!gl) {
      x += 4;
      continue;
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < gl.w; c++) if (gl.g[r][gl.a + c] === "1") cells.push([x + c, r]);
    x += gl.w + 1;
  }
  return { w: Math.max(0, x - 1), cells };
}

/** 5 × 7 digits as cells, a one-cell colon, one-cell gaps ("09:00" is 25 wide) */
function digitCells(s: string) {
  const cells: [number, number][] = [];
  let x = 0;
  for (const ch of s) {
    if (ch === ":") {
      cells.push([x, 2], [x, 4]);
      x += 2;
      continue;
    }
    const g = DIGITS[ch];
    if (g) g.forEach((row, r) => [...row].forEach((v, c) => v === "1" && cells.push([x + c, r])));
    x += 6;
  }
  return { w: Math.max(0, x - 1), cells };
}

/* ───────────────────────────── the static box ───────────────────────────── */

export type Look = {
  N: number;
  M: number;
  tones: Tones;
  light: Light;
  kind: WeatherKind;
  flap: "shut" | "ajar";
  plate: readonly [string, string, string];
  slip: Slip | null;
};

export type Layer = { key: string; buf: Uint32Array; N: number; M: number; place: Place; geo: Geo; tones: Tones };

export const lookKey = (l: Look) =>
  [placeBox(l.N, l.M).layout, `${l.N}x${l.M}`, l.tones.key, l.light.key, l.kind, l.flap, l.plate.join("/"), l.slip ? `${l.slip.place}/${l.slip.until}` : ""].join("|");

/** the slot under the lip: a steel flap, shut, or tipped in to show the dark mouth */
function paintSlot(s: ReturnType<typeof surface>, geo: Geo, T: Tones, flap: "shut" | "ajar") {
  const { x0, x1, lip, top, rows } = geo.slot;
  s.rect(x0, lip, x1, lip, T.Y3);
  s.rect(x0, top, x1, top, T.steel);
  s.rect(x0, top + 1, x1, top + rows - 1, flap === "ajar" ? T.mouth : T.flap);
  s.rect(x0, top + rows, x1, top + rows, T.Y1);
}

/** everything but the tab: hood, lip, body, slot, lettering, plate, window, post, slip */
export function paintStatic(look: Look): Layer {
  const { N, M, tones: T, light, kind, flap, plate, slip } = look;
  const place = placeBox(N, M);
  const geo = GEO[place.layout];
  const L = place.layout === "L";
  const buf = new Uint32Array(N * M);
  const s = surface(buf, N, M, place.ox, place.oy);
  const { sunUp, side, band, rim, crisp } = light;
  const flat = !sunUp;

  /** one row of the silhouette: the base tone, the lit band on the sun's side, shade on the other */
  const row = (y: number, xl: number, xr: number, base: (x: number) => number) => {
    for (let x = xl; x <= xr; x++) {
      let c = base(x);
      const dl = side === "left" ? x - xl : xr - x;
      const ds = side === "left" ? xr - x : x - xl;
      if (flat) {
        if (dl === 0 || ds === 0) c = T.Y0;
        else if (dl === 1 || ds === 1) c = T.Y1;
      } else {
        if (crisp && dl === 0) c = T.Y3;
        else if (dl < band) c = T.Y2;
        else if (dl === band && bay(x, y) < 8) c = T.Y2;
        if (ds === 0) c = T.Y0;
        else if (ds <= 2) c = T.Y1;
        else if (ds === 3 && bay(x, y) < 8) c = T.Y1;
      }
      s.put(x, y, c);
    }
  };

  // the hood: rounded corners, a lit top shading down into the front's soft shade
  const R0 = geo.R;
  const n = geo.hood;
  for (let r = 0; r < n; r++) {
    const inset = r < R0 ? Math.round(R0 - Math.sqrt(R0 * R0 - (R0 - r - 0.5) ** 2)) : 0;
    const k = L ? r : [0, 1, 2, 5, 7, 9][r];
    const top = T.night ? T.Y3n : rim >= 1 || kind === "rain" ? T.Y3 : T.Y2;
    const base =
      k === 0 ? () => top
      : k === 1 ? () => (rim >= 2 ? T.Y3 : T.Y2)
      : k <= 4 ? () => T.Y2
      : k <= 6 ? (x: number) => (bay(x, r) < 8 ? T.Y2 : T.Yf)
      : k <= 8 ? () => T.Yf
      : () => T.Y1;
    row(r, -1 + inset, geo.w + inset * -1, base);
  }
  // the lip (the one highlight that survives the night) and its underside
  s.rect(-1, geo.lip, geo.w, geo.lip, T.Y3n);
  s.rect(-1, geo.lip + 1, geo.w, geo.lip + 1, T.Y0);
  // the body
  for (let y: number = geo.body0; y <= geo.body1; y++) {
    if (L && y === geo.body1) {
      s.rect(0, y, geo.w - 1, y, T.Y0);
      continue;
    }
    const tone = y === geo.body0 || (L && y === geo.body1 - 1) ? T.Y1 : T.Yf;
    row(y, 0, geo.w - 1, () => tone);
  }
  paintSlot(s, geo, T, flap);

  const ink = (cells: [number, number][], x0: number, y0: number, c: number) => cells.forEach(([x, y]) => s.put(x0 + x, y0 + y, c));
  /** caps centred over [a, b] */
  const centred = (text: string, a: number, b: number, y0: number, c: number) => {
    const t = capsCells(text);
    ink(t.cells, a + Math.floor((b - a + 1 - t.w) / 2), y0, c);
  };

  if (L) {
    // LETTRES, embossed: a shade cell below-right of each letter cell, no outline
    const t = capsCells("LETTRES");
    const x0 = 16;
    const on = new Set(t.cells.map(([x, y]) => `${x},${y}`));
    t.cells.forEach(([x, y]) => !on.has(`${x + 1},${y + 1}`) && s.put(x0 + x + 1, 21 + y + 1, T.Y1));
    ink(t.cells, x0, 21, T.Y3);

    // the collection plate: a cream sticker, its lower-right corner peeling
    s.rect(6, 28, 53, 49, T.paper);
    s.rect(53, 28, 53, 49, T.paperEdge);
    s.rect(6, 49, 53, 49, T.paperEdge);
    centred(plate[0], 6, 52, 30, T.ink);
    centred(plate[1], 6, 52, 37, T.ink);
    centred(plate[2], 6, 52, 44, T.ink);
    for (const [x, y] of [[52, 47], [51, 48], [50, 49]]) s.put(x, y, T.Y1);
    for (const [x, y] of [[53, 47], [52, 48], [53, 48], [51, 49], [52, 49], [53, 49]]) s.put(x, y, T.paperEdge);

    // the window the next collection shows through
    s.rect(7, 53, 52, 69, T.Y0);
    s.rect(8, 54, 51, 68, T.recess);

    // the post, and where it meets the ground
    for (let y = 74; y <= 81; y++)
      for (let x = 24; x <= 35; x++) {
        const lit = sunUp && (side === "left" ? x === 24 : x === 35);
        const shade = side === "left" ? x === 35 : x === 24;
        s.put(x, y, y === 74 ? T.post8 : lit ? T.post5 : shade ? T.post7 : T.post6);
      }
    for (let x = 17; x <= 42; x++) if (bay(x, 82) < 8) s.put(x, 82, T.shadow);
    for (let x = 21; x <= 38; x++) if (bay(x, 83) < 4) s.put(x, 83, T.shadow);

    // forwarded: a slip pasted over the plate
    if (slip) {
      const end = slip.until ? 49 : 42;
      s.rect(3, 27, 56, end, T.slip);
      s.rect(4, end + 1, 57, end + 1, T.slipShadow, s.blend);
      s.rect(57, 28, 57, end, T.slipShadow, s.blend);
      centred("FAIRE SUIVRE", 3, 56, 30, T.ink);
      if (slip.place) centred(slip.place, 3, 56, 37, T.ink);
      if (slip.until) centred(slip.until, 3, 56, 44, T.ink);
      s.rect(6, 26, 9, 27, T.tape, s.blend);
      s.rect(50, 26, 53, 27, T.tape, s.blend);
    }
  } else {
    // a phone tile: the plate's three lines as ink rules
    s.rect(3, 14, 32, 23, T.paper);
    s.rect(32, 14, 32, 23, T.paperEdge);
    s.rect(3, 23, 32, 23, T.paperEdge);
    for (const [w, y] of [[14, 16], [16, 19], [26, 22]]) {
      const x0 = 3 + Math.floor((29 - w) / 2);
      s.rect(x0, y, x0 + w - 1, y, T.ink);
    }
    s.rect(2, 26, 33, 36, T.Y0);
    s.rect(3, 27, 32, 35, T.recess);
    if (slip) {
      s.rect(1, 15, 34, 21, T.slip);
      s.rect(2, 22, 35, 22, T.slipShadow, s.blend);
      s.rect(35, 16, 35, 21, T.slipShadow, s.blend);
      if (slip.place) centred(slip.place, 1, 34, 16, T.ink);
      else s.rect(10, 18, 25, 18, T.ink);
    }
  }
  return { key: lookKey(look), buf, N, M, place, geo, tones: T };
}

/* ───────────────────────────── overlays ───────────────────────────── */

export type Bead = { x: number; born: number };

export type Frame = {
  /** the tab in the window, and how far it has risen out of it (0 at rest, -15 out of sight) */
  tab: Tab | null;
  tabDy: number;
  /** rain on the sides: each bead creeps down a cell every 4 ticks */
  beads: readonly Bead[];
  tick: number;
  stillBeads: boolean;
  /** the posted letter's step (0–9) on its way into the slot */
  letter: number | null;
  /** the flap, while a letter goes in */
  flap: "shut" | "ajar" | null;
  /** the box sits a row lower for a moment */
  jolt: boolean;
  /** 4 the whole box, 0 none (ordered dither) */
  vis: number;
};

/** where a bead's head is at a tick, or null once it has gone */
export function beadAt(b: Bead, tick: number, geo: Geo) {
  const age = tick - b.born;
  if (age < 0) return null;
  const creep = geo.beadBorn + Math.floor(age / 4);
  if (creep <= geo.beadEnd) return { y: creep, wet: age >= 4 && age % 4 < 3 ? creep - 1 : null };
  // off the base it falls, a cell a tick, then it's gone
  const fall = geo.beadEnd + (age - (geo.beadEnd - geo.beadBorn + 1) * 4) + 1;
  return fall <= geo.beadEnd + 2 ? { y: fall, wet: null } : null;
}

const TAB_W = { L: 44, S: 30 };

/** the window's tab: a metal card, its top row in the recess's shade, the word over the digits */
function paintTab(s: ReturnType<typeof surface>, layer: Layer, tab: Tab, dy: number) {
  const { geo, tones: T } = layer;
  const L = layer.place.layout === "L";
  const { x0, y0, y1 } = geo.recess;
  const w = TAB_W[layer.place.layout];
  const top = y0 + dy;
  const clip = (x: number, y: number, c: number) => y >= y0 && y <= y1 && s.put(x, y, c);
  for (let r = 0; r < (L ? 15 : 9); r++) for (let x = 0; x < w; x++) clip(x0 + x, top + r, r === 0 ? T.paperEdge : T.metal);
  if (L && tab.word) {
    const t = capsCells(tab.word);
    const ox = x0 + Math.floor((w - t.w) / 2);
    t.cells.forEach(([x, y]) => clip(ox + x, top + 2 + y, T.ink));
  }
  const d = digitCells(tab.digits);
  const ox = x0 + Math.floor((w - d.w) / 2);
  d.cells.forEach(([x, y]) => clip(ox + x, top + (L ? 8 : 1) + y, T.ink));
}

/** the posted letter, its flap's V, the stamp and the postmark crossing it, clipped into the slot */
function paintLetter(s: ReturnType<typeof surface>, layer: Layer, k: number) {
  const { geo, tones: T } = layer;
  const L = layer.place.layout === "L";
  const { w, h } = geo.letter;
  const top = geo.slot.top;
  const lx = Math.round((geo.slot.x0 + geo.slot.x1 + 1 - w) / 2);
  const ly = Math.round(-(h + 2) + (top + h + 2) * (k / 9) ** 2);
  const at = (x: number, y: number, c: number, fn = s.put) => ly + y < top && fn(lx + x, ly + y, c);
  for (let y = 1; y <= h; y++) at(w, y, T.letterShadow, s.blend);
  for (let x = 1; x < w; x++) at(x, h, T.letterShadow, s.blend);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) at(x, y, y === h - 1 ? T.paperEdge : T.paper);
  const vRows = L ? 5 : 4;
  const step = L ? 1.8 : 1.2;
  for (let r = 0; r < vRows; r++) {
    at(Math.round(r * step), r, T.paperEdge);
    at(w - 1 - Math.round(r * step), r, T.paperEdge);
  }
  if (L) {
    for (let y = 1; y <= 3; y++) for (let x = 13; x <= 15; x++) at(x, y, T.stamp);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        const edge = x === 0 || y === 0 || x === 4 || y === 4;
        const corner = (x === 0 || x === 4) && (y === 0 || y === 4);
        if (edge && !corner) at(9 + x, 2 + y, T.ring);
      }
  } else {
    for (let y = 1; y <= 2; y++) for (let x = 8; x <= 9; x++) at(x, y, T.stamp);
  }
}

/** the letter's top row at a step: true while it overlaps the slot */
export function letterInSlot(geo: Geo, k: number) {
  const { h } = geo.letter;
  const top = geo.slot.top;
  return Math.round(-(h + 2) + (top + h + 2) * (k / 9) ** 2) + h > top;
}

/** one frame: the static layer, the tab, rain, the letter, the jolt, the dissolve */
export function compose(out: Uint32Array, layer: Layer, f: Frame) {
  const { N, M, place, geo, tones: T } = layer;
  if (f.vis <= 0) {
    out.fill(0);
    return;
  }
  out.set(layer.buf);
  const s = surface(out, N, M, place.ox, place.oy);
  if (f.tab) paintTab(s, layer, f.tab, f.tabDy);
  // rain shows on the enamel and the glass, never over paper (a bead runs behind the slip)
  const enamel = new Set([T.Y0, T.Y1, T.Y2, T.Y3, T.Yf, T.Y3n]);
  const wet = (x: number, y: number) => {
    const X = place.ox + x;
    const Y = place.oy + y;
    if (X < 0 || Y < 0 || X >= N || Y >= M) return false;
    const v = layer.buf[Y * N + X];
    return v === 0 || enamel.has(v);
  };
  const bead = (x: number, y: number, trail: number | null) => {
    if (trail != null && wet(x, trail)) s.put(x, trail, T.Y3);
    if (wet(x, y)) s.blend(x, y, T.bead);
  };
  if (f.stillBeads) for (const [x, y] of geo.beadStill) bead(x, y, y - 1);
  else
    for (const b of f.beads) {
      const p = beadAt(b, f.tick, geo);
      if (p) bead(b.x, p.y, p.wet);
    }
  if (f.flap) paintSlot(s, geo, T, f.flap);
  if (f.letter != null) paintLetter(s, layer, f.letter);
  if (f.jolt) {
    out.copyWithin(N, 0, N * (M - 1));
    out.fill(0, 0, N);
  }
  if (f.vis < 4) {
    const keep = f.vis * 4;
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) if (bay(x, y) >= keep) out[y * N + x] = 0;
  }
}

/**
 * Toulouse from above, in pixels, north up, 5 m to the pixel, lit by an
 * early-afternoon sun from the south: fields in a patchwork around the
 * faubourgs (rows of houses, gardens behind them) and the pink old town
 * inside its ring of tree-lined boulevards (blocks of brick-roofed
 * buildings round their courtyards, each roof its own shade with a sunny
 * slope and a shaded one, narrow streets in their shadow, the Rue de Metz
 * and the Rue d'Alsace-Lorraine through them), the Garonne's long bend
 * with its stone quays and the Île du Ramier, the Canal du Midi lined with
 * plane trees, the parks, the Capitole on its square, Saint-Sernin, La
 * Grave and its dome, and the Pont Neuf a little south of the middle (the
 * arrival comes in from the north, down the river). Everything that
 * stands casts a short shadow north. Clouds are a separate, coarser
 * layer: the flight casts their shadows on the town.
 */

export const MAP = 512;
/** metres to a map pixel */
export const CELL = 5;
/** the cloud layer's size (10 m to its pixel) */
export const CLOUDS = 256;

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
/** a fast integer hash, 0–1 */
const hash = (x: number, y: number, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
type RGB = [number, number, number];
const hex = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shadeRGB = (c: RGB, k: number): RGB => (k >= 0 ? (c.map((v) => v + (255 - v) * k) as RGB) : (c.map((v) => v * (1 + k)) as RGB));

/** the k-th of a set of parallel lines, near k·g but each a little off */
const lineAt = (k: number, g: number, salt: number) => (k + (hash(k, salt) - 0.5) * 0.45) * g;
/** between which two of those lines u falls (k, k + 1), and how far from each */
const gap = { k: 0, a: 0, b: 0 };
function between(u: number, g: number, salt: number) {
  let k = Math.floor(u / g);
  if (u < lineAt(k, g, salt)) k--;
  else if (u >= lineAt(k + 1, g, salt)) k++;
  gap.k = k;
  gap.a = u - lineAt(k, g, salt);
  gap.b = lineAt(k + 1, g, salt) - u;
  return gap;
}

/** the streets: the old town's stone, the faubourgs' and the boulevards' asphalt */
const STREET_OLD = hex("#b19c84");
const STREET = hex("#958a7e");

/** where the sun is, in map pixels (x east, y south): from the south, a little east of it, early in the afternoon */
const SUN = { x: 0.39, y: 0.92 };

/** what a map pixel is, besides its colour: the flight's lamps and the river's mirror go by it */
export const KIND = { GROUND: 0, OLD_STREET: 1, STREET: 2, WATER: 3 } as const;

/**
 * A town grid: streets on two sets of irregular, gently bent parallel
 * lines (some only alleys, some left out between two blocks, so streets
 * end in T-junctions and blocks join), the blocks built round their edges
 * `depth` deep, the rest courtyards and gardens.
 */
type Grid = { gu: number; gv: number; cos: number; sin: number; bend: number; salt: number; depth: [number, number]; wide: number; gaps: number };
const grid = (ang: number, g: Omit<Grid, "cos" | "sin">): Grid => ({ ...g, cos: Math.cos(ang), sin: Math.sin(ang) });
type Cell = {
  /** -1: street; 0: building; 1: courtyard; 2: a wall between two joined courtyards; 3: an open square */
  what: number;
  block: number;
  /** a building's roof: its lot (for its colour and height), how much sun its slope gets (−1–1), where along it the tiles run */
  lot: number;
  sun: number;
  along: number;
  /** how far in from the street */
  e: number;
  depth: number;
};
function gridCell(g: Grid, dx: number, dy: number, out: Cell) {
  const ca = g.cos;
  const sa = g.sin;
  const u = dx * ca + dy * sa + g.bend * Math.sin(dy * 0.019 + g.salt) + g.bend * 0.6 * Math.sin((dx + dy) * 0.011 + 2);
  const v = -dx * sa + dy * ca + g.bend * Math.sin(dx * 0.017 + g.salt * 2) + g.bend * 0.6 * Math.sin((dx - dy) * 0.013 + 1);
  const U = between(u, g.gu, g.salt);
  const cu = U.k;
  const ua = U.a;
  const ub = U.b;
  const V = between(v, g.gv, g.salt + 1);
  const cv = V.k;
  const va = V.a;
  const vb = V.b;
  const block = cu * 7919 + cv * 104729 + g.salt;
  out.block = block;
  // each line's width (a few wide streets, the rest narrow), and whether it runs past this block
  const wl = hash(cu, g.salt + 2) < g.wide ? 2 : 1;
  const wr = hash(cu + 1, g.salt + 2) < g.wide ? 2 : 1;
  const wt = hash(cv, g.salt + 3) < g.wide ? 2 : 1;
  const wb = hash(cv + 1, g.salt + 3) < g.wide ? 2 : 1;
  const dl = wl === 2 || hash(cu, cv, g.salt + 4) > g.gaps ? ua - wl / 2 : 99;
  const dr = wr === 2 || hash(cu + 1, cv, g.salt + 4) > g.gaps ? ub - wr / 2 : 99;
  const dt = wt === 2 || hash(cu, cv, g.salt + 5) > g.gaps ? va - wt / 2 : 99;
  const db = wb === 2 || hash(cu, cv + 1, g.salt + 5) > g.gaps ? vb - wb / 2 : 99;
  let e = dl;
  let side = 0;
  if (dr < e) {
    e = dr;
    side = 1;
  }
  if (dt < e) {
    e = dt;
    side = 2;
  }
  if (db < e) {
    e = db;
    side = 3;
  }
  out.e = e;
  const depth = g.depth[0] + hash(block, 7) * (g.depth[1] - g.depth[0]);
  out.depth = depth;
  if (e < 0) return (out.what = -1);
  // now and then a whole block left open: a square
  if (hash(block, 8) < 0.03) return (out.what = 3);
  if (e >= depth) {
    // where two blocks join, a wall between their courtyards
    const wall = Math.min(dl < 99 ? 99 : ua, dr < 99 ? 99 : ub, dt < 99 ? 99 : va, db < 99 ? 99 : vb);
    return (out.what = wall < 0.6 ? 2 : 1);
  }
  // a building facing the nearest street: its roof's two slopes, the one toward the street and the one toward the courtyard
  const nu = side === 0 ? -1 : side === 1 ? 1 : 0;
  const nv = side === 2 ? -1 : side === 3 ? 1 : 0;
  const outer = e < depth / 2 ? 1 : -1;
  out.sun = outer * ((nu * ca - nv * sa) * SUN.x + (nu * sa + nv * ca) * SUN.y);
  const along = side < 2 ? v : u;
  out.along = along;
  out.lot = between(along, 4.4, block * 4 + side).k * 31 + block * 4 + side;
  return (out.what = 0);
}

export type ToulouseMap = {
  ground: ImageData;
  /** MAP × MAP: what each pixel is (KIND) */
  kind: Uint8Array;
  /** CLOUDS × CLOUDS, 10 m to the pixel */
  clouds: ImageData;
  /** the Pont Neuf, in map pixels */
  bridge: { x: number; y: number };
  /** the Garonne's middle at a map row, smooth (the flight follows it in to the Pont Saint-Pierre) */
  riverX: (y: number) => number;
};

/** `near`: how many clouds drift close over the Pont Neuf (today's weather: one on a clear day, three when it's grey) */
export function paintToulouse(near = 1): ToulouseMap {
  const N = MAP;
  /** this map's pixels to the old 10 m ones: the layout is drawn in those */
  const K = N / 256;
  const ground = new ImageData(N, N);
  const px = ground.data;
  /** how tall what stands on each pixel is (in pixels of shadow it casts) */
  const tall = new Uint8Array(N * N);
  const kind = new Uint8Array(N * N);
  const put = (x: number, y: number, c: RGB, h = 0, k: number = KIND.GROUND) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const p = y * N + x;
    const i = p * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = 255;
    tall[p] = h;
    kind[p] = k;
  };
  const disc = (cx: number, cy: number, r: number, c: RGB, lit?: RGB, h = 1) => {
    for (let j = -Math.ceil(r); j <= r; j++)
      for (let i = -Math.ceil(r); i <= r; i++) {
        const q = (i * i + j * j) / (r * r);
        if (q > 1) continue;
        // a canopy catches the sun on its south side
        put(cx + i, cy + j, lit && j - i * 0.4 > r * 0.35 && q < 0.75 ? lit : c, h);
      }
  };
  const PLANE = hex("#2f5a34");
  const PLANE_LIT = hex("#4b8048");

  // the Garonne: from the south, a long bend, out to the north-west; the
  // Pont Neuf centred across, south of the middle (room to fly in from the north)
  const bend = (t: number) => (150 + Math.sin(t * Math.PI * 1.15 + 0.2) * 24 - t * 70) * K;
  const river: [number, number, number][] = [];
  for (let t = 0; t <= 1; t += 0.0015 / K) river.push([bend(t), N + 8 * K - t * (N + 20 * K), (6 + Math.sin(t * 6)) * K]);
  const mid = river.reduce((b, p) => (Math.abs(p[1] - N * 0.6) < Math.abs(b[1] - N * 0.6) ? p : b));
  const shift = N / 2 - mid[0];
  for (const p of river) p[0] += shift;
  const bx = Math.round(mid[0]);
  const by = Math.round(mid[1]);
  const cx0 = bx + 24 * K;
  const cy0 = by + 2 * K;

  /* fields round the faubourgs, the faubourgs round the boulevards, the old town inside them */
  const FIELDS = ["#7d8a55", "#8f9660", "#a59a62", "#6f8350", "#b7a774", "#8a7f52", "#9aa070"].map(hex);
  const OLD = ["#c06a52", "#b25e48", "#d08268", "#b8644e", "#c87760", "#a95a45", "#9c5444", "#d48f6a"].map(hex);
  const ZINC = hex("#8e9090");
  const HOUSES = ["#b87c63", "#c48d71", "#aa9682", "#b5735c", "#c9a080"].map(hex);
  const PAVED = hex("#9a8670");
  const SQUARE = hex("#c3ae93");
  const GARDEN = hex("#6c8a52");
  const LAWN = hex("#7d9a5c");
  const oldTown = grid(0.2, { gu: 16 * (K / 2), gv: 12 * (K / 2), bend: 3, salt: 41, depth: [3.2, 4.8], wide: 0.22, gaps: 0.2 });
  const faubourg = grid(-0.12, { gu: 26 * (K / 2), gv: 18 * (K / 2), bend: 5, salt: 67, depth: [2.6, 3.4], wide: 0.3, gaps: 0.12 });
  const cell: Cell = { what: 0, block: 0, lot: 0, sun: 0, along: 0, e: 0, depth: 0 };
  /** the ring of boulevards round the old town, not quite an ellipse (in the old 10 m pixels from the centre) */
  const RING = 39;
  const BLVD = 2.6;
  const wobble = (a: number) => 1.6 * Math.sin(3 * a + 1) + 1.1 * Math.sin(5 * a + 2);
  const trees: [number, number, number][] = [];
  /** farmland: long parcels on a loose grid, each sown its own way, hedgerows along some of their edges */
  const FA = 0.35;
  const fieldAt = (x: number, y: number) => {
    const u = (x - cx0) * Math.cos(FA) + (y - cy0) * Math.sin(FA) + 6 * Math.sin(y * 0.011);
    const v = -(x - cx0) * Math.sin(FA) + (y - cy0) * Math.cos(FA) + 6 * Math.sin(x * 0.009 + 1);
    const U = between(u, 30 * (K / 2), 91);
    const cu = U.k;
    const eu = Math.min(U.a, U.b);
    const V = between(v, 21 * (K / 2), 92);
    const cv = V.k;
    const ev = Math.min(V.a, V.b);
    // parcels split again across, some of them
    const half = hash(cu, cv, 93) < 0.5;
    const along = half ? u : v;
    const id = cu * 7919 + cv * 104729 + (hash(cu, cv, 94) < 0.5 ? 0 : (half ? v : u) > (half ? lineAt(cv, 21 * (K / 2), 92) + 10 : lineAt(cu, 30 * (K / 2), 91) + 15) ? 1 : 0);
    const r1 = hash(id, 5);
    const r2 = hash(id, 6);
    let c = FIELDS[Math.floor(r1 * FIELDS.length)];
    if (Math.floor(along) % 3 === 0) c = shadeRGB(c, r2 < 0.5 ? -0.08 : 0.05);
    const edge = Math.min(eu, ev);
    if (edge < 0.8) {
      // a track or a hedgerow along the edge, and now and then a tree in it
      const hedge = hash(eu < ev ? cu : cv, eu < ev ? cv : cu, 95) < 0.4;
      c = hedge ? hex("#4f6b3e") : shadeRGB(c, -0.14);
      if (hedge && hash(x, y, 19) < 0.06) trees.push([x, y, 1.3]);
    }
    put(x, y, c);
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const ex = (x - cx0) / 1.15;
      const ey = (y - cy0) / 0.95;
      const a = Math.atan2(ey, ex);
      const d = Math.hypot(ex, ey) / K + wobble(a);
      if (d < RING) {
        // the old town: blocks of brick, every roof its own
        gridCell(oldTown, x - cx0, y - cy0, cell);
        if (cell.what === -1) put(x, y, STREET_OLD, 0, KIND.OLD_STREET);
        else if (cell.what === 3) {
          put(x, y, (x + y) % 5 === 0 ? shadeRGB(SQUARE, -0.05) : SQUARE, 0, KIND.OLD_STREET);
          if (hash(x, y, 12) < 0.012) trees.push([x, y, 1.6]);
        } else if (cell.what === 2) put(x, y, shadeRGB(OLD[0], -0.12), 1);
        else if (cell.what === 1) {
          // a courtyard: old paving, or a garden with a tree or two
          if (hash(cell.block, 6) < 0.4) {
            put(x, y, GARDEN);
            if (cell.e > cell.depth + 1.5 && hash(x, y, 14) < 0.035) trees.push([x, y, 1.3 + hash(x, y, 15)]);
          } else put(x, y, hash(x, y, 16) < 0.08 ? shadeRGB(PAVED, -0.06) : PAVED);
        } else {
          // terracotta, weathered every way, now and then a zinc roof
          const r = hash(cell.lot, 1);
          let c = r < 0.05 ? ZINC : OLD[Math.floor(hash(cell.lot, 4) * OLD.length)];
          // the tiles run down the slope; the sunny side lighter, the other darker; the ridge catches the light
          if ((Math.floor(cell.along) & 1) === 0) c = shadeRGB(c, -0.05);
          c = shadeRGB(c, cell.sun * 0.22);
          if (Math.abs(cell.e - cell.depth / 2) < 0.45) c = shadeRGB(c, 0.09);
          put(x, y, c, hash(cell.lot, 2) < 0.25 ? 2 : 1);
        }
      } else if (d < RING + BLVD) {
        // the boulevards
        put(x, y, STREET, 0, KIND.STREET);
      } else if (d < 72 + 3 * Math.sin(4 * a + 0.5)) {
        // the faubourgs: houses along the streets, gardens behind them, now and then a garden between two
        gridCell(faubourg, x - cx0, y - cy0, cell);
        // toward the edge the blocks thin out, fields between them
        if (hash(cell.block, 9) < (d - 56) / 16) fieldAt(x, y);
        else if (cell.what === -1) put(x, y, STREET, 0, KIND.STREET);
        else if (cell.what === 0 && hash(cell.lot, 3) < 0.72) {
          let c = HOUSES[Math.floor(hash(cell.lot, 1) * HOUSES.length)];
          if ((Math.floor(cell.along) & 1) === 0) c = shadeRGB(c, -0.04);
          put(x, y, shadeRGB(c, cell.sun * 0.15), 1);
        } else {
          put(x, y, hash(x >> 1, y >> 1, 4) < 0.25 ? GARDEN : LAWN);
          if (cell.what !== 0 && cell.e > cell.depth + 1 && hash(x, y, 17) < 0.03) trees.push([x, y, 1.2 + hash(x, y, 18) * 0.9]);
        }
      } else fieldAt(x, y);
    }
  // plane trees down both sides of the boulevards
  for (const off of [0.45, BLVD - 0.45])
    for (let a = -Math.PI; a < Math.PI; a += 2.1 / (RING * K)) {
      const r = (RING + off - wobble(a)) * K;
      trees.push([cx0 + Math.cos(a) * r * 1.15, cy0 + Math.sin(a) * r * 0.95, 1.25]);
    }
  for (const [x, y, r] of trees) disc(x, y, r, PLANE, PLANE_LIT);

  // the two streets that cross the old town: the Rue de Metz east from the Pont Neuf, the Rue d'Alsace-Lorraine north–south
  for (let x = bx + 10 * K; x < cx0 + 34 * K; x++) for (let k = 0; k < 2; k++) put(x, by + K + k, STREET_OLD, 0, KIND.OLD_STREET);
  for (let y = cy0 - 34 * K; y < cy0 + 12 * K; y++) for (let k = 0; k < 2; k++) put(cx0 + 6 * K + k, y, STREET_OLD, 0, KIND.OLD_STREET);

  // parks: the Jardin des Plantes, the Grand Rond, the Prairie des Filtres; trees in them
  const parks: [number, number, number, number][] = [
    [cx0 + 16 * K, cy0 + 18 * K, 7 * K, 6 * K],
    [cx0 + 9 * K, cy0 + 11 * K, 4 * K, 4 * K],
    [bx - 14 * K, by + 10 * K, 5 * K, 7 * K],
  ];
  for (const [gx, gy, rx, ry] of parks) {
    for (let j = -ry; j <= ry; j++)
      for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) put(gx + i, gy + j, hash(gx + i, gy + j, 7) < 0.3 ? hex("#6a9152") : hex("#75995a"));
    for (let k = 0; k < (rx * ry) / 9; k++) {
      const a = hash(gx, k, 31) * Math.PI * 2;
      const q = Math.sqrt(hash(gy, k, 32)) * 0.8;
      disc(gx + Math.cos(a) * rx * q, gy + Math.sin(a) * ry * q, 1.4 + hash(k, gx, 33) * 1.2, PLANE, PLANE_LIT, 2);
    }
  }

  // the Canal du Midi: in from the south-east, round the east and north of
  // the centre, into the Garonne at the Ponts-Jumeaux; plane trees on both banks
  for (let t = 0; t <= 1; t += 0.001 / K) {
    const a = -0.35 + t * 2.8;
    const x = cx0 + 6 * K + Math.cos(a) * 50 * K;
    const y = cy0 + 8 * K - Math.sin(a) * 46 * K;
    for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) if (k * k + m * m <= 1) put(x + k, y + m, hex("#4f8a92"), 0, KIND.WATER);
  }
  for (let t = 0; t <= 1; t += 0.0035 / K) {
    const a = -0.35 + t * 2.8;
    for (const off of [-3.2, 3.2]) {
      const rr = 50 * K + off;
      disc(cx0 + 6 * K + Math.cos(a) * rr, cy0 + 8 * K - Math.sin(a) * (rr * 0.92), 1.3, PLANE, PLANE_LIT, 2);
    }
  }

  // the river, its quays; the current in short ripples across it
  const QUAY_HI = hex("#d8c6ae");
  const QUAY = hex("#a08a74");
  const W1 = hex("#3f6c73");
  const W2 = hex("#5b8d90");
  const W3 = hex("#4f8085");
  for (const [x, y, w] of river)
    for (let k = -w - 2 * K; k <= w + 2 * K; k++) {
      const X = Math.round(x + k);
      const Y = Math.round(y);
      if (Math.abs(k) > w) put(X, Y, Math.abs(k) > w + K ? QUAY : QUAY_HI);
      else if (Math.abs(k) > w - 1.5 * K) put(X, Y, W3, 0, KIND.WATER);
      else {
        // a ripple: three pixels long, one row, scattered along the current
        const run = Math.floor((X + (Y % 7) * 3) / 3);
        put(X, Y, hash(run, Y, 23) < 0.09 && (Y & 1) === 0 ? W2 : W1, 0, KIND.WATER);
      }
    }
  // the Île du Ramier, upstream, wooded
  const isle = river.find((p) => Math.abs(p[1] - (by + 50 * K)) < 1);
  if (isle) {
    for (let j = -14 * K; j <= 14 * K; j++)
      for (let i = -3 * K; i <= 3 * K; i++) {
        const w = 3 * K * (1 - Math.abs(j) / (15 * K));
        if (Math.abs(i) <= w) put(isle[0] + i, isle[1] + j, Math.abs(i) > w - K ? hex("#5d7f45") : hex("#6f9a55"));
      }
    for (let j = -11 * K; j <= 11 * K; j += 3) disc(isle[0] + (hash(j, 3, 41) - 0.5) * 2 * K, isle[1] + j, 1.4, PLANE, PLANE_LIT, 2);
  }

  // the Pont Neuf: its deck (its shadow falls on the water north of it), the cutwaters of its piers
  for (let i = -10 * K; i <= 10 * K; i++) for (let k = 0; k < 2 * K; k++) put(bx + i, by + k, k === 2 * K - 1 ? hex("#cdb89c") : hex("#e8d6bc"), 1);
  for (let k = -7 * K; k <= 7 * K; k += 4 * K) {
    put(bx + k, by - 1, hex("#d4c0a6"), 1);
    put(bx + k + 1, by - 1, hex("#d4c0a6"), 1);
    put(bx + k, by + 2 * K, hex("#d4c0a6"), 1);
  }

  // the Capitole: its long front on the east side of the square, slate-roofed; the Occitan cross in the paving
  {
    const qx = cx0 + 4 * K;
    const qy = cy0 - 8 * K;
    for (let j = 0; j < 16; j++)
      for (let i = 0; i < 16; i++) put(qx + i, qy + j, (i + j) % 4 === 0 ? hex("#d8c9ae") : hex("#e2d4ba"), 0, KIND.OLD_STREET);
    const BRONZE = hex("#9c7a4c");
    const cx = qx + 7;
    const cy = qy + 8;
    for (let k = -3; k <= 3; k++) {
      put(cx + k, cy, BRONZE);
      put(cx, cy + k, BRONZE);
    }
    for (const [dx, dy] of [
      [-3, -1], [-3, 1], [3, -1], [3, 1], [-1, -3], [1, -3], [-1, 3], [1, 3],
    ])
      put(cx + dx, cy + dy, BRONZE);
    for (let j = -1; j < 17; j++)
      for (let i = 16; i < 21; i++) {
        // two slopes either side of the ridge, the west one in the sun's glancing light
        const slate = i < 18 ? hex("#8f9599") : i === 18 ? hex("#a4aaad") : hex("#767c80");
        put(qx + i, qy + j, j === -1 || j === 16 ? hex("#c9a48a") : slate, 3);
      }
  }
  // Saint-Sernin: a cross of roofs, ridged, its tower at the crossing standing well above them
  {
    const sx = cx0 + 2 * K;
    const sy = cy0 - 27 * K;
    const ROOF = hex("#b06a5c");
    for (let i = -9; i <= 9; i++) for (let k = -2; k <= 2; k++) put(sx + i, sy + k, k === 0 ? shadeRGB(ROOF, 0.1) : shadeRGB(ROOF, k > 0 ? 0.08 : -0.14), 3);
    for (let j = -6; j <= 6; j++) for (let k = -2; k <= 2; k++) put(sx - 3 + k, sy + j, k === 0 ? shadeRGB(ROOF, 0.1) : shadeRGB(ROOF, k > 0 ? 0.04 : -0.08), 3);
    disc(sx - 3, sy, 1.6, hex("#e0c2a8"), hex("#f0dcc4"), 7);
  }
  // La Grave: the hospital round its courtyard, the verdigris dome
  {
    const gx = bx - 13 * K;
    const gy = by - 6 * K;
    for (let j = -7; j <= 7; j++)
      for (let i = -9; i <= 9; i++) {
        const ring = Math.abs(i) > 6 || Math.abs(j) > 4;
        put(gx + i, gy + j, ring ? ((Math.abs(i) + Math.abs(j)) & 1 ? hex("#c9907a") : hex("#bd8470")) : hex("#6f8a58"), ring ? 2 : 0);
      }
    disc(gx, gy, 4.2, hex("#3f7a68"), hex("#5f9c86"), 5);
    disc(gx, gy, 1.2, hex("#2e5a4e"), undefined, 6);
    put(gx, gy, hex("#d8c8a8"), 6);
  }

  // shadows: whatever stands casts one north, as long as it is tall, onto anything lower
  {
    const shade = new Uint8Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const p = y * N + x;
        const h = tall[p];
        for (let s = 1; s <= 7; s++) {
          const X = x + Math.round(s * SUN.x * 1.06);
          const Y = y + s;
          if (X >= N || Y >= N) break;
          if (tall[Y * N + X] - h >= s) {
            shade[p] = h ? 1 : 2;
            break;
          }
        }
      }
    for (let p = 0; p < N * N; p++) {
      if (!shade[p]) continue;
      const k = shade[p] === 2 ? 0.7 : 0.82;
      px[p * 4] *= k;
      px[p * 4 + 1] *= k;
      px[p * 4 + 2] *= k * 1.06;
    }
  }

  /* the clouds (coarser: 10 m to the pixel): soft cumulus lit from the south-west, their shadows */
  const C = CLOUDS;
  const clouds = new ImageData(C, C);
  const cp = clouds.data;
  const cput = (x: number, y: number, c: RGB, a: number) => {
    if (x < 0 || y < 0 || x >= C || y >= C) return;
    const i = (y * C + x) * 4;
    cp[i] = c[0];
    cp[i + 1] = c[1];
    cp[i + 2] = c[2];
    cp[i + 3] = Math.max(cp[i + 3], Math.round(a * 255));
  };
  const blobs: [number, number, number, number][] = [
    [40, 44, 22, 9],
    [196, 62, 26, 10],
    [64, 196, 24, 9],
    [206, 204, 18, 7],
    [128, 18, 16, 6],
    // the ones the dive falls through
    ...([
      [96, 100, 14, 6],
      [170, 152, 16, 7],
      [150, 98, 10, 4],
    ] as [number, number, number, number][]).slice(0, Math.max(0, Math.min(3, near))),
  ];
  const inCloud = (x: number, y: number, cx: number, cy: number, w: number, h: number) => {
    let e = 1e9;
    for (const [ox, oy, k] of [
      [-0.45, 0.1, 0.6],
      [0, -0.2, 0.75],
      [0.4, 0.05, 0.65],
      [0.1, 0.3, 0.7],
    ]) {
      const dx = (x - (cx + ox * w)) / (w * k);
      const dy = (y - (cy + oy * h * 2)) / (h * k);
      e = Math.min(e, dx * dx + dy * dy);
    }
    return e;
  };
  for (const [cx, cy, w, h] of blobs)
    for (let y = cy - h * 2; y <= cy + h * 2; y++)
      for (let x = cx - w * 2; x <= cx + w * 2; x++) {
        const e = inCloud(x, y, cx, cy, w, h);
        if (e >= 1) continue;
        const under = inCloud(x - 2, y - 3, cx, cy, w, h) <= 1 && inCloud(x + 2, y + 3, cx, cy, w, h) > 1;
        const top = inCloud(x - 2, y - 2, cx, cy, w, h) > 1;
        if (e > 0.86 && bayer(x, y) >= 0.6) continue;
        cput(x, y, e > 0.86 ? [233, 238, 236] : under ? [196, 205, 207] : top ? [255, 255, 255] : [238, 241, 238], 1);
      }

  const riverX = (y: number) => bend((N + 8 * K - y) / (N + 20 * K)) + shift;
  return { ground, kind, clouds, bridge: { x: bx, y: by }, riverX };
}

/** the light the map is painted in: noon's ambient and sun (light.ts), so noon leaves it as it is */
const NOON: RGB = [1.34, 1.39, 1.38];
/** moonlight: the river and the streets still read on the darkest night */
const MOON: RGB = [0.21, 0.24, 0.35];

/**
 * The map in the Desktop's own light for an instant (`skyLight`, the
 * wallpaper's model): the same ambient and sun the city on the wallpaper
 * gets, so the arrival lands in the hour the Desktop shows. At night the
 * streets light up in sodium (a web, densest in the old town), a few
 * windows come on, the quays get their lamps and the clouds go grey-blue. Returns
 * which cells are lit windows and which are water: the flight draws
 * windows as points however close it gets, and lets the river mirror the sky.
 */
export function lightToulouse(
  map: ToulouseMap,
  L: { amb: RGB; sunTint: RGB; sun: { elevation: number }; stars: number }
) {
  const up = Math.max(0, Math.sin((L.sun.elevation * Math.PI) / 180));
  const k = [0, 1, 2].map((c) => Math.min(1.12, Math.max(MOON[c] * L.stars, (L.amb[c] + L.sunTint[c] * up) / NOON[c])));
  const g = map.ground.data;
  const N = map.ground.width;
  const lights = new Uint8Array(N * N);
  const water = new Uint8Array(N * N);
  for (let p = 0; p < N * N; p++) if (map.kind[p] === KIND.WATER) water[p] = 1;
  const byWater = (p: number) => {
    const x = p % N;
    const y = (p / N) | 0;
    for (let j = -4; j <= 4; j++)
      for (let k2 = -4; k2 <= 4; k2++) {
        const X = x + k2;
        const Y = y + j;
        if (X >= 0 && Y >= 0 && X < N && Y < N && water[Y * N + X]) return true;
      }
    return false;
  };
  for (let i = 0; i < g.length; i += 4) {
    const r = g[i];
    const gr = g[i + 1];
    const b = g[i + 2];
    const p = i >> 2;
    const kind = map.kind[p];
    // the quays and the bridges carry lamps after dark, a few cells apart (3: lamp white)
    if (L.stars > 0.25 && kind === KIND.GROUND && r > 150 && gr > 125 && b > 100 && r - b < 56 && hash(p % N, (p / N) | 0, 11) < 0.17 * L.stars && byWater(p)) lights[p] = 3;
    // after dark the streets: sodium lamps every few cells along them, the old town's closest together
    const old = kind === KIND.OLD_STREET;
    if (L.stars > 0.25 && (old || kind === KIND.STREET)) {
      if (hash(p % N, (p / N) | 0, 13) < (old ? 0.15 : 0.08) * L.stars) lights[p] = 1;
    }
    // and a few windows in the brick: warm, never everywhere (1: lamp-warm, 2: brighter)
    else if (L.stars > 0.25 && r > gr + 24 && r > b + 24) {
      const h = hash(p % N, (p / N) | 0, 9);
      if (h < 0.02 * L.stars) lights[p] = h < 0.008 * L.stars ? 2 : 1;
    }
    g[i] = r * k[0];
    g[i + 1] = gr * k[1];
    g[i + 2] = b * k[2];
  }
  const c = map.clouds.data;
  for (let i = 0; i < c.length; i += 4) {
    if (!c[i + 3]) continue;
    c[i] = c[i] * Math.min(1, k[0] + 0.1);
    c[i + 1] = c[i + 1] * Math.min(1, k[1] + 0.1);
    c[i + 2] = c[i + 2] * Math.min(1, k[2] + 0.12);
  }
  return { lights, water };
}

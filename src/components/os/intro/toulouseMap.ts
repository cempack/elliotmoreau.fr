/**
 * Toulouse from above, in pixels, north up, 5 m to the pixel: fields in a
 * patchwork around the faubourgs (houses, gardens) and the pink old town
 * (blocks of brick roofs, each building its own shade and ridge, a
 * courtyard in the bigger ones, narrow streets, the Rue de Metz and the
 * Rue d'Alsace-Lorraine through them), the Garonne's long bend with its
 * stone quays and the Île du Ramier, the Canal du Midi lined with plane
 * trees, the parks, the Capitole on its square, Saint-Sernin, La Grave and
 * its dome, and the Pont Neuf a little south of the middle (the arrival
 * comes in from the north, down the river). Clouds are a separate, coarser
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

/** a jittered-grid Voronoi: the nearest seed (its id), how far it is, and whether we're on an edge (`w` wide) */
function voronoi(g: number, salt: number, w = 1) {
  const out = { id: 0, d: 0, edge: false };
  return (x: number, y: number) => {
    const gx = Math.floor(x / g);
    const gy = Math.floor(y / g);
    let b1 = 1e9;
    let b2 = 1e9;
    let id = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = gx + i;
        const cy = gy + j;
        const sx = (cx + 0.15 + hash(cx, cy, salt) * 0.7) * g;
        const sy = (cy + 0.15 + hash(cy, cx, salt + 1) * 0.7) * g;
        const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
        if (d < b1) {
          b2 = b1;
          b1 = d;
          id = cx * 7919 + cy * 104729 + salt;
        } else if (d < b2) b2 = d;
      }
    out.id = id;
    out.d = Math.sqrt(b1);
    out.edge = Math.sqrt(b2) - out.d < w;
    return out;
  };
}

export type ToulouseMap = {
  ground: ImageData;
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
  const put = (x: number, y: number, c: RGB, a = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    px[i] = px[i] + (c[0] - px[i]) * a;
    px[i + 1] = px[i + 1] + (c[1] - px[i + 1]) * a;
    px[i + 2] = px[i + 2] + (c[2] - px[i + 2]) * a;
    px[i + 3] = 255;
  };
  const disc = (cx: number, cy: number, r: number, c: RGB, lit?: RGB) => {
    for (let j = -Math.ceil(r); j <= r; j++)
      for (let i = -Math.ceil(r); i <= r; i++) {
        const q = (i * i + j * j) / (r * r);
        if (q > 1) continue;
        // a canopy catches the light on its upper left
        put(cx + i, cy + j, lit && i + j < -r * 0.4 && q < 0.7 ? lit : c);
      }
  };

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

  /* fields, faubourgs, the old town: blocks of buildings, each its own roof */
  const fields = voronoi(15 * K, 3);
  const town = voronoi(5 * K, 9, 1.1);
  const lots = voronoi(2.3 * K, 21, 0.8);
  const FIELDS = ["#7d8a55", "#8f9660", "#a59a62", "#6f8350", "#b7a774", "#8a7f52", "#9aa070"].map(hex);
  const OLD = ["#c06a52", "#b25e48", "#d08268", "#b8644e", "#c87760"].map(hex);
  const STREET_OLD = hex("#6e3d33");
  const STREET = hex("#8a7464");
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot((x - cx0) / 1.15, (y - cy0) / 0.95) / K;
      let c: RGB;
      if (d < 70) {
        const v = town(x, y);
        const old = d < 40;
        if (v.edge) c = old ? STREET_OLD : STREET;
        else if (old && v.d < 1.1 * K && hash(v.id, 5) < 0.3) {
          // now and then a courtyard: old paving, or a garden
          c = hash(v.id, 6) < 0.35 ? hex("#7a7a58") : hex("#8c6656");
        } else {
          const vid = v.id;
          const l = lots(x, y);
          const r = hash(l.id, 1);
          if (old) {
            c = OLD[Math.floor(r * OLD.length)];
            // the ridge: tiles run one way or the other, building by building
            if (((hash(l.id, 2) < 0.5 ? x : y) & 1) === 0) c = shadeRGB(c, -0.07);
            if (l.edge) c = shadeRGB(c, -0.16);
          } else {
            // the faubourgs: houses and their gardens, some blocks more garden than house
            const garden = r < 0.28 + hash(vid, 3) * 0.2;
            if (garden) c = hash(x >> 1, y >> 1, 4) < 0.2 ? hex("#4f6b3e") : hex("#6c8a52");
            else c = r < 0.62 ? hex("#b57a62") : r < 0.82 ? hex("#c08a70") : hex("#a89880");
            if (!garden && ((hash(l.id, 2) < 0.5 ? x : y) & 1) === 0) c = shadeRGB(c, -0.06);
            if (l.edge) c = garden ? shadeRGB(c, -0.1) : shadeRGB(c, -0.14);
          }
        }
      } else {
        const v = fields(x, y);
        const r1 = hash(v.id, 5);
        const r2 = hash(v.id, 6);
        c = FIELDS[Math.floor(r1 * FIELDS.length)];
        if ((r2 < 0.5 ? x : y) % 3 === 0) c = shadeRGB(c, -0.07);
        if (v.edge) c = r2 < 0.3 ? hex("#4f6b3e") : shadeRGB(c, -0.15);
      }
      put(x, y, c);
    }

  // the two streets that cross the old town: the Rue de Metz east from the Pont Neuf, the Rue d'Alsace-Lorraine north–south
  for (let x = bx + 10 * K; x < cx0 + 34 * K; x++) for (let k = 0; k < 2; k++) put(x, by + K + k, STREET_OLD);
  for (let y = cy0 - 34 * K; y < cy0 + 12 * K; y++) for (let k = 0; k < 2; k++) put(cx0 + 6 * K + k, y, STREET_OLD);

  // parks: the Jardin des Plantes, the Grand Rond, the Prairie des Filtres; trees in them
  const parks: [number, number, number, number][] = [
    [cx0 + 16 * K, cy0 + 18 * K, 7 * K, 6 * K],
    [cx0 + 9 * K, cy0 + 11 * K, 4 * K, 4 * K],
    [bx - 14 * K, by + 10 * K, 5 * K, 7 * K],
  ];
  for (const [gx, gy, rx, ry] of parks) {
    for (let j = -ry; j <= ry; j++)
      for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) put(gx + i, gy + j, hash(gx + i, gy + j, 7) < 0.3 ? hex("#55804a") : hex("#5d8a4e"));
    for (let k = 0; k < (rx * ry) / 9; k++) {
      const a = hash(gx, k, 31) * Math.PI * 2;
      const q = Math.sqrt(hash(gy, k, 32)) * 0.8;
      disc(gx + Math.cos(a) * rx * q, gy + Math.sin(a) * ry * q, 1.4 + hash(k, gx, 33) * 1.2, hex("#2f5a34"), hex("#447a46"));
    }
  }

  // the Canal du Midi: in from the south-east, round the east and north of
  // the centre, into the Garonne at the Ponts-Jumeaux; plane trees on both banks
  for (let t = 0; t <= 1; t += 0.001 / K) {
    const a = -0.35 + t * 2.8;
    const x = cx0 + 6 * K + Math.cos(a) * 50 * K;
    const y = cy0 + 8 * K - Math.sin(a) * 46 * K;
    for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) if (k * k + m * m <= 1) put(x + k, y + m, hex("#4f8a92"));
  }
  for (let t = 0; t <= 1; t += 0.0035 / K) {
    const a = -0.35 + t * 2.8;
    for (const off of [-3.2, 3.2]) {
      const rr = 50 * K + off;
      disc(cx0 + 6 * K + Math.cos(a) * rr, cy0 + 8 * K - Math.sin(a) * (rr * 0.92), 1.3, hex("#2f5a34"), hex("#447a46"));
    }
  }

  // the river, its quays
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
      else put(X, Y, Math.abs(k) > w - 1.5 * K ? W3 : bayer(X >> 1, Y >> 1) < 0.12 ? W2 : W1);
    }
  // the Île du Ramier, upstream
  const isle = river.find((p) => Math.abs(p[1] - (by + 50 * K)) < 1);
  if (isle)
    for (let j = -14 * K; j <= 14 * K; j++)
      for (let i = -3 * K; i <= 3 * K; i++) {
        const w = 3 * K * (1 - Math.abs(j) / (15 * K));
        if (Math.abs(i) <= w) put(isle[0] + i, isle[1] + j, Math.abs(i) > w - K ? hex("#5d7f45") : hex("#6f9a55"));
      }

  // the Pont Neuf: its deck, the cutwaters of its piers, its shadow on the water
  for (let i = -10 * K; i <= 10 * K; i++) {
    for (let k = 0; k < 2 * K; k++) put(bx + i, by + k, hex("#e8d6bc"));
    for (let k = 0; k < K; k++) put(bx + i, by + 2 * K + k, hex("#7a5c4c"));
  }
  for (let k = -7 * K; k <= 7 * K; k += 4 * K) {
    put(bx + k, by - 1, hex("#d4c0a6"));
    put(bx + k + 1, by - 1, hex("#d4c0a6"));
    put(bx + k, by + 3 * K, hex("#2b4c52"));
  }
  // the Capitole on its square (its long front on the east side)
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 20; i++) put(cx0 + 4 * K + i, cy0 - 8 * K + j, i > 15 ? (i === 16 || j === 0 || j === 15 ? hex("#c9b89c") : hex("#e4d6bd")) : (i + j) % 4 === 0 ? hex("#d8c9ae") : hex("#e2d4ba"));
  // Saint-Sernin: a cross of roofs, its tower at the crossing
  {
    const sx = cx0 + 2 * K;
    const sy = cy0 - 27 * K;
    for (let i = -9; i <= 9; i++) for (let k = -2; k <= 2; k++) put(sx + i, sy + k, Math.abs(k) === 2 ? hex("#8a5446") : hex("#a8645a"));
    for (let j = -6; j <= 6; j++) for (let k = -2; k <= 2; k++) put(sx - 3 + k, sy + j, Math.abs(k) === 2 ? hex("#8a5446") : hex("#a8645a"));
    disc(sx - 3, sy, 1.6, hex("#d8b8a0"));
  }
  // La Grave: the hospital round its courtyard, the verdigris dome
  {
    const gx = bx - 13 * K;
    const gy = by - 6 * K;
    for (let j = -7; j <= 7; j++)
      for (let i = -9; i <= 9; i++) {
        const ring = Math.abs(i) > 6 || Math.abs(j) > 4;
        put(gx + i, gy + j, ring ? ((Math.abs(i) + Math.abs(j)) & 1 ? hex("#c9907a") : hex("#bd8470")) : hex("#6f8a58"));
      }
    disc(gx, gy, 4.2, hex("#3f7a68"), hex("#5f9c86"));
    disc(gx, gy, 1.2, hex("#2e5a4e"));
    put(gx, gy, hex("#d8c8a8"));
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
  return { ground, clouds, bridge: { x: bx, y: by }, riverX };
}

/** the light the map is painted in: noon's ambient and sun (light.ts), so noon leaves it as it is */
const NOON: RGB = [1.34, 1.39, 1.38];
/** moonlight: the river and the streets still read on the darkest night */
const MOON: RGB = [0.21, 0.24, 0.35];
/** the streets between the blocks (paintToulouse's): the old town's, the faubourgs' */
const STREET_OLD = hex("#6e3d33");
const STREET = hex("#8a7464");

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
  for (let i = 0; i < g.length; i += 4) if (g[i + 2] > g[i] + 30 && g[i + 1] > g[i] + 20) water[i >> 2] = 1;
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
    // the quays and the bridges carry lamps after dark, a few cells apart (3: lamp white)
    if (L.stars > 0.25 && !water[p] && r > 150 && gr > 125 && b > 100 && r - b < 56 && hash(p % N, (p / N) | 0, 11) < 0.17 * L.stars && byWater(p)) lights[p] = 3;
    // after dark the streets: sodium lamps every few cells along them, the old town's closest together
    const old = r === STREET_OLD[0] && gr === STREET_OLD[1] && b === STREET_OLD[2];
    if (L.stars > 0.25 && (old || (r === STREET[0] && gr === STREET[1] && b === STREET[2]))) {
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

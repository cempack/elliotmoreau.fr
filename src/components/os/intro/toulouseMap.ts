/**
 * Toulouse from above, in pixels, north up: fields in a patchwork around
 * the faubourgs and the pink old town, the Garonne's long bend with its
 * stone quays and the Île du Ramier, the Canal du Midi lined with plane
 * trees, the parks, the Capitole's square, the Dôme de la Grave and the
 * Pont Neuf a little south of the middle (the arrival comes in from the
 * north, down the river, and lands short of it). Clouds are a separate
 * layer: the flight casts their shadows on the town.
 */

export const MAP = 256;

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const hash = (x: number, y: number, s = 0) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
type RGB = [number, number, number];
const hex = (c: string): RGB => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shadeRGB = (c: RGB, k: number): RGB => (k >= 0 ? (c.map((v) => v + (255 - v) * k) as RGB) : (c.map((v) => v * (1 + k)) as RGB));

/** a jittered-grid Voronoi: the nearest seed (its id) and whether we're on an edge */
function voronoi(g: number, salt: number) {
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
    return { id, edge: Math.sqrt(b2) - Math.sqrt(b1) < 1 };
  };
}

export type ToulouseMap = {
  ground: ImageData;
  clouds: ImageData;
  /** the Pont Neuf, in map pixels */
  bridge: { x: number; y: number };
  /** the Garonne's middle at a map row, smooth (the flight follows it in to the Pont Saint-Pierre) */
  riverX: (y: number) => number;
};

/** `near`: how many clouds drift close over the Pont Neuf (today's weather: one on a clear day, three when it's grey) */
export function paintToulouse(near = 1): ToulouseMap {
  const N = MAP;
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

  // the Garonne: from the south, a long bend, out to the north-west; the
  // Pont Neuf centred across, south of the middle (room to fly in from the north)
  const bend = (t: number) => 150 + Math.sin(t * Math.PI * 1.15 + 0.2) * 24 - t * 70;
  const river: [number, number, number][] = [];
  for (let t = 0; t <= 1; t += 0.0015) river.push([bend(t), N + 8 - t * (N + 20), 6 + Math.sin(t * 6) * 1]);
  const mid = river.reduce((b, p) => (Math.abs(p[1] - N * 0.6) < Math.abs(b[1] - N * 0.6) ? p : b));
  const shift = N / 2 - mid[0];
  for (const p of river) p[0] += shift;
  const bx = Math.round(mid[0]);
  const by = Math.round(mid[1]);
  const cx0 = bx + 24;
  const cy0 = by + 2;

  /* fields, faubourgs, the old town: three patchworks */
  const fields = voronoi(15, 3);
  const town = voronoi(5, 9);
  const FIELDS = ["#7d8a55", "#8f9660", "#a59a62", "#6f8350", "#b7a774", "#8a7f52", "#9aa070"].map(hex);
  const OLD = ["#c06a52", "#b25e48", "#d08268"].map(hex);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot((x - cx0) / 1.15, (y - cy0) / 0.95);
      let c: RGB;
      if (d < 40) {
        const v = town(x, y);
        const r = hash(v.id, 1);
        c = v.edge ? hex("#6e3d33") : OLD[r < 0.5 ? 0 : r < 0.85 ? 1 : 2];
        if (!v.edge && (x + y) % 3 === 0 && hash(v.id, 2) < 0.5) c = shadeRGB(c, -0.08);
      } else if (d < 70) {
        const v = town(x, y);
        const r = hash(v.id, 3);
        c = v.edge ? hex("#8a7464") : r < 0.35 ? hex("#5f7a4a") : r < 0.7 ? hex("#b57a62") : hex("#a89880");
        if (!v.edge && r >= 0.35 && hash(x, y, 4) < 0.22) c = hex("#7f9a5e");
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

  // parks: the Jardin des Plantes, the Grand Rond, the Prairie des Filtres
  const parks: [number, number, number, number][] = [
    [cx0 + 16, cy0 + 18, 7, 6],
    [cx0 + 9, cy0 + 11, 4, 4],
    [bx - 14, by + 10, 5, 7],
  ];
  for (const [gx, gy, rx, ry] of parks)
    for (let j = -ry; j <= ry; j++)
      for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) put(gx + i, gy + j, hash(gx + i, gy + j, 7) < 0.35 ? hex("#3f6a3a") : hex("#5d8a4e"));

  // the Canal du Midi: in from the south-east, round the east and north of
  // the centre, into the Garonne at the Ponts-Jumeaux; plane trees on both banks
  for (let t = 0; t <= 1; t += 0.002) {
    const a = -0.35 + t * 2.8;
    const x = Math.round(cx0 + 6 + Math.cos(a) * 50);
    const y = Math.round(cy0 + 8 - Math.sin(a) * 46);
    put(x, y, hex("#4f8a92"));
    put(x, y + 1, hex("#4f8a92"));
    if (hash(x, y, 8) < 0.7) {
      put(x + 1, y - 1, hex("#2f5a34"));
      put(x - 1, y + 2, hex("#2f5a34"));
    }
  }

  // the river, its quays
  const QUAY_HI = hex("#d8c6ae");
  const QUAY = hex("#a08a74");
  const W1 = hex("#3f6c73");
  const W2 = hex("#5b8d90");
  const W3 = hex("#4f8085");
  for (const [x, y, w] of river)
    for (let k = -w - 2; k <= w + 2; k++) {
      const X = Math.round(x + k);
      const Y = Math.round(y);
      if (Math.abs(k) > w) put(X, Y, Math.abs(k) > w + 1 ? QUAY : QUAY_HI);
      else put(X, Y, Math.abs(k) > w - 1.5 ? W3 : bayer(X, Y) < 0.12 ? W2 : W1);
    }
  // the Île du Ramier, upstream
  const isle = river.find((p) => Math.abs(p[1] - (by + 50)) < 1);
  if (isle)
    for (let j = -14; j <= 14; j++)
      for (let i = -3; i <= 3; i++) {
        const w = 3 * (1 - Math.abs(j) / 15);
        if (Math.abs(i) <= w) put(isle[0] + i, isle[1] + j, Math.abs(i) > w - 1 ? hex("#5d7f45") : hex("#6f9a55"));
      }

  // the Pont Neuf, the Capitole's square, the Dôme de la Grave
  for (let i = -10; i <= 10; i++) {
    put(bx + i, by, hex("#e8d6bc"));
    put(bx + i, by + 1, hex("#e8d6bc"));
    put(bx + i, by + 2, hex("#7a5c4c"));
  }
  for (let k = -7; k <= 7; k += 4) put(bx + k, by + 3, hex("#2b4c52"));
  for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) put(cx0 + 4 + i, cy0 - 8 + j, j === 0 || i === 0 || j === 4 || i === 5 ? hex("#eadfca") : hex("#d6c6ac"));
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) put(bx - 13 + i, by - 6 + j, hex("#4f9a84"));
  put(bx - 13, by - 9, hex("#e8d6bc"));

  /* the clouds: soft cumulus lit from the south-west, their shadows */
  const clouds = new ImageData(N, N);
  const cp = clouds.data;
  const cput = (x: number, y: number, c: RGB, a: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
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
  const SHADOW: RGB = [16, 22, 26];
  for (const [cx, cy, w, h] of blobs)
    for (let y = cy - h * 2 + 6; y <= cy + h * 2 + 6; y++)
      for (let x = cx - w * 2 + 8; x <= cx + w * 2 + 8; x++) if (inCloud(x - 8, y - 6, cx, cy, w, h) < 1 && bayer(x, y) < 0.55) cput(x, y, SHADOW, 0.32);
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

  const riverX = (y: number) => bend((N + 8 - y) / (N + 20)) + shift;
  return { ground, clouds, bridge: { x: bx, y: by }, riverX };
}

/** the light the map is painted in: noon's ambient and sun (light.ts), so noon leaves it as it is */
const NOON: RGB = [1.34, 1.39, 1.38];
/** moonlight: the river and the streets still read on the darkest night */
const MOON: RGB = [0.21, 0.24, 0.35];
/** the streets between the blocks (toulouseMap's Voronoi edges): the old town's, the faubourgs' */
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
    for (let j = -2; j <= 2; j++)
      for (let k2 = -2; k2 <= 2; k2++) {
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
    if (L.stars > 0.25 && !water[p] && r > 150 && gr > 125 && b > 100 && r - b < 56 && hash(p % N, (p / N) | 0, 11) < 0.34 * L.stars && byWater(p)) lights[p] = 3;
    // after dark the streets: sodium lamps every few cells along them, the old town's closest together
    const old = r === STREET_OLD[0] && gr === STREET_OLD[1] && b === STREET_OLD[2];
    if (L.stars > 0.25 && (old || (r === STREET[0] && gr === STREET[1] && b === STREET[2]))) {
      if (hash(p % N, (p / N) | 0, 13) < (old ? 0.3 : 0.16) * L.stars) lights[p] = 1;
    }
    // and a few windows in the brick: warm, never everywhere (1: lamp-warm, 2: brighter)
    else if (L.stars > 0.25 && r > gr + 24 && r > b + 24) {
      const h = hash(p % N, (p / N) | 0, 9);
      if (h < 0.04 * L.stars) lights[p] = h < 0.016 * L.stars ? 2 : 1;
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

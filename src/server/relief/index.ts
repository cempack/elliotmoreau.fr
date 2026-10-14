import "server-only";
import { inflateSync } from "node:zlib";
import { BORDERS } from "./borders";

/**
 * The Atlas relief: a place's country as a heightmap, for the block that
 * comes up off the globe in its card. The outline is Natural Earth's
 * (borders.ts); the heights are AWS's open Terrain Tiles in Terrarium form
 * (https://registry.opendata.aws/terrain-tiles/: SRTM, GMTED2010, ETOPO1
 * and others, © Mapzen and its sources), sampled once per place and kept.
 *
 * Which land: the island or landmass the place stands on (or the nearest
 * one), with the same country's smaller pieces close to it, so France
 * brings Corsica but not French Guiana, the Canaries come as the islands
 * and Northern Ireland without Great Britain.
 */

export type Relief = {
  /** cells across and down */
  W: number;
  H: number;
  /** the highest cell, in metres (a cell's average) */
  max: number;
  /** the highest ground the tiles show, in metres (a peak, as near as the tiles' resolution gets) */
  top: number;
  /** west, east, south, north edges, in degrees */
  b: [number, number, number, number];
  /** a cell's width in km */
  km: number;
  /**
   * a byte per cell, row by row from the north-west, base64: 0 is sea,
   * otherwise 1 + 254·√(height / max)
   */
  d: string;
};

type Ring = Float64Array; // lon, lat, lon, lat…
type Poly = { rings: Ring[]; x0: number; x1: number; y0: number; y1: number; area: number };

/** the longest side, in cells */
const N = 96;

let parsed: Record<string, number[][][]> | null = null;
const shapes = new Map<string, Poly[]>();
function polysOf(iso: string): Poly[] {
  const hit = shapes.get(iso);
  if (hit) return hit;
  parsed ??= JSON.parse(BORDERS) as Record<string, number[][][]>;
  const polys = (parsed[iso] ?? []).map((rings) => {
    const rs = rings.map((flat) => {
      const r = new Float64Array(flat.length);
      let x = 0;
      let y = 0;
      for (let i = 0; i < flat.length; i += 2) {
        x += flat[i];
        y += flat[i + 1];
        r[i] = x / 100;
        r[i + 1] = y / 100;
      }
      return r;
    });
    const o = rs[0];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let area = 0;
    for (let i = 0; i < o.length; i += 2) {
      const x = o[i];
      const y = o[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const j = (i + 2) % o.length;
      area += x * o[j + 1] - o[j] * y;
    }
    return { rings: rs, x0, x1, y0, y1, area: Math.abs(area / 2) * Math.cos(((y0 + y1) / 2) * (Math.PI / 180)) };
  });
  shapes.set(iso, polys);
  return polys;
}

/** even-odd: is (x, y) inside these rings? */
function inside(rings: Ring[], x: number, y: number) {
  let c = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i + 1];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
    }
  return c;
}

const gap = (a: Poly, b: Poly) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

/** the land a place stands on: its piece of its country, and the smaller pieces near it */
export function landOf(iso: string, lat: number, lon: number) {
  // pieces that straddle the antimeridian would make a block round the world
  const polys = polysOf(iso).filter((p) => p.x1 - p.x0 < 180);
  if (!polys.length) return null;
  let main = polys.find((p) => lon >= p.x0 && lon <= p.x1 && lat >= p.y0 && lat <= p.y1 && inside(p.rings, lon, lat));
  if (!main) {
    const dist = (p: Poly) => Math.hypot(Math.max(0, p.x0 - lon, lon - p.x1), Math.max(0, p.y0 - lat, lat - p.y1));
    main = polys.reduce((a, b) => (dist(b) < dist(a) || (dist(b) === dist(a) && b.area > a.area) ? b : a));
  }
  // a smaller piece comes along when its nearest bigger piece (by bounding box) does and is near
  const size = Math.max(main.x1 - main.x0, main.y1 - main.y0);
  const reach = Math.min(4, Math.max(2, size * 0.3));
  const near = [main];
  const byArea = [...polys].sort((p, q) => q.area - p.area);
  byArea.forEach((p, k) => {
    if (p.area >= main.area) return;
    let parent: Poly | null = null;
    for (let i = 0; i < k; i++) if (!parent || gap(byArea[i], p) < gap(parent, p)) parent = byArea[i];
    if (parent && near.includes(parent) && gap(parent, p) < reach) near.push(p);
  });
  return { main: polys.indexOf(main), polys: near };
}

/* ── Terrarium tiles: 256² PNGs, height = r·256 + g + b/256 − 32768 metres ── */

/** an 8-bit RGB or RGBA PNG, unfiltered into its pixels */
function decodePng(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let w = 0;
  let h = 0;
  let type = 0;
  const idat: Uint8Array[] = [];
  for (let o = 8; o < buf.length; ) {
    const n = dv.getUint32(o);
    const kind = String.fromCharCode(buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7]);
    const body = buf.subarray(o + 8, o + 8 + n);
    if (kind === "IHDR") {
      w = dv.getUint32(o + 8);
      h = dv.getUint32(o + 12);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("png: unsupported");
      type = body[9];
    } else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    o += 12 + n;
  }
  const bpp = type === 2 ? 3 : type === 6 ? 4 : 0;
  if (!bpp) throw new Error("png: unsupported colour type");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y ? px[row - stride + x] : 0;
      const c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = v & 255;
    }
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = px[i * bpp] * 256 + px[i * bpp + 1] + px[i * bpp + 2] / 256 - 32768;
  return out;
}

async function tile(z: number, x: number, y: number) {
  const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, {
    signal: AbortSignal.timeout(10_000),
    // a tile never changes
    next: { revalidate: false },
  });
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: ${res.status}`);
  return decodePng(new Uint8Array(await res.arrayBuffer()));
}

const RAD = Math.PI / 180;

/** summits looked at closely for the readout's highest ground */
const PEAKS = 6;

async function bake(polys: Poly[]): Promise<Relief> {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of polys) {
    x0 = Math.min(x0, p.x0);
    x1 = Math.max(x1, p.x1);
    y0 = Math.min(y0, p.y0);
    y1 = Math.max(y1, p.y1);
  }
  const padX = (x1 - x0) * 0.01 + 0.01;
  const padY = (y1 - y0) * 0.01 + 0.01;
  x0 -= padX;
  x1 += padX;
  y0 = Math.max(-84, y0 - padY);
  y1 = Math.min(84, y1 + padY);
  const kx = Math.cos(((y0 + y1) / 2) * RAD);
  const w = (x1 - x0) * kx;
  const h = y1 - y0;
  const W = w >= h ? N : Math.max(8, Math.round((N * w) / h));
  const H = w >= h ? Math.max(8, Math.round((N * h) / w)) : N;

  // the land, 4×4 samples a cell, half of them in for a cell to count
  const S = 4;
  const hits = new Uint8Array(W * H);
  const rings = polys.flatMap((p) => p.rings);
  for (let sy = 0; sy < H * S; sy++) {
    const lat = y1 - ((sy + 0.5) / (H * S)) * (y1 - y0);
    const xs: number[] = [];
    for (const r of rings)
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const yi = r[i + 1];
        const yj = r[j + 1];
        if (yi > lat !== yj > lat) xs.push(((r[j] - r[i]) * (lat - yi)) / (yj - yi) + r[i]);
      }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(((xs[k] - x0) / (x1 - x0)) * W * S - 0.5));
      const b = Math.min(W * S - 1, Math.floor(((xs[k + 1] - x0) / (x1 - x0)) * W * S - 0.5));
      for (let sx = a; sx <= b; sx++) hits[((sy / S) | 0) * W + ((sx / S) | 0)]++;
    }
  }

  // tiles about twice as fine as a cell
  const cellDeg = (x1 - x0) / W;
  const z = Math.max(1, Math.min(10, Math.ceil(Math.log2(720 / (256 * cellDeg)))));
  const n = 2 ** z;
  const tx = (lon: number) => ((lon + 180) / 360) * n;
  const ty = (lat: number) => ((1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2) * n;
  const tiles = new Map<string, Promise<Float32Array>>();
  const need = (lon: number, lat: number) => {
    const fx = tx(lon);
    const fy = ty(lat);
    const X = Math.min(n - 1, Math.floor(fx));
    const Y = Math.min(n - 1, Math.floor(fy));
    const key = `${X},${Y}`;
    if (!tiles.has(key)) tiles.set(key, tile(z, X, Y));
    return { key, px: Math.min(255, Math.floor((fx - X) * 256)), py: Math.min(255, Math.floor((fy - Y) * 256)) };
  };
  const at: { cell: number; key: string; i: number }[] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (hits[j * W + i] < (S * S) / 2) continue;
      for (const [a, b] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const s = need(x0 + ((i + a) / W) * (x1 - x0), y1 - ((j + b) / H) * (y1 - y0));
        at.push({ cell: j * W + i, key: s.key, i: s.py * 256 + s.px });
      }
    }
  const got = new Map<string, Float32Array>();
  await Promise.all([...tiles].map(async ([k, p]) => got.set(k, await p)));
  const sum = new Float32Array(W * H);
  const cnt = new Uint8Array(W * H);
  for (const s of at) {
    sum[s.cell] += Math.max(0, got.get(s.key)![s.i]);
    cnt[s.cell]++;
  }
  let max = 1;
  for (let c = 0; c < W * H; c++) if (cnt[c]) max = Math.max(max, sum[c] / cnt[c]);
  // the readout's highest ground: the land's highest tile pixels, then a closer look round each
  // (a few km a pixel flattens a summit by hundreds of metres)
  const peaks: { h: number; fx: number; fy: number }[] = [];
  for (const [k, hm] of got) {
    const [X, Y] = k.split(",").map(Number);
    for (let py = 0; py < 256; py++) {
      const fy = Y + (py + 0.5) / 256;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n))) / RAD;
      const j = Math.floor(((y1 - lat) / (y1 - y0)) * H);
      if (j < 0 || j >= H) continue;
      for (let px = 0; px < 256; px++) {
        const fx = X + (px + 0.5) / 256;
        const i = Math.floor((((fx / n) * 360 - 180 - x0) / (x1 - x0)) * W);
        const h = hm[py * 256 + px];
        if (i < 0 || i >= W || !cnt[j * W + i] || (peaks.length >= PEAKS && h <= peaks[PEAKS - 1].h)) continue;
        // a few summits at least a few pixels apart
        const near = peaks.findIndex((q) => Math.abs(q.fx - fx) * 256 < 4 && Math.abs(q.fy - fy) * 256 < 4);
        if (near >= 0) {
          if (h > peaks[near].h) peaks[near] = { h, fx, fy };
        } else peaks.push({ h, fx, fy });
        peaks.sort((a, b) => b.h - a.h);
        peaks.length = Math.min(peaks.length, PEAKS);
      }
    }
  }
  let top = Math.max(max, peaks[0]?.h ?? 0);
  const zr = Math.min(14, z + 5);
  const f = 2 ** (zr - z);
  await Promise.all(
    peaks.map(async (q) => {
      const gx = q.fx * f;
      const gy = q.fy * f;
      const X = Math.floor(gx);
      const Y = Math.floor(gy);
      const hm = await tile(zr, X, Y).catch(() => null);
      if (!hm) return;
      const cx = Math.floor((gx - X) * 256);
      const cy = Math.floor((gy - Y) * 256);
      const r = f;
      for (let py = Math.max(0, cy - r); py < Math.min(256, cy + r); py++)
        for (let px = Math.max(0, cx - r); px < Math.min(256, cx + r); px++) top = Math.max(top, hm[py * 256 + px]);
    })
  );
  const q = new Uint8Array(W * H);
  for (let c = 0; c < W * H; c++) if (cnt[c]) q[c] = 1 + Math.round(Math.sqrt(sum[c] / cnt[c] / max) * 254);
  return { W, H, max: Math.round(max), top: Math.round(top), b: [x0, x1, y0, y1], km: (cellDeg * kx * 111.32), d: Buffer.from(q).toString("base64") };
}

/** baked reliefs, by country and landmass; a failed bake is tried again next time */
const baked = new Map<string, Promise<Relief | null>>();

export function reliefOf(iso: string, lat: number, lon: number): Promise<Relief | null> {
  const land = landOf(iso.toUpperCase(), lat, lon);
  if (!land) return Promise.resolve(null);
  const key = `${iso}:${land.main}`;
  let hit = baked.get(key);
  if (!hit) {
    hit = bake(land.polys).catch((err) => {
      console.error("[relief]", key, err);
      baked.delete(key);
      return null;
    });
    baked.set(key, hit);
  }
  return hit;
}

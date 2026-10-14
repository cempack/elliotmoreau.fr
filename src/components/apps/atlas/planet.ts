import { toVec, type Vec3 } from "./geo";
import { INK, type RGB } from "./ink";
import { worldGrid } from "./land";

/**
 * A small, still pixel planet in the Atlas globe's inks: the same dithered
 * land, ocean grid, real sun and city lights, for places that want the
 * planet without the Atlas's camera (Mail's route, the arrival). It paints
 * into a raster of whole cells once per camera and sun; callers blit it
 * scaled with smoothing off, so it stays crisp at any size, and draw their
 * own markers on top using `project`.
 */

type InkName = keyof typeof INK;

/** RGBA packed for a little-endian Uint32 view of ImageData */
const pack = ([r, g, b]: RGB, k = 1) =>
  ((255 << 24) | (Math.round(b * k) << 16) | (Math.round(g * k) << 8) | Math.round(r * k)) >>> 0;
const PAL = Object.fromEntries(Object.entries(INK).map(([k, v]) => [k, [pack(v as RGB), pack(v as RGB, 0.6)]])) as Record<
  InkName,
  [number, number]
>;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const RAD = Math.PI / 180;

function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The subsolar point at `now` (declination from the day of the year, longitude from UTC). */
export function sunVector(now = new Date()): Vec3 {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = (now.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lon = (12 - hours) * 15;
  return toVec(decl, ((lon + 540) % 360) - 180);
}

export type Camera = { lat: number; lon: number; zoom: number };

/** Screen position (in cells, from the disc's centre, y down) of a place; `front` is false behind the planet. */
export function project(lat: number, lon: number, R: number, cam: Camera, lift = 1) {
  const f0 = cam.lat * RAD;
  const f = lat * RAD;
  const dl = (lon - cam.lon) * RAD;
  const x = Math.cos(f) * Math.sin(dl);
  const y = Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(dl);
  const z = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(dl);
  const r = R * cam.zoom * lift;
  return { x: x * r, y: -y * r, front: z > 0 };
}

/**
 * Paint the planet into `out` (a canvas of (2R+1)² pixels, one per cell):
 * the disc of radius R cells is a loupe on a planet R·zoom cells wide.
 */
export function paintPlanet(out: HTMLCanvasElement, R: number, cam: Camera, sun: Vec3) {
  const size = R * 2 + 1;
  if (out.width !== size || out.height !== size) {
    out.width = size;
    out.height = size;
  }
  const g = out.getContext("2d");
  if (!g) return;
  const img = g.createImageData(size, size);
  const px = new Uint32Array(img.data.buffer);
  const grid = worldGrid();
  const PR = R * cam.zoom;
  const f0 = cam.lat * RAD;
  const cf = Math.cos(f0);
  const sf = Math.sin(f0);
  const [s0, s1, s2] = sun;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - R;
      const dy = j - R;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R + R * 0.6) continue;
      const u = dx / PR;
      const v = -dy / PR;
      const q = u * u + v * v;
      if (q > 1) continue;
      const z = Math.sqrt(1 - q);
      const n = v * cf + z * sf;
      const lat = Math.asin(n > 1 ? 1 : n < -1 ? -1 : n) / RAD;
      let lon = cam.lon + Math.atan2(u, z * cf - v * sf) / RAD;
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      let row = ((90 - lat) * 2) | 0;
      let col = ((lon + 180) * 2) | 0;
      if (row > 359) row = 359;
      if (col > 719) col = 719;
      const cell = row * 720 + col;
      const land = grid[cell] === 1;
      const th = (BAYER[((j & 3) << 2) | (i & 3)] + 0.5) / 16;
      const cl = Math.cos(lat * RAD);
      const light = cl * Math.cos(lon * RAD) * s0 + cl * Math.sin(lon * RAD) * s1 + n * s2;
      const day = (light + 0.07) / 0.14 > th;
      let ink: InkName;
      if (land) {
        if (day) {
          const level = Math.max(0, light) * 2.2;
          if (lat > 63 || lat < -60) ink = level > th ? "iceHi" : "ice";
          else ink = level > 1 ? (level - 1 > th ? "landHi" : "land") : level > th ? "land" : "landLo";
        } else {
          const h = hash(cell);
          ink = h < 0.04 && lat < 70 && lat > -50 ? (h < 0.008 ? "lightHot" : "light") : th < 0.5 ? "landNight2" : "landNight";
        }
      } else {
        const onGrid = Math.abs(lat) < 0.42 || Math.abs(lon - Math.round(lon / 30) * 30) < 0.42;
        if (day) {
          if (onGrid) ink = "grid";
          else {
            const level = Math.max(0, light) * 1.7;
            ink = level > 1 ? (level - 1 > th ? "oceanLit" : "ocean") : level > th ? "ocean" : "oceanDeep";
          }
        } else ink = onGrid ? "gridNight" : th < 0.25 ? "oceanNight2" : "oceanNight";
      }
      // the limb darkens, in a dithered band
      const rim = q > 0.86 && th < (q - 0.86) * 7 ? 1 : 0;
      px[j * size + i] = PAL[ink][rim];
    }
  }
  g.putImageData(img, 0, 0);
}

/** Points along the great circle from a to b, `lift`ed off the surface in the middle (a flight path). */
export function route(a: { lat: number; lon: number }, b: { lat: number; lon: number }, n = 64) {
  const A = toVec(a.lat, a.lon);
  const B = toVec(b.lat, b.lon);
  const dot = Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const om = Math.acos(dot);
  const peak = 0.03 + 0.1 * (om / Math.PI);
  const pts: { lat: number; lon: number; lift: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let v: Vec3 = A;
    if (om > 1e-6) {
      const s = Math.sin(om);
      const ka = Math.sin((1 - t) * om) / s;
      const kb = Math.sin(t * om) / s;
      v = [A[0] * ka + B[0] * kb, A[1] * ka + B[1] * kb, A[2] * ka + B[2] * kb];
    }
    pts.push({ lat: Math.asin(v[2]) / RAD, lon: Math.atan2(v[1], v[0]) / RAD, lift: 1 + peak * Math.sin(Math.PI * t) });
  }
  return { pts, angle: om };
}

"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";
import type { Place } from "@/lib/places";
import { HOME } from "@/lib/places";
import { angleBetween, focusFor, slerp, toVec, worldGrid, type Vec3 } from "./geo";

/**
 * The Atlas globe: a dithered pixel planet you can throw.
 *
 * Grown out of components/PixelGlobe, rebuilt for the Atlas window:
 * - the planet is a true pixel raster: every 3px cell is inverse-projected
 *   to a latitude/longitude, looked up in a ½° land grid, and shaded with a
 *   Bayer dither, so coastlines crawl across a fixed pixel grid as it turns;
 * - day and night are live: the sun's real position lights it, the
 *   terminator is dithered, and city lights flicker on the night side;
 * - drag spins it 1:1 from the grab point on both axes (latitude rubber-
 *   bands past its limits); a throw carries on with momentum and decays
 *   like a scroll view; grabbing mid-flight catches it;
 * - choosing a place flies the camera on a critically damped spring to
 *   the middle of the route from home, so the whole great-circle arc is on
 *   the near side, and the arc draws itself out of France; home shows every
 *   route at once, a small flight network;
 * - when a sheet rises over it (`lift`), the planet shrinks and climbs
 *   into the room left above the sheet by being redrawn at its new size,
 *   never by scaling the canvas, so the pixel grid stays crisp at every
 *   size and during the drag;
 * - sized by a ResizeObserver, DPR capped at 2, painted on demand: the loop
 *   runs only while something moves, or while `ambient` (lights, flights,
 *   idle drift) and on screen and the tab is visible; ambient-only frames
 *   paint at 30fps (the lights flicker at 1.6Hz), and the halo and orbit
 *   are cached per size;
 * - reduced motion: no ambient motion, no momentum, the camera cuts.
 */

const LIME: RGB = [198, 255, 94];
const EMBER: RGB = [255, 184, 107];
const ION: RGB = [139, 233, 255];
const PAPER = "#F5F2EC";

type RGB = [number, number, number];
type Arc = { to: Place; pts: Vec3[]; lift: number[]; cols: string[]; want: boolean; delay: number };

const RAD = Math.PI / 180;
const LAT_MIN = -55 * RAD;
const LAT_MAX = 68 * RAD;
/** a drag may rubber-band past the limits, never over a pole */
const LAT_HARD = 85 * RAD;
/** camera spring: critically damped, ω in rad/s (~0.85s to settle) */
const OMEGA = 5.6;
/** momentum decay time constant (s), close to a scroll view's feel */
const TAU = 0.42;
const ARC_DRAW = 1.05;
const PULSE_PERIOD = 3.4;
/** CSS px per planet pixel */
const CELL = 3;

function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** RGBA packed for a little-endian Uint32 view of ImageData */
const pack = ([r, g, b]: RGB, k = 1) =>
  ((255 << 24) | (Math.round(b * k) << 16) | (Math.round(g * k) << 8) | Math.round(r * k)) >>> 0;

/* the palette, in [lit, rim-darkened] pairs */
const INK = {
  oceanDeep: [10, 13, 38],
  ocean: [15, 20, 55],
  oceanLit: [25, 33, 84],
  oceanNight: [5, 6, 17],
  oceanNight2: [8, 9, 24],
  grid: [24, 31, 78],
  gridNight: [11, 13, 33],
  landLo: [58, 63, 140],
  land: [86, 93, 192],
  landHi: [136, 129, 234],
  ice: [178, 172, 234],
  iceHi: [216, 212, 247],
  landNight: [27, 29, 68],
  landNight2: [34, 37, 84],
  light: [255, 184, 107],
  lightHot: [245, 242, 236],
} satisfies Record<string, RGB>;
type InkName = keyof typeof INK;
const PAL = Object.fromEntries(
  Object.entries(INK).map(([k, v]) => [k, [pack(v as RGB), pack(v as RGB, 0.6)]])
) as Record<InkName, [number, number]>;

/** The sun's subsolar point right now (declination from the day of the
    year, longitude from UTC time; the equation of time is ignored). */
function sunVector(now = new Date()): Vec3 {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = (now.getTime() - start) / 86_400_000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const lon = (12 - hours) * 15;
  return toVec(decl, ((lon + 540) % 360) - 180);
}

const mix = (a: RGB, b: RGB, t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

const wrapPi = (a: number) => {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
};

function rubber(v: number, min: number, max: number, dim: number) {
  const k = 0.55;
  if (v < min) return min - ((min - v) * dim * k) / (dim + k * (min - v));
  if (v > max) return max + ((v - max) * dim * k) / (dim + k * (v - max));
  return v;
}

export type AtlasGlobeProps = {
  places: Place[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** allow autonomous motion (twinkle, flights, idle drift) */
  ambient: boolean;
  /** bump to fly back to the current selection */
  recenter?: number;
  /** gap between the rim and the canvas edge, CSS px */
  margin?: number;
  label: string;
  /** cursor label over the globe ("Spin") */
  spinLabel: string;
  /** live camera centre, for a readout (called only when it changes) */
  onCamera?: (lat: number, lon: number) => void;
  /** 0–1: how far a sheet has risen over the globe (1 = its half detent) */
  lift?: MotionValue<number>;
  /** height (px from the top) the planet must fit in at lift 1; 0 = all */
  liftRoom?: MotionValue<number>;
  className?: string;
};

export function AtlasGlobe({
  places,
  selectedId,
  onSelect,
  ambient,
  recenter = 0,
  margin = 28,
  label,
  spinLabel,
  onCamera,
  lift,
  liftRoom,
  className = "",
}: AtlasGlobeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // live props for the imperative loop (synced after commit)
  const live = useRef({ places, selectedId, onSelect, ambient, margin, spinLabel, onCamera });
  const api = useRef<{ focus: (cut: boolean) => void; wake: () => void } | null>(null);

  useEffect(() => {
    live.current = { places, selectedId, onSelect, ambient, margin, spinLabel, onCamera };
    api.current?.wake();
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    const ctx0 = cvs.getContext("2d");
    if (!ctx0) return;
    const ctx: CanvasRenderingContext2D = ctx0;
    const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mqReduced.matches;
    // phones keep the lights and flights but not the idle drift: it
    // re-projects the whole planet every frame
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const grid = worldGrid();
    const homeV = toVec(HOME.lat, HOME.lon);

    // ── camera: centre latitude/longitude (radians), springs + momentum ──
    const cam = {
      lat: 0,
      lon: 0,
      vLat: 0,
      vLon: 0,
      tLat: null as number | null,
      tLon: null as number | null,
      coasting: false,
    };
    const start = focusFor(live.current.places.find((p) => p.id === live.current.selectedId) ?? HOME);
    cam.lat = Math.min(LAT_MAX, Math.max(LAT_MIN, start.lat * RAD));
    cam.lon = start.lon * RAD;

    let W = 0;
    let H = 0;
    let R = 0;
    let cx = 0;
    let cy = 0;
    let dpr = 1;
    /** the resting circle (no sheet over it) */
    let R0 = 0;
    let cy0 = 0;

    // ── the planet raster: one entry per cell inside the disc ──
    let buf: HTMLCanvasElement | null = null;
    let bctx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let px: Uint32Array = new Uint32Array(0);
    let bn = 0; // cells across the buffer
    let cN = 0; // cells inside the disc
    let cap = 0; // capacity of the per-cell arrays
    let cIdx = new Int32Array(0);
    let cE = new Float32Array(0);
    let cY = new Float32Array(0);
    let cZ = new Float32Array(0);
    let cTh = new Float32Array(0);
    let cRim = new Uint8Array(0);
    let sun = sunVector();
    let sunAt = performance.now();
    let rasterKey = "";

    /** Index the cells inside the disc. Runs on every radius change (a
        sheet drag changes it each frame), so the buffers are reused. */
    const buildRaster = () => {
      rasterKey = "";
      const nbn = Math.ceil((2 * R) / CELL) + 2;
      buf ??= document.createElement("canvas");
      if (nbn !== bn || !img || !bctx) {
        bn = nbn;
        buf.width = bn;
        buf.height = bn;
        bctx = buf.getContext("2d");
        if (!bctx) return;
        img = bctx.createImageData(bn, bn);
        px = new Uint32Array(img.data.buffer);
      } else px.fill(0);
      if (bn * bn > cap) {
        cap = bn * bn;
        cIdx = new Int32Array(cap);
        cE = new Float32Array(cap);
        cY = new Float32Array(cap);
        cZ = new Float32Array(cap);
        cTh = new Float32Array(cap);
        cRim = new Uint8Array(cap);
      }
      const half = (bn * CELL) / 2;
      let n = 0;
      for (let j = 0; j < bn; j++) {
        for (let i = 0; i < bn; i++) {
          const e = ((i + 0.5) * CELL - half) / R;
          const y = (half - (j + 0.5) * CELL) / R;
          const rr = e * e + y * y;
          if (rr > 1) continue;
          const z = Math.sqrt(Math.max(0, 1 - rr));
          const th = (BAYER[((j & 3) << 2) | (i & 3)] + 0.5) / 16;
          cIdx[n] = j * bn + i;
          cE[n] = e;
          cY[n] = y;
          cZ[n] = z;
          cTh[n] = th;
          // the limb darkens: solid at the very edge, dithered just inside
          cRim[n] = z < 0.16 || (z < 0.3 && th > (z - 0.16) / 0.14) ? 1 : 0;
          n++;
        }
      }
      cN = n;
    };

    /** The circle for the current lift: from resting to the room above
        the sheet, in whole pixels; a new radius re-indexes the raster. */
    const fit = () => {
      let r = R0;
      let c = cy0;
      const l = lift ? Math.min(1, Math.max(0, lift.get())) : 0;
      const room = liftRoom ? liftRoom.get() : 0;
      if (l > 0 && room > 0 && room < H - 1) {
        const r1 = Math.min(R0, Math.max(40, Math.floor(Math.min(W, room) / 2 - live.current.margin)));
        r = Math.round(R0 + (r1 - R0) * l);
        c = Math.round(cy0 + (room / 2 - cy0) * l);
      }
      cy = c;
      if (r !== R) {
        R = r;
        buildRaster();
      }
    };

    /** Paint the planet into its buffer: inverse-project every cell, look
        the land up, light it by the real sun, dither. */
    const paintPlanet = (amb: boolean) => {
      if (!bctx || !img || !buf) return;
      const now = performance.now();
      if (now - sunAt > 10_000) {
        sun = sunVector();
        sunAt = now;
      }
      const flick = Math.floor(t * 1.6);
      // the raster only changes with the camera, the lights' flicker step
      // and the sun: while flights run over a still planet, reuse it
      const key = `${cam.lat}|${cam.lon}|${amb ? flick : -1}|${sunAt}|${bn}`;
      const size = bn * CELL;
      if (key === rasterKey) {
        ctx.drawImage(buf, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
        return;
      }
      rasterKey = key;
      const cl = Math.cos(-cam.lon);
      const sl = Math.sin(-cam.lon);
      const ct = Math.cos(cam.lat);
      const st = Math.sin(cam.lat);
      const [s0, s1, s2] = sun;
      for (let k = 0; k < cN; k++) {
        const e = cE[k];
        const y2 = cY[k];
        const z2 = cZ[k];
        const n = y2 * ct + z2 * st;
        const x = -y2 * st + z2 * ct;
        const v0 = x * cl + e * sl;
        const v1 = -x * sl + e * cl;
        const lat = Math.asin(n > 1 ? 1 : n < -1 ? -1 : n) / RAD;
        const lon = Math.atan2(v1, v0) / RAD;
        let row = ((90 - lat) * 2) | 0;
        let col = ((lon + 180) * 2) | 0;
        if (row > 359) row = 359;
        if (col > 719) col = 719;
        const cell = row * 720 + col;
        const land = grid[cell] === 1;
        const th = cTh[k];
        const light = v0 * s0 + v1 * s1 + n * s2;
        const day = (light + 0.07) / 0.14 > th;
        let ink: InkName;
        if (land) {
          if (day) {
            const level = Math.max(0, light) * 2.2;
            if (lat > 63 || lat < -60) ink = level > th ? "iceHi" : "ice";
            else ink = level > 1 ? (level - 1 > th ? "landHi" : "land") : level > th ? "land" : "landLo";
          } else {
            const h = hash(cell);
            if (h < 0.04 && lat < 70 && lat > -50) {
              const on = !amb || hash(cell + flick * 7919) > 0.18;
              ink = on ? (h < 0.008 ? "lightHot" : "light") : "landNight2";
            } else ink = th < 0.5 ? "landNight2" : "landNight";
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
        px[cIdx[k]] = PAL[ink][cRim[k]];
      }
      bctx.putImageData(img, 0, 0);
      ctx.drawImage(buf, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    };

    // ── arcs: one per route out of home, rebuilt on selection ──
    let arcs: Arc[] = [];
    let arcClock = 0; // seconds since the arcs started drawing
    let shownFor = "";
    const buildArcs = () => {
      const { places: ps, selectedId: sel } = live.current;
      shownFor = sel;
      arcs = ps
        .filter((p) => !p.home && p.id !== HOME.id)
        .map((p, i) => {
          const v = toVec(p.lat, p.lon);
          const ang = angleBetween(homeV, v);
          const n = Math.max(18, Math.ceil(ang * 120));
          const pts: Vec3[] = [];
          const lift: number[] = [];
          const cols: string[] = [];
          const peak = 0.03 + 0.1 * (ang / Math.PI);
          const end = p.status === "want" ? ION : EMBER;
          for (let k = 0; k <= n; k++) {
            const t = k / n;
            pts.push(slerp(homeV, v, t));
            lift.push(Math.sin(Math.PI * t) * peak);
            cols.push(mix(LIME, end, t));
          }
          return { to: p, pts, lift, cols, want: p.status === "want", delay: i * 0.07 };
        });
      arcClock = reduced ? 99 : 0;
    };

    // ── projection ──
    const P = { x: 0, y: 0, z: 0, vis: true };
    const project = (v: Vec3, h = 0) => {
      // rotate the centre longitude to the viewer, then tilt by its latitude
      const cl = Math.cos(-cam.lon);
      const sl = Math.sin(-cam.lon);
      const x = v[0] * cl - v[1] * sl; // towards viewer (before tilt)
      const e = v[0] * sl + v[1] * cl; // east
      const n = v[2]; // north
      const ct = Math.cos(cam.lat);
      const st = Math.sin(cam.lat);
      const y2 = n * ct - x * st;
      const z2 = n * st + x * ct;
      const k = 1 + h;
      P.x = cx + e * R * k;
      P.y = cy - y2 * R * k;
      P.z = z2;
      P.vis = z2 > 0 || (e * e + y2 * y2) * k * k > 1;
      return P;
    };

    // ── halo + dotted orbit: drawn once per size, then blitted ──
    let deco: HTMLCanvasElement | null = null;
    let decoKey = "";
    const paintDeco = () => {
      const ext = Math.ceil(R * 1.3) + 16;
      const size = ext * 2;
      const key = `${R}|${dpr}`;
      if (key !== decoKey) {
        deco ??= document.createElement("canvas");
        deco.width = Math.round(size * dpr);
        deco.height = Math.round(size * dpr);
        const d = deco.getContext("2d");
        if (!d) return;
        decoKey = key;
        d.setTransform(dpr, 0, 0, dpr, 0, 0);
        d.clearRect(0, 0, size, size);
        // atmosphere
        const halo = d.createRadialGradient(ext, ext, R * 0.96, ext, ext, R * 1.22);
        halo.addColorStop(0, "rgba(179,164,255,0.16)");
        halo.addColorStop(1, "rgba(179,164,255,0)");
        d.fillStyle = halo;
        d.fillRect(ext - R * 1.3, ext - R * 1.3, R * 2.6, R * 2.6);
        // dotted orbit ring
        d.strokeStyle = "rgba(179,164,255,0.3)";
        d.lineWidth = 2;
        d.setLineDash([2, 8]);
        d.beginPath();
        d.arc(ext, ext, R + 14, 0, Math.PI * 2);
        d.stroke();
      }
      if (deco && decoKey === key) ctx.drawImage(deco, cx - ext, cy - ext, size, size);
    };

    const layout = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 4 || h < 4) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w;
      H = h;
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      R0 = Math.max(40, Math.floor(Math.min(w, h) / 2 - live.current.margin));
      cx = Math.round(w / 2);
      cy0 = Math.round(h / 2);
      R = 0;
      decoKey = "";
      // resizing cleared the canvas: repaint now, inside the observer's
      // callback, so no blank frame reaches the screen
      fit();
      paint();
      wake();
    };

    // ── interaction state ──
    let hovered: string | null = null;
    let lastInteract = -1e9;
    const drag = {
      id: -1,
      x0: 0,
      y0: 0,
      lat0: 0,
      lon0: 0,
      moved: false,
      samples: [] as { t: number; x: number; y: number }[],
    };

    const focus = (cut: boolean) => {
      const p = live.current.places.find((q) => q.id === live.current.selectedId) ?? HOME;
      const f = focusFor(p);
      const tLat = Math.min(LAT_MAX, Math.max(LAT_MIN, f.lat * RAD));
      const tLon = cam.lon + wrapPi(f.lon * RAD - cam.lon);
      cam.coasting = false;
      if (cut || reduced) {
        cam.lat = tLat;
        cam.lon = tLon;
        cam.vLat = 0;
        cam.vLon = 0;
        cam.tLat = null;
        cam.tLon = null;
      } else {
        cam.tLat = tLat;
        cam.tLon = tLon;
      }
      wake();
    };

    // ── the loop: runs only while needed ──
    let raf = 0;
    let last = 0;
    let visible = true;
    let pageVisible = document.visibilityState === "visible";
    let t = 0; // ambient clock (s)
    let lastCam = "";
    let lastPaint = -1e9;
    /** something outside the loop changed: paint on the next frame */
    let dirty = true;

    const busy = () =>
      drag.id !== -1 ||
      cam.tLat !== null ||
      cam.coasting ||
      (!reduced && arcClock < ARC_DRAW + arcs.length * 0.07 + 0.2);
    const ambientOn = () => live.current.ambient && !reduced;

    function wake() {
      dirty = true;
      if (!raf && visible && pageVisible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    function step(dt: number) {
      if (drag.id !== -1) return;
      if (cam.tLat !== null && cam.tLon !== null) {
        // critically damped spring toward the target, velocity carried in
        const aLat = -OMEGA * OMEGA * (cam.lat - cam.tLat) - 2 * OMEGA * cam.vLat;
        const aLon = -OMEGA * OMEGA * (cam.lon - cam.tLon) - 2 * OMEGA * cam.vLon;
        cam.vLat += aLat * dt;
        cam.vLon += aLon * dt;
        cam.lat += cam.vLat * dt;
        cam.lon += cam.vLon * dt;
        if (
          Math.abs(cam.lat - cam.tLat) < 1e-4 &&
          Math.abs(cam.lon - cam.tLon) < 1e-4 &&
          Math.abs(cam.vLat) < 1e-3 &&
          Math.abs(cam.vLon) < 1e-3
        ) {
          cam.lat = cam.tLat;
          cam.lon = cam.tLon;
          cam.vLat = cam.vLon = 0;
          cam.tLat = cam.tLon = null;
        }
        return;
      }
      if (cam.coasting) {
        const k = Math.exp(-dt / TAU);
        cam.lon += cam.vLon * TAU * (1 - k);
        cam.vLon *= k;
        // latitude: momentum inside the limits, a spring back past them
        if (cam.lat < LAT_MIN || cam.lat > LAT_MAX) {
          const b = cam.lat < LAT_MIN ? LAT_MIN : LAT_MAX;
          const a = -OMEGA * OMEGA * 1.6 * (cam.lat - b) - 2 * OMEGA * 1.26 * cam.vLat;
          cam.vLat += a * dt;
          cam.lat += cam.vLat * dt;
        } else {
          cam.lat += cam.vLat * TAU * (1 - k);
          cam.vLat *= k;
        }
        const out = cam.lat < LAT_MIN - 1e-3 || cam.lat > LAT_MAX + 1e-3;
        if (Math.abs(cam.vLon) < 0.004 && Math.abs(cam.vLat) < 0.004 && !out) {
          cam.coasting = false;
          cam.lat = Math.min(LAT_MAX, Math.max(LAT_MIN, cam.lat));
        }
        return;
      }
      // idle drift over home's flight network
      const homeView = live.current.selectedId === HOME.id;
      if (ambientOn() && !coarse && homeView && t - lastInteract > 6) cam.lon -= 0.04 * dt;
    }

    function paint() {
      // re-assert the context state every frame: a lost-and-restored 2D
      // context (GPU reset, memory pressure) comes back with an identity
      // transform and smoothing on, which would paint a blurry half-size
      // planet into one corner
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      if (!R) return;
      const amb = ambientOn();
      const sel = live.current.selectedId;

      // atmosphere and orbit, then the planet
      paintDeco();
      paintPlanet(amb);

      // routes out of home
      const homeSel = sel === HOME.id;
      for (const a of arcs) {
        const focused = homeSel || a.to.id === sel;
        const local = arcClock - (homeSel ? a.delay : 0) - (homeSel ? 0.15 : 0.32);
        const prog = reduced ? 1 : Math.min(1, Math.max(0, local / ARC_DRAW));
        const eased = 1 - Math.pow(1 - prog, 3);
        const strength = focused ? (homeSel ? 0.78 : 1) : 0.16;
        if (!focused && prog <= 0) continue;
        const n = a.pts.length - 1;
        const upto = focused ? Math.floor(eased * n) : n;
        const stride = a.want ? 2 : 1;
        // an ink casing first, so the route reads over land, sea and lights
        ctx.fillStyle = "#05060a";
        for (let k = 0; k <= upto; k += stride) {
          const p = project(a.pts[k], a.lift[k]);
          if (!p.vis) continue;
          ctx.globalAlpha = strength * 0.55;
          ctx.fillRect(Math.round(p.x / 2) * 2 - 2, Math.round(p.y / 2) * 2 - 2, 4, 4);
        }
        for (let k = 0; k <= upto; k += stride) {
          const p = project(a.pts[k], a.lift[k]);
          if (!p.vis) continue;
          ctx.globalAlpha = strength * (0.6 + 0.4 * Math.max(0, p.z));
          ctx.fillStyle = a.cols[k];
          ctx.fillRect(Math.round(p.x / 2) * 2 - 1, Math.round(p.y / 2) * 2 - 1, 2, 2);
        }
        // the drawing head
        if (focused && prog > 0 && prog < 1) {
          const p = project(a.pts[upto], a.lift[upto]);
          if (p.vis) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = PAPER;
            ctx.fillRect(Math.round(p.x / 2) * 2 - 2, Math.round(p.y / 2) * 2 - 2, 4, 4);
          }
        }
        // flights: a bright pixel and its trail running home → away
        if (focused && prog >= 1 && amb) {
          const phase = ((t + a.delay * 9) % PULSE_PERIOD) / PULSE_PERIOD;
          const head = Math.floor(phase * 1.25 * n);
          for (let j = 0; j < 7; j++) {
            const k = head - j * 2;
            if (k < 0 || k > n) continue;
            const p = project(a.pts[k], a.lift[k]);
            if (!p.vis) continue;
            ctx.globalAlpha = (1 - j / 7) * strength;
            ctx.fillStyle = j === 0 ? PAPER : a.cols[k];
            const s = j === 0 ? 4 : 2;
            ctx.fillRect(Math.round(p.x / 2) * 2 - s / 2, Math.round(p.y / 2) * 2 - s / 2, s, s);
          }
        }
      }

      // markers
      const blink = amb ? 0.62 + 0.38 * Math.sin(t * 4) : 1;
      for (const place of live.current.places) {
        const p = project(toVecCached(place.lat, place.lon));
        if (p.z <= 0.1) continue;
        const qx = Math.round(p.x);
        const qy = Math.round(p.y);
        const isSel = place.id === sel;
        const isHover = place.id === hovered;
        ctx.globalAlpha = Math.min(1, 0.35 + p.z);
        if (place.status === "want") {
          ctx.strokeStyle = isSel ? PAPER : "#8BE9FF";
          ctx.lineWidth = 2;
          ctx.strokeRect(qx - 5, qy - 5, 10, 10);
        } else {
          ctx.fillStyle = place.home ? "#C6FF5E" : "#FFB86B";
          ctx.fillRect(qx - 4, qy - 4, 8, 8);
          ctx.fillStyle = "#0A0B12";
          ctx.fillRect(qx - 1, qy - 1, 2, 2);
        }
        if (isSel || isHover) {
          ctx.globalAlpha = isSel ? blink : 0.6;
          ctx.strokeStyle = PAPER;
          ctx.lineWidth = 2;
          const o = isSel ? 11 : 10;
          const l = 5;
          ctx.beginPath();
          ctx.moveTo(qx - o, qy - o + l);
          ctx.lineTo(qx - o, qy - o);
          ctx.lineTo(qx - o + l, qy - o);
          ctx.moveTo(qx + o - l, qy - o);
          ctx.lineTo(qx + o, qy - o);
          ctx.lineTo(qx + o, qy - o + l);
          ctx.moveTo(qx + o, qy + o - l);
          ctx.lineTo(qx + o, qy + o);
          ctx.lineTo(qx + o - l, qy + o);
          ctx.moveTo(qx - o + l, qy + o);
          ctx.lineTo(qx - o, qy + o);
          ctx.lineTo(qx - o, qy + o - l);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // readout
      const cb = live.current.onCamera;
      if (cb) {
        const lat = cam.lat / RAD;
        const lon = wrapPi(cam.lon) / RAD;
        const key = `${lat.toFixed(2)}|${lon.toFixed(2)}`;
        if (key !== lastCam) {
          lastCam = key;
          cb(lat, lon);
        }
      }
    }

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      t += dt;
      arcClock += dt;
      if (shownFor !== live.current.selectedId) buildArcs();
      step(dt);
      const active = busy();
      // ambient-only (lights, flights, drift): 30fps is plenty
      if (dirty || active || now - lastPaint > 30) {
        dirty = false;
        lastPaint = now;
        fit();
        paint();
      }
      if (visible && pageVisible && (active || ambientOn())) raf = requestAnimationFrame(frame);
    }

    // vectors for lat/lon pairs that never change (markers, graticule)
    const vecCache = new Map<string, Vec3>();
    function toVecCached(lat: number, lon: number) {
      const k = `${lat},${lon}`;
      let v = vecCache.get(k);
      if (!v) {
        v = toVec(lat, lon);
        vecCache.set(k, v);
      }
      return v;
    }

    const hitTest = (clientX: number, clientY: number, slop: number) => {
      const r = cvs.getBoundingClientRect();
      const mx = clientX - r.left;
      const my = clientY - r.top;
      let best: string | null = null;
      let bestD = slop;
      for (const place of live.current.places) {
        const p = project(toVecCached(place.lat, place.lon));
        if (p.z <= 0.1) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) {
          bestD = d;
          best = place.id;
        }
      }
      return best;
    };

    const setHover = (id: string | null) => {
      if (id === hovered) return;
      hovered = id;
      const name = id ? live.current.places.find((p) => p.id === id)?.name : null;
      const lang = document.documentElement.lang === "fr" ? "fr" : "en";
      wrap.dataset.cursor = name ? name[lang] : live.current.spinLabel;
      cvs.style.cursor = id ? "pointer" : "";
      // the glass cursor reads its label on pointerover
      cvs.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
      wake();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag.id !== -1) return;
      drag.id = e.pointerId;
      drag.x0 = e.clientX;
      drag.y0 = e.clientY;
      drag.lat0 = cam.lat;
      drag.lon0 = cam.lon;
      drag.moved = false;
      drag.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      // catch it mid-flight
      cam.tLat = cam.tLon = null;
      cam.coasting = false;
      cam.vLat = cam.vLon = 0;
      lastInteract = t;
      cvs.setPointerCapture(e.pointerId);
      wrap.dataset.grabbing = "";
      wake();
    };
    const onMove = (e: PointerEvent) => {
      if (drag.id !== e.pointerId) {
        if (e.pointerType === "mouse" && drag.id === -1) setHover(hitTest(e.clientX, e.clientY, 16));
        return;
      }
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        setHover(null);
      }
      // 1:1 at the centre of the disc: a pixel of travel is 1/R radians
      cam.lon = drag.lon0 - dx / R;
      cam.lat = Math.max(-LAT_HARD, Math.min(LAT_HARD, rubber(drag.lat0 + dy / R, LAT_MIN, LAT_MAX, 0.3)));
      drag.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      if (drag.samples.length > 12) drag.samples.shift();
      lastInteract = t;
      wake();
    };
    const release = (e: PointerEvent, tap: boolean) => {
      if (drag.id !== e.pointerId) return;
      drag.id = -1;
      delete wrap.dataset.grabbing;
      lastInteract = t;
      if (!drag.moved) {
        if (tap) {
          const id = hitTest(e.clientX, e.clientY, e.pointerType === "mouse" ? 16 : 26);
          if (id) live.current.onSelect(id);
        }
        if (cam.lat < LAT_MIN || cam.lat > LAT_MAX) cam.coasting = true;
        wake();
        return;
      }
      // velocity from the last ~80ms of the hand, handed to the momentum
      const s = drag.samples;
      const lastS = s[s.length - 1];
      let first = lastS;
      for (let i = s.length - 1; i >= 0; i--) {
        if (lastS.t - s[i].t > 80) break;
        first = s[i];
      }
      const dtS = Math.max(8, lastS.t - first.t) / 1000;
      const stale = e.timeStamp - lastS.t > 60;
      const vx = stale ? 0 : (lastS.x - first.x) / dtS;
      const vy = stale ? 0 : (lastS.y - first.y) / dtS;
      cam.vLon = reduced ? 0 : -vx / R;
      cam.vLat = reduced ? 0 : vy / R;
      cam.coasting = true;
      if (reduced) {
        cam.lat = Math.min(LAT_MAX, Math.max(LAT_MIN, cam.lat));
        cam.coasting = false;
      }
      wake();
    };
    const onUp = (e: PointerEvent) => release(e, true);
    const onCancel = (e: PointerEvent) => release(e, false);
    const onLeave = () => setHover(null);

    // keyboard: arrows nudge the globe on the same spring
    const onKey = (e: KeyboardEvent) => {
      const step = (e.shiftKey ? 45 : 15) * RAD;
      let dLat = 0;
      let dLon = 0;
      // map convention: the view pans toward the arrow
      if (e.key === "ArrowLeft") dLon = -step;
      else if (e.key === "ArrowRight") dLon = step;
      else if (e.key === "ArrowUp") dLat = step;
      else if (e.key === "ArrowDown") dLat = -step;
      else return;
      e.preventDefault();
      lastInteract = t;
      const fromLat = cam.tLat ?? cam.lat;
      const fromLon = cam.tLon ?? cam.lon;
      cam.coasting = false;
      cam.tLat = Math.min(LAT_MAX, Math.max(LAT_MIN, fromLat + dLat));
      cam.tLon = fromLon + dLon;
      if (reduced) {
        cam.lat = cam.tLat;
        cam.lon = cam.tLon;
        cam.tLat = cam.tLon = null;
      }
      wake();
    };

    cvs.addEventListener("pointerdown", onDown);
    cvs.addEventListener("pointermove", onMove);
    cvs.addEventListener("pointerup", onUp);
    cvs.addEventListener("pointercancel", onCancel);
    cvs.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("keydown", onKey);

    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    const io = new IntersectionObserver(
      ([en]) => {
        visible = en.isIntersecting;
        if (visible) wake();
      },
      { rootMargin: "64px" }
    );
    io.observe(wrap);
    const onVis = () => {
      pageVisible = document.visibilityState === "visible";
      if (pageVisible) wake();
    };
    document.addEventListener("visibilitychange", onVis);
    const onReduced = () => {
      reduced = mqReduced.matches;
      wake();
    };
    mqReduced.addEventListener("change", onReduced);
    // a restored context is blank: paint it again
    const onRestored = () => wake();
    cvs.addEventListener("contextrestored", onRestored);
    // a sheet moving over the globe: redraw at the new size
    const offLift = lift?.on("change", wake);
    const offRoom = liftRoom?.on("change", wake);

    buildArcs();
    layout();
    wrap.dataset.cursor = live.current.spinLabel;
    api.current = {
      focus,
      wake,
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mqReduced.removeEventListener("change", onReduced);
      cvs.removeEventListener("contextrestored", onRestored);
      offLift?.();
      offRoom?.();
      cvs.removeEventListener("pointerdown", onDown);
      cvs.removeEventListener("pointermove", onMove);
      cvs.removeEventListener("pointerup", onUp);
      cvs.removeEventListener("pointercancel", onCancel);
      cvs.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("keydown", onKey);
      api.current = null;
    };
  }, [lift, liftRoom]);

  // fly to the selection (and back to it on recenter)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    api.current?.focus(false);
  }, [selectedId, recenter]);

  return (
    <div
      ref={wrapRef}
      className={`app-atlas-globe ${className}`}
      role="application"
      aria-roledescription="globe"
      aria-label={label}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className="app-atlas-globe-canvas" aria-hidden />
    </div>
  );
}

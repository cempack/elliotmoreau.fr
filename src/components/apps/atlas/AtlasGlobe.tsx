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
 * - drag is an arcball: the point you grab stays under the finger wherever
 *   on the disc you grab it (latitude rubber-bands past its limits); a
 *   throw carries on with momentum and decays like a scroll view; grabbing
 *   mid-flight catches it;
 * - choosing a place flies the camera on a critically damped spring to
 *   the middle of the route from home, so the whole great-circle arc is on
 *   the near side, and zooms in until the route spans a good part of the
 *   disc (a hop between two near places pulls out a little on the way, as
 *   a flight would); the arc then draws itself out of France; home shows
 *   every route at once, a small flight network;
 * - the zoom is a loupe: the planet grows inside the resting disc, so the
 *   silhouette, its limb, halo and orbit stay where they are and a zoomed
 *   view costs no more than the whole globe;
 * - hovering a marker names it in a small callout beside it (the shell's
 *   cursor is reduced to its dot here, so nothing hides what you aim at);
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
const PAPER = "#EBE9E1";

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
/** a route is framed to span about this angle of the disc's radius */
const ZOOM_FRAME = 0.62;
const ZOOM_MAX = 3.2;
/** releases faster than this (rad/s) are capped: a grab at the very rim
    maps a few pixels to a large turn */
const SPIN_MAX = 8;

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
  /** a one-time hint by the pointer until the first drag ("Drag to spin") */
  hint: string;
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
  hint,
  onCamera,
  lift,
  liftRoom,
  className = "",
}: AtlasGlobeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  // live props for the imperative loop (synced after commit)
  const live = useRef({ places, selectedId, onSelect, ambient, margin, hint, onCamera });
  const api = useRef<{ focus: (cut: boolean) => void; wake: () => void } | null>(null);

  useEffect(() => {
    live.current = { places, selectedId, onSelect, ambient, margin, hint, onCamera };
    api.current?.wake();
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    const tip = tipRef.current;
    if (!wrap || !cvs || !tip) return;
    const tipEl: HTMLSpanElement = tip;
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
    const startPlace = live.current.places.find((p) => p.id === live.current.selectedId) ?? HOME;
    const start = focusFor(startPlace);
    cam.lat = Math.min(LAT_MAX, Math.max(LAT_MIN, start.lat * RAD));
    cam.lon = start.lon * RAD;

    /** how far in to frame a place's route: short hops fill the disc */
    const zoomFor = (p: Place) => {
      if (p.home || p.id === HOME.id) return 1;
      const ang = angleBetween(homeV, toVec(p.lat, p.lon));
      return Math.min(ZOOM_MAX, Math.max(1, ZOOM_FRAME / Math.max(1e-3, ang)));
    };
    // ── zoom: a critically damped spring like the camera's ──
    const zoom = { v: zoomFor(startPlace), vel: 0, t: zoomFor(startPlace) };
    /** the zoom actually drawn (the spring, less a pull-out while flying) */
    let zoomShown = zoom.v;

    let W = 0;
    let H = 0;
    /** the planet's radius (zoomed), and the disc it is seen through */
    let R = 0;
    let RL = 0;
    let cx = 0;
    let cy = 0;
    let dpr = 1;
    /** the resting circle (no sheet over it) */
    let R0 = 0;
    let cy0 = 0;

    // ── the planet raster: one entry per cell inside both the disc and
    //    the canvas (a zoomed planet overflows the canvas) ──
    let buf: HTMLCanvasElement | null = null;
    let bctx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let px: Uint32Array = new Uint32Array(0);
    let stride = 0; // allocated buffer width (cells)
    let rows = 0; // allocated buffer height (cells)
    let bw = 0; // cells in use, across and down
    let bh = 0;
    let gox = 0; // the grid's origin on the canvas (CSS px), and the
    let goy = 0; // first cell of it that is in use
    let gi0 = 0;
    let gj0 = 0;
    let geoKey = "";
    let geoVer = 0;
    let cN = 0; // cells in use inside the disc
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

    /** Index the cells of the disc that land on the canvas. Runs on every
        radius change (a sheet drag or a zoom changes it each frame), so the
        buffers only ever grow. */
    const buildRaster = (n0: number, i0: number, i1: number, j0: number, j1: number) => {
      rasterKey = "";
      geoVer++;
      bw = Math.max(0, i1 - i0);
      bh = Math.max(0, j1 - j0);
      gi0 = i0;
      gj0 = j0;
      buf ??= document.createElement("canvas");
      if (bw > stride || bh > rows || !img || !bctx) {
        stride = Math.max(stride, bw + 8);
        rows = Math.max(rows, bh + 8);
        buf.width = stride;
        buf.height = rows;
        bctx = buf.getContext("2d");
        if (!bctx) return;
        img = bctx.createImageData(stride, rows);
        px = new Uint32Array(img.data.buffer);
      } else px.fill(0);
      if (bw * bh > cap) {
        cap = bw * bh;
        cIdx = new Int32Array(cap);
        cE = new Float32Array(cap);
        cY = new Float32Array(cap);
        cZ = new Float32Array(cap);
        cTh = new Float32Array(cap);
        cRim = new Uint8Array(cap);
      }
      const half = (n0 * CELL) / 2;
      const k = RL / R;
      let n = 0;
      for (let j = j0; j < j1; j++) {
        const yl = (half - (j + 0.5) * CELL) / RL;
        for (let i = i0; i < i1; i++) {
          const el = ((i + 0.5) * CELL - half) / RL;
          const rl = el * el + yl * yl;
          if (rl > 1) continue;
          const zl = Math.sqrt(Math.max(0, 1 - rl));
          // the planet under this cell of the loupe
          const e = el * k;
          const y = yl * k;
          const th = (BAYER[((j & 3) << 2) | (i & 3)] + 0.5) / 16;
          cIdx[n] = (j - j0) * stride + (i - i0);
          cE[n] = e;
          cY[n] = y;
          cZ[n] = Math.sqrt(Math.max(0, 1 - e * e - y * y));
          cTh[n] = th;
          // the limb darkens: solid at the very edge, dithered just inside
          cRim[n] = zl < 0.16 || (zl < 0.3 && th > (zl - 0.16) / 0.14) ? 1 : 0;
          n++;
        }
      }
      cN = n;
    };

    /** angular distance the camera still has to fly (0 when it is not) */
    const flightLeft = () => {
      if (cam.tLat === null || cam.tLon === null) return 0;
      const c =
        Math.sin(cam.lat) * Math.sin(cam.tLat) + Math.cos(cam.lat) * Math.cos(cam.tLat) * Math.cos(cam.tLon - cam.lon);
      return Math.acos(Math.min(1, Math.max(-1, c)));
    };

    /** The circle for the current lift and zoom: from resting to the room
        above the sheet, in whole pixels; a new radius (or a new part of a
        zoomed planet on the canvas) re-indexes the raster. */
    const fit = () => {
      let r = R0;
      let c = cy0;
      const l = lift ? Math.min(1, Math.max(0, lift.get())) : 0;
      const room = liftRoom ? liftRoom.get() : 0;
      if (l > 0 && room > 0 && room < H - 1) {
        const r1 = Math.min(R0, Math.max(40, Math.floor(Math.min(W, room) / 2 - live.current.margin)));
        r = R0 + (r1 - R0) * l;
        c = Math.round(cy0 + (room / 2 - cy0) * l);
      }
      // a long flight pulls the camera out on the way and dives in as it
      // arrives; never below the whole globe
      zoomShown = Math.max(1, zoom.v / (1 + 1.6 * flightLeft()));
      const rl = Math.round(r);
      r = Math.round(rl * zoomShown);
      cy = c;
      const n0 = Math.ceil((2 * rl) / CELL) + 2;
      const size = n0 * CELL;
      const ox = Math.round(cx - size / 2);
      const oy = Math.round(c - size / 2);
      const i0 = Math.max(0, Math.floor(-ox / CELL));
      const i1 = Math.min(n0, Math.ceil((W - ox) / CELL));
      const j0 = Math.max(0, Math.floor(-oy / CELL));
      const j1 = Math.min(n0, Math.ceil((H - oy) / CELL));
      gox = ox;
      goy = oy;
      const key = `${r}|${rl}|${i0}|${i1}|${j0}|${j1}`;
      if (key !== geoKey) {
        geoKey = key;
        R = r;
        RL = rl;
        buildRaster(n0, i0, i1, j0, j1);
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
      const key = `${cam.lat}|${cam.lon}|${amb ? flick : -1}|${sunAt}|${geoVer}`;
      if (!bw || !bh) return;
      const b = buf;
      const blit = () => ctx.drawImage(b, 0, 0, bw, bh, gox + gi0 * CELL, goy + gj0 * CELL, bw * CELL, bh * CELL);
      if (key === rasterKey) {
        blit();
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
      bctx.putImageData(img, 0, 0, 0, 0, bw, bh);
      blit();
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

    /** a point drawn at the zoomed scale still inside the disc it is
        seen through */
    const inLoupe = (x: number, y: number) => R === RL || (x - cx) ** 2 + (y - cy) ** 2 < (RL - 3) ** 2;

    // ── halo + dotted orbit: drawn once per size, then blitted ──
    let deco: HTMLCanvasElement | null = null;
    let decoKey = "";
    const paintDeco = () => {
      const R = RL; // the halo and orbit belong to the disc, not the zoom
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
      geoKey = "";
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
      /** where the pointer is now, canvas px (the zoom may change under a
          finger that holds still: the grab is re-solved every frame) */
      mx: 0,
      my: 0,
      /** the grabbed point on the planet, radians */
      gLat: 0,
      gLon: 0,
      back: false,
      moved: false,
      /** the camera after each move, for the release velocity */
      samples: [] as { t: number; lat: number; lon: number }[],
    };

    const zoomTo = (z: number, cut = false) => {
      zoom.t = z;
      if (cut || reduced) {
        zoom.v = z;
        zoom.vel = 0;
      }
    };

    const focus = (cut: boolean) => {
      const p = live.current.places.find((q) => q.id === live.current.selectedId) ?? HOME;
      const f = focusFor(p);
      const tLat = Math.min(LAT_MAX, Math.max(LAT_MIN, f.lat * RAD));
      const tLon = cam.lon + wrapPi(f.lon * RAD - cam.lon);
      cam.coasting = false;
      zoomTo(zoomFor(p), cut);
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

    const zooming = () => zoom.v !== zoom.t || zoom.vel !== 0;
    const busy = () =>
      drag.id !== -1 ||
      cam.tLat !== null ||
      cam.coasting ||
      zooming() ||
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
      if (zooming()) {
        const a = -OMEGA * OMEGA * (zoom.v - zoom.t) - 2 * OMEGA * zoom.vel;
        zoom.vel += a * dt;
        zoom.v += zoom.vel * dt;
        if (Math.abs(zoom.v - zoom.t) < 1e-4 && Math.abs(zoom.vel) < 1e-3) {
          zoom.v = zoom.t;
          zoom.vel = 0;
        }
      }
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

      // zoomed, routes and markers keep inside the loupe
      const zoomedIn = zoomShown > 1.001;
      if (zoomedIn) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, RL + 1, 0, Math.PI * 2);
        ctx.clip();
      }

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
        ctx.fillStyle = "#0a0c0b";
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

      // markers: while zoomed in on a route, the places off it step back
      const blink = amb ? 0.62 + 0.38 * Math.sin(t * 4) : 1;
      const close = zoomShown > 1.25;
      for (const place of live.current.places) {
        const p = project(toVecCached(place.lat, place.lon));
        if (p.z <= 0.1 || !inLoupe(p.x, p.y)) continue;
        const qx = Math.round(p.x);
        const qy = Math.round(p.y);
        const isSel = place.id === sel;
        const isHover = place.id === hovered;
        const minor = close && !isSel && !isHover && !place.home;
        ctx.globalAlpha = Math.min(1, 0.35 + p.z) * (minor ? 0.75 : 1);
        if (place.status === "want") {
          ctx.strokeStyle = isSel ? PAPER : "#89B4A8";
          ctx.lineWidth = 2;
          if (minor) ctx.strokeRect(qx - 3, qy - 3, 6, 6);
          else ctx.strokeRect(qx - 5, qy - 5, 10, 10);
        } else if (minor) {
          ctx.fillStyle = "#E0BD6E";
          ctx.fillRect(qx - 3, qy - 3, 6, 6);
        } else {
          ctx.fillStyle = place.home ? "#B0CC86" : "#E0BD6E";
          ctx.fillRect(qx - 4, qy - 4, 8, 8);
          ctx.fillStyle = "#101311";
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
      if (zoomedIn) ctx.restore();
      updateTip();

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
        // a zoom easing out under a finger that holds still: keep the
        // grabbed point under it
        if (drag.id !== -1 && drag.moved) applyDrag();
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
        if (p.z <= 0.1 || !inLoupe(p.x, p.y)) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) {
          bestD = d;
          best = place.id;
        }
      }
      return best;
    };

    // ── the callout: a place's name beside its marker, or (until the
    //    first drag) how to use the globe, by the pointer ──
    const ptr = { x: 0, y: 0, in: false };
    let hinted = false;
    try {
      hinted = sessionStorage.getItem("em-atlas-spun") === "1";
    } catch {}
    let tipText = "";
    let tipW = 0;
    let tipH = 0;
    let tipPos = "";
    let tipOn = false;
    function showTip(text: string | null, x: number, y: number) {
      if (!text) {
        if (tipOn) {
          tipOn = false;
          delete tipEl.dataset.show;
        }
        return;
      }
      const el = tipEl;
      if (text !== tipText) {
        tipText = text;
        el.textContent = text;
        tipW = el.offsetWidth;
        tipH = el.offsetHeight;
      }
      // up and to the right of what it names, kept inside the canvas
      let tx = x + 12;
      let ty = y - 12 - tipH;
      if (tx + tipW > W - 4) tx = x - 12 - tipW;
      if (ty < 4) ty = y + 12;
      const pos = `${Math.round(tx)},${Math.round(ty)}`;
      if (pos !== tipPos) {
        tipPos = pos;
        el.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
      }
      if (!tipOn) {
        tipOn = true;
        el.dataset.show = "";
      }
    }
    function updateTip() {
      if (drag.id !== -1 && drag.moved) return showTip(null, 0, 0);
      if (hovered) {
        const place = live.current.places.find((p) => p.id === hovered);
        const p = place && project(toVecCached(place.lat, place.lon));
        if (!place || !p || p.z <= 0.1 || !inLoupe(p.x, p.y)) return showTip(null, 0, 0);
        const lang = document.documentElement.lang === "fr" ? "fr" : "en";
        return showTip(place.name[lang], Math.round(p.x), Math.round(p.y));
      }
      if (ptr.in && !hinted && drag.id === -1) return showTip(live.current.hint, ptr.x, ptr.y);
      showTip(null, 0, 0);
    }

    const setHover = (id: string | null) => {
      if (id === hovered) return;
      hovered = id;
      cvs.style.cursor = id ? "pointer" : "";
      wake();
    };

    // ── arcball: screen ↔ planet ──
    /** the view-space unit vector under a canvas pixel (east, up, toward
        the viewer), clamped to the rim outside the disc */
    const viewAt = (mx: number, my: number): Vec3 => {
      const e = (mx - cx) / R;
      const y = (cy - my) / R;
      const rr = e * e + y * y;
      if (rr >= 1) {
        const k = 1 / Math.sqrt(rr);
        return [e * k, y * k, 0];
      }
      return [e, y, Math.sqrt(1 - rr)];
    };
    /** the planet point (radians) under a view vector, for the camera now */
    const planetAt = ([e, y2, z2]: Vec3) => {
      const ct = Math.cos(cam.lat);
      const st = Math.sin(cam.lat);
      const n = y2 * ct + z2 * st;
      const x = -y2 * st + z2 * ct;
      const cl = Math.cos(cam.lon);
      const sl = Math.sin(cam.lon);
      return { lat: Math.asin(Math.min(1, Math.max(-1, n))), lon: Math.atan2(x * sl + e * cl, x * cl - e * sl) };
    };
    /** Turn the camera so the grabbed point lands under the pointer: its
        east offset fixes the longitude, the remaining angle the latitude
        (which rubber-bands past its limits). A point can only ever appear
        as far east as its own parallel reaches (a globe on a turntable
        never rolls), so past ~76° of that the longitude carries on
        linearly instead of stalling, with the latitude held. `back`: the
        point was grabbed beyond the pole, on the far branch. */
    function applyDrag() {
      const c = viewAt(drag.mx, drag.my);
      const cg = Math.cos(drag.gLat);
      if (cg < 1e-3) return;
      const S = 0.97;
      const sr = c[0] / cg;
      const sg = sr < 0 ? -1 : 1;
      const as = Math.abs(sr);
      const core = Math.asin(Math.min(as, S));
      const ext = as <= S ? Math.asin(as) : core + (as - S);
      const d = drag.back ? sg * Math.PI - sg * ext : sg * ext;
      const dl = drag.back ? sg * Math.PI - sg * core : sg * core;
      cam.lon += wrapPi(drag.gLon - d - cam.lon);
      const lat = wrapPi(Math.atan2(c[2], c[1]) - Math.atan2(cg * Math.cos(dl), Math.sin(drag.gLat)));
      cam.lat = Math.max(-LAT_HARD, Math.min(LAT_HARD, rubber(lat, LAT_MIN, LAT_MAX, 0.3)));
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || drag.id !== -1) return;
      // catch it mid-flight, then take hold of the point under the finger
      cam.tLat = cam.tLon = null;
      cam.coasting = false;
      cam.vLat = cam.vLon = 0;
      const r = cvs.getBoundingClientRect();
      drag.id = e.pointerId;
      drag.x0 = e.clientX;
      drag.y0 = e.clientY;
      drag.mx = e.clientX - r.left;
      drag.my = e.clientY - r.top;
      const g = planetAt(viewAt(drag.mx, drag.my));
      drag.gLat = g.lat;
      drag.gLon = g.lon;
      drag.back = Math.cos(g.lon - cam.lon) < 0;
      drag.moved = false;
      drag.samples = [{ t: e.timeStamp, lat: cam.lat, lon: cam.lon }];
      lastInteract = t;
      cvs.setPointerCapture(e.pointerId);
      wrap.dataset.grabbing = "";
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const r = cvs.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      if (drag.id !== e.pointerId) {
        if (e.pointerType === "mouse" && drag.id === -1) {
          ptr.x = Math.round(mx);
          ptr.y = Math.round(my);
          ptr.in = true;
          setHover(hitTest(e.clientX, e.clientY, 16));
          updateTip();
        }
        return;
      }
      drag.mx = mx;
      drag.my = my;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) <= 4) return;
        drag.moved = true;
        setHover(null);
        // taking hold of the globe: the framing of a route gives way to it
        zoomTo(1);
        if (!hinted) {
          hinted = true;
          try {
            sessionStorage.setItem("em-atlas-spun", "1");
          } catch {}
        }
        updateTip();
      }
      applyDrag();
      drag.samples.push({ t: e.timeStamp, lat: cam.lat, lon: cam.lon });
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
      // the surface's own angular velocity over the last ~80ms of the hand
      // (true to the finger wherever it held the planet), handed on
      const s = drag.samples;
      const lastS = s[s.length - 1];
      let first = lastS;
      for (let i = s.length - 1; i >= 0; i--) {
        if (lastS.t - s[i].t > 80) break;
        first = s[i];
      }
      const dtS = Math.max(8, lastS.t - first.t) / 1000;
      const stale = e.timeStamp - lastS.t > 60;
      const cap = (v: number) => Math.max(-SPIN_MAX, Math.min(SPIN_MAX, v));
      cam.vLon = reduced || stale ? 0 : cap((lastS.lon - first.lon) / dtS);
      cam.vLat = reduced || stale ? 0 : cap((lastS.lat - first.lat) / dtS);
      cam.coasting = true;
      if (reduced) {
        cam.lat = Math.min(LAT_MAX, Math.max(LAT_MIN, cam.lat));
        cam.coasting = false;
      }
      wake();
    };
    const onUp = (e: PointerEvent) => release(e, true);
    const onCancel = (e: PointerEvent) => release(e, false);
    const onLeave = () => {
      ptr.in = false;
      setHover(null);
      updateTip();
    };

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
      zoomTo(1);
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
      // the shell's cursor keeps to its dot here: a label pill would hide
      // the very markers you aim at (the callout names them instead)
      data-cursor-hide=""
    >
      <canvas ref={canvasRef} className="app-atlas-globe-canvas" aria-hidden />
      <span ref={tipRef} className="app-atlas-globe-tip" aria-hidden />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { Place } from "@/lib/places";
import { HOME } from "@/lib/places";
import { angleBetween, focusFor, isLand, slerp, toVec, type Vec3 } from "./geo";

/**
 * The Atlas globe: a dithered pixel planet you can throw.
 *
 * Adapted from components/PixelGlobe (same land dots and inks), rebuilt for
 * the Atlas window:
 * - drag spins it 1:1 from the grab point on both axes (latitude rubber-
 *   bands past its limits); a throw carries on with momentum and decays
 *   like a scroll view; grabbing mid-flight catches it;
 * - choosing a place flies the camera on a critically damped spring to
 *   the middle of the route from home, so the whole great-circle arc is on
 *   the near side, and the arc draws itself out of France;
 * - home shows every route at once, a small flight network;
 * - sized by a ResizeObserver, DPR capped at 2, painted on demand: the loop
 *   only runs while something moves, or while `ambient` (twinkle, flights,
 *   idle drift) and on screen and the tab is visible;
 * - reduced motion: no ambient motion, no momentum, the camera cuts.
 */

const INKS = ["#33376A", "#4A5096", "#8BE9FF", "#B3A4FF"];
const LIME: RGB = [198, 255, 94];
const EMBER: RGB = [255, 184, 107];
const ION: RGB = [139, 233, 255];
const PAPER = "#F5F2EC";

type RGB = [number, number, number];
type Dot = { v: Vec3; ink: number; big: boolean; seed: number };
type Arc = { to: Place; pts: Vec3[]; lift: number[]; cols: string[]; want: boolean; delay: number };

const RAD = Math.PI / 180;
const LAT_MIN = -55 * RAD;
const LAT_MAX = 68 * RAD;
/** camera spring: critically damped, ω in rad/s (~0.85s to settle) */
const OMEGA = 5.6;
/** momentum decay time constant (s), close to a scroll view's feel */
const TAU = 0.42;
const ARC_DRAW = 1.05;
const PULSE_PERIOD = 3.4;

function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

let dotCache: Dot[] | null = null;
function landDots(): Dot[] {
  if (dotCache) return dotCache;
  const N = 5200;
  const out: Dot[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const z = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const th = golden * i;
    const lat = Math.asin(z) / RAD;
    const lon = Math.atan2(Math.sin(th) * r, Math.cos(th) * r) / RAD;
    if (!isLand(lat, lon)) continue;
    const h = hash(i);
    out.push({
      v: toVec(lat, lon),
      ink: Math.min(INKS.length - 1, Math.floor(h * h * INKS.length + 0.6)),
      big: h > 0.9,
      seed: i % 37,
    });
  }
  // grouped by ink: one fillStyle change per group
  out.sort((a, b) => a.ink - b.ink);
  dotCache = out;
  return out;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The ocean: a Bayer-dithered, top-left-lit sphere in 2px cells, drawn
    once per size (lighting is view-locked, so it never needs redrawing). */
function oceanSprite(R: number) {
  const cell = 2;
  const n = Math.ceil((R * 2) / cell);
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d");
  if (!g) return c;
  const img = g.createImageData(n, n);
  const d = img.data;
  const deep: RGB = [9, 11, 30];
  const mid: RGB = [17, 21, 54];
  const lit: RGB = [30, 34, 82];
  const lx = -0.45;
  const ly = -0.55;
  const lz = 0.7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const nx = ((x + 0.5) / n) * 2 - 1;
      const ny = ((y + 0.5) / n) * 2 - 1;
      const rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr);
      const lam = Math.max(0, nx * lx + ny * ly + nz * lz);
      const th = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
      const level = lam * 2.1;
      const base = level > 1 ? (level - 1 > th ? lit : mid) : level > th ? mid : deep;
      const i = (y * n + x) * 4;
      // the limb darkens into the night
      const rim = rr > 0.93 ? 0.72 : 1;
      d[i] = base[0] * rim;
      d[i + 1] = base[1] * rim;
      d[i + 2] = base[2] * rim;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
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
    const dots = landDots();
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
    let ocean: HTMLCanvasElement | null = null;

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

    const layout = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 4 || h < 4) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = w;
      H = h;
      cvs.width = Math.round(w * dpr);
      cvs.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      R = Math.max(40, Math.floor(Math.min(w, h) / 2 - live.current.margin));
      cx = Math.round(w / 2);
      cy = Math.round(h / 2);
      ocean = oceanSprite(R);
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

    const busy = () =>
      drag.id !== -1 ||
      cam.tLat !== null ||
      cam.coasting ||
      (!reduced && arcClock < ARC_DRAW + arcs.length * 0.07 + 0.2);
    const ambientOn = () => live.current.ambient && !reduced;

    function wake() {
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
      if (ambientOn() && homeView && t - lastInteract > 6) cam.lon -= 0.04 * dt;
    }

    function paint() {
      ctx.clearRect(0, 0, W, H);
      if (!R) return;
      const amb = ambientOn();
      const sel = live.current.selectedId;

      // atmosphere
      const halo = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.22);
      halo.addColorStop(0, "rgba(179,164,255,0.16)");
      halo.addColorStop(1, "rgba(179,164,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);

      // ocean
      if (ocean) ctx.drawImage(ocean, cx - R, cy - R, R * 2, R * 2);

      // dotted orbit ring
      ctx.strokeStyle = "rgba(179,164,255,0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // graticule: equator and every 30° of longitude, sparse pixels
      ctx.fillStyle = "#3a3f75";
      for (let lon = -180; lon < 180; lon += 3) {
        const p = project(toVecCached(0, lon));
        if (p.z > 0.05) {
          ctx.globalAlpha = 0.25 + p.z * 0.45;
          ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, 2, 2);
        }
      }
      for (let m = -150; m <= 180; m += 30) {
        for (let lat = -80; lat <= 80; lat += 4) {
          const p = project(toVecCached(lat, m));
          if (p.z > 0.05) {
            ctx.globalAlpha = 0.18 + p.z * 0.3;
            ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, 2, 2);
          }
        }
      }

      // land
      let ink = -1;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const p = project(d.v);
        if (p.z <= 0.02) continue;
        if (d.ink !== ink) {
          ink = d.ink;
          ctx.fillStyle = INKS[ink];
        }
        const tw = amb ? 0.62 + 0.38 * Math.sin(t * 1.4 + d.seed) : 0.86;
        ctx.globalAlpha = Math.min(1, (0.22 + p.z * 0.78) * tw + 0.14);
        const s = d.big ? 4 : 3;
        ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, s, s);
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
        for (let k = 0; k <= upto; k += stride) {
          const p = project(a.pts[k], a.lift[k]);
          if (!p.vis) continue;
          ctx.globalAlpha = strength * (0.55 + 0.45 * Math.max(0, p.z));
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
      paint();
      if (visible && pageVisible && (busy() || ambientOn())) raf = requestAnimationFrame(frame);
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
      cam.lat = rubber(drag.lat0 + dy / R, LAT_MIN, LAT_MAX, 0.9);
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
      cvs.removeEventListener("pointerdown", onDown);
      cvs.removeEventListener("pointermove", onMove);
      cvs.removeEventListener("pointerup", onUp);
      cvs.removeEventListener("pointercancel", onCancel);
      cvs.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("keydown", onKey);
      api.current = null;
    };
  }, []);

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

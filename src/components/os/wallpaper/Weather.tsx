"use client";

import { useEffect, useRef } from "react";
import type { Weather } from "@/lib/weather";
import type { SkyPhase } from "../sky";
import { windSide, type WeatherKind } from "../weather";
import { MAT, type City } from "./materials";

/**
 * Autan in the wallpaper: Toulouse's real weather over the pixel city.
 * One canvas at art resolution on top of the scene, redrawn 12 times a
 * second (pixel-art cadence, whole art pixels only):
 *  - cloudy: two bands of dithered cumulus drifting with the wind, behind
 *    the skyline (masked to the sky) and as fast as the wind is;
 *  - rain: an overcast lid, slanted streaks, and rings where drops land on
 *    the Garonne;
 *  - fog: a dithered bank lying on the horizon, the far bank gone soft;
 *  - autan: thin streaks racing across, light glinting on a choppy river,
 *    and leaves blown off the quays.
 * The view faces south, so an east wind (and the autan) blows left to
 * right. Paused when the tab is hidden; one still frame for reduced
 * motion. Clear skies draw nothing.
 */

const FPS = 12;

type Pal = { hi: string; body: string; shade: string; fog: string; rain: string; glint: string };
const PAL: Record<SkyPhase, Pal> = {
  day: { hi: "#f1f3ec", body: "#d3dbd6", shade: "#a2b1af", fog: "#c4ccc8", rain: "#d6e2e4", glint: "#fbf1d6" },
  dawn: { hi: "#f4d9c8", body: "#cdb0a9", shade: "#8a7479", fog: "#cdbab2", rain: "#e2d2cc", glint: "#ffe2c4" },
  dusk: { hi: "#f2b994", body: "#b38a8e", shade: "#62505f", fog: "#a48e90", rain: "#d6beb8", glint: "#ffcf9e" },
  night: { hi: "#3e494d", body: "#283236", shade: "#1a2226", fog: "#2e373a", rain: "#96aab2", glint: "#b9cbc6" },
};
const LEAVES = ["#c98a3c", "#b5a04a", "#8f5a2e", "#a66b34"];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "#rrggbb" → the canvas's little-endian ABGR word */
function abgr(hex: string, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  return ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}
function mix(a: string, b: string, t: number) {
  const p = parseInt(a.slice(1), 16);
  const q = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((p >> s) & 255) * (1 - t) + ((q >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** a band of clouds W wide that tiles seamlessly: flat bellies, a lit rim
    on top, a dithered shade underneath */
function cloudBand(W: number, h: number, o: { n: number; size: number; seed: number; streak?: boolean; pal: [string, string, string] }) {
  const r = rng(o.seed);
  const owner = new Int16Array(W * h).fill(-1);
  const base = new Float32Array(o.n);
  for (let i = 0; i < o.n; i++) {
    const cx = r() * W;
    const len = o.size * W * (0.6 + r() * 0.8);
    const b = h * (o.streak ? 0.3 + r() * 0.6 : 0.5 + r() * 0.42);
    base[i] = b;
    const puffs = o.streak ? 7 : 3 + Math.floor(r() * 4);
    const sx = o.streak ? 5 : 1.35;
    for (let k = 0; k < puffs; k++) {
      const t = k / (puffs - 1);
      const px = cx + (t - 0.5) * len;
      const pr = o.streak ? Math.max(1, len * (0.025 + r() * 0.02)) : Math.max(1.5, len * (0.14 + r() * 0.18) * Math.sin(Math.PI * (0.15 + 0.7 * t)));
      const py = b - pr * (o.streak ? 0.2 : 0.45);
      for (let y = Math.max(0, Math.floor(py - pr)); y <= Math.min(h - 1, Math.floor(b)); y++) {
        const dy = (y + 0.5 - py) / pr;
        if (Math.abs(dy) >= 1) continue;
        const half = Math.sqrt(1 - dy * dy) * pr * sx;
        for (let x = Math.ceil(px - half); x <= Math.floor(px + half); x++) owner[y * W + (((x % W) + W) % W)] = i;
      }
    }
  }
  const img = new ImageData(W, h);
  const out = new Uint32Array(img.data.buffer);
  const [hi, body, shade] = o.pal.map((c) => abgr(c));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const i = owner[p];
      if (i < 0) continue;
      const above = y > 0 ? owner[p - W] : -1;
      const above2 = y > 1 ? owner[p - 2 * W] : -1;
      const belly = base[i] - y;
      let c = body;
      if (above < 0) c = hi;
      else if (belly < 1.5 || (belly < 3.5 && bayer(x, y) < 0.5)) c = shade;
      else if (above2 < 0 && bayer(x, y) < 0.5) c = hi;
      out[p] = c;
    }
  }
  const c = canvas(W, h);
  c.getContext("2d")?.putImageData(img, 0, 0);
  return c;
}

/** a bank of fog W wide, tiling: thickest on its middle row, ragged along
    x; five levels of veil, ordered-dithered between them (finer than on/off) */
function fogBand(W: number, h: number, color: string, seed: number) {
  const r = rng(seed);
  const ph = [r(), r(), r()].map((v) => v * Math.PI * 2);
  const img = new ImageData(W, h);
  const out = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) {
    const g = Math.exp(-(((y - h * 0.55) / (h * 0.3)) ** 2));
    for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2;
      const n = 0.55 + 0.22 * Math.sin(u * 3 + ph[0] + y * 0.05) + 0.14 * Math.sin(u * 7 + ph[1]) + 0.09 * Math.sin(u * 13 + ph[2] - y * 0.11);
      const v = Math.min(1, g * n) * 4;
      const lvl = Math.floor(v) + (bayer(x, y) < v - Math.floor(v) ? 1 : 0);
      if (lvl) out[y * W + x] = abgr(color, lvl * 48);
    }
  }
  const c = canvas(W, h);
  c.getContext("2d")?.putImageData(img, 0, 0);
  return c;
}

/** the sky (and the far mountains): where clouds may show */
function skyMask(city: City) {
  const { W, H, idx } = city;
  const img = new ImageData(W, H);
  const out = new Uint32Array(img.data.buffer);
  for (let p = 0; p < W * H; p++) {
    const c = idx[p];
    const mat = (c >> 4) & 63;
    // stars carry their brightness in the flag bits; anything else flagged is the river
    if (mat === MAT.STAR || (c >> 10 === 0 && (mat === MAT.SKY || mat === MAT.CLOUD || mat === MAT.RANGE || mat === MAT.SNOW))) out[p] = 0xff000000;
  }
  const c = canvas(W, H);
  c.getContext("2d")?.putImageData(img, 0, 0);
  return c;
}

type Band = { img: HTMLCanvasElement; y: number; speed: number; alpha: number };
type Drop = { x: number; y: number; end: number; v: number; len: number; near: boolean };
type Ring = { x: number; y: number; age: number };
type Glint = { x: number; y: number; len: number; life: number };
type Leaf = { x: number; y: number; v: number; ph: number; c: string };

const RING: [number, number][][] = [
  [[0, 0]],
  [
    [-1, 0],
    [1, 0],
  ],
  [
    [-2, 0],
    [2, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 1],
    [0, 1],
    [1, 1],
  ],
  [
    [-3, 0],
    [3, 0],
    [-2, -1],
    [2, -1],
    [-2, 1],
    [2, 1],
  ],
];

export function WeatherLayer({ city, cell, phase, kind, weather }: { city: City; cell: number; phase: SkyPhase; kind: WeatherKind; weather: Weather | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || kind === "clear") return;
    const { W, H, hz, top, yw } = city;
    cv.width = W;
    cv.height = H;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pal = PAL[phase];
    const night = phase === "night";
    const side = windSide(weather);
    const wind = weather?.wind ?? 10;
    const cover = (weather?.cloud ?? 60) / 100;
    const scale = W / 480;
    // a cloud crosses the whole width in this many seconds
    const cross = Math.min(420, Math.max(30, 2600 / (wind + 6)));
    const pxs = W / cross;
    const sky = hz - top;
    const r = rng(0x5eed + W);

    const bands: Band[] = [];
    let lid: string | null = null;
    if (kind === "cloudy" || kind === "rain") {
      const wet = kind === "rain";
      const far: [string, string, string] = wet ? [pal.body, pal.shade, mix(pal.shade, "#000000", 0.25)] : [mix(pal.hi, pal.fog, 0.4), mix(pal.body, pal.fog, 0.5), mix(pal.shade, pal.fog, 0.4)];
      const near: [string, string, string] = wet ? [mix(pal.body, pal.shade, 0.5), mix(pal.shade, "#000000", 0.2), mix(pal.shade, "#000000", 0.42)] : [pal.hi, pal.body, pal.shade];
      const fh = Math.round(sky * 0.42);
      const nh = Math.round(sky * 0.55);
      bands.push({ img: cloudBand(W, fh, { n: Math.round((3 + cover * 6 + (wet ? 4 : 0)) * scale), size: 0.1, seed: 11, pal: far }), y: Math.round(top + sky * 0.42), speed: pxs * 0.55, alpha: 0.9 });
      bands.push({ img: cloudBand(W, nh, { n: Math.round((2 + cover * 4 + (wet ? 3 : 0)) * scale), size: 0.19, seed: 29, pal: near }), y: Math.round(top - nh * 0.25), speed: pxs, alpha: night ? 0.92 : 0.97 });
      if (wet) lid = mix(pal.shade, "#000000", night ? 0.1 : 0.05);
    } else if (kind === "fog") {
      const fh = Math.round(sky * 0.3);
      bands.push({ img: cloudBand(W, fh, { n: Math.round(3 * scale), size: 0.14, seed: 47, pal: [pal.fog, mix(pal.fog, pal.shade, 0.3), mix(pal.fog, pal.shade, 0.55)] }), y: Math.round(top + sky * 0.2), speed: pxs * 0.5, alpha: 0.6 });
    } else if (kind === "autan") {
      const sh = Math.round(sky * 0.6);
      bands.push({ img: cloudBand(W, sh, { n: Math.round(6 * scale), size: 0.3, seed: 83, streak: true, pal: [pal.hi, mix(pal.hi, pal.body, 0.5), pal.body] }), y: Math.round(top), speed: pxs * 1.6, alpha: night ? 0.55 : 0.75 });
    }
    const mask = bands.length ? skyMask(city) : null;

    const fog = kind === "fog" ? fogBand(W, Math.round(H * 0.34), pal.fog, 5) : null;
    const fogY = Math.round(hz - H * 0.34 * 0.55);

    // the river: columns with water, and where it starts in each
    const wet: number[] = [];
    for (let x = 0; x < W; x++) if (yw[x] < H - 2) wet.push(x);
    const onWater = (x: number, y: number) => x >= 0 && x < W && y >= yw[x] && y < H;
    const waterSpot = () => {
      const x = wet[Math.floor(r() * wet.length)];
      const span = H - yw[x] - 1;
      // more of them near the eye: the river comes toward the viewer
      return { x, y: yw[x] + 1 + Math.floor(Math.sqrt(r()) * span) };
    };

    const slant = side * Math.min(1.1, wind / 26);
    const drops: Drop[] = [];
    const rings: Ring[] = [];
    const spawn = (d: Drop, first: boolean) => {
      d.near = r() < 0.4;
      d.len = d.near ? 4 : 2;
      d.v = d.near ? 13 + r() * 4 : 8 + r() * 3;
      d.y = first ? r() * H : -r() * 30;
      d.x = r() * (W + Math.abs(slant) * H) - (slant > 0 ? slant * H : 0);
      d.end = hz * 0.5 + r() * (H - hz * 0.5);
    };
    if (kind === "rain") {
      const n = Math.round(Math.min(520, 110 + (weather?.precip ?? 1) * 90) * scale);
      for (let i = 0; i < n; i++) {
        const d = { x: 0, y: 0, end: 0, v: 0, len: 0, near: false };
        spawn(d, true);
        drops.push(d);
      }
    }

    const glints: Glint[] = [];
    const leaves: Leaf[] = [];
    const respot = (g: Glint) => {
      const s = waterSpot();
      g.x = s.x;
      g.y = s.y;
      g.len = 2 + Math.floor(r() * 3);
      g.life = 2 + Math.floor(r() * 6);
    };
    if (kind === "autan" && wet.length) {
      for (let i = 0; i < Math.round(W / 9); i++) {
        const g = { x: 0, y: 0, len: 0, life: 0 };
        respot(g);
        g.life = Math.floor(r() * 7);
        glints.push(g);
      }
      for (let i = 0; i < Math.max(4, Math.round(7 * scale)); i++) {
        leaves.push({ x: r() * W, y: hz * 0.55 + r() * (H - hz * 0.55), v: 3 + r() * 3.5, ph: r() * Math.PI * 2, c: LEAVES[i % LEAVES.length] });
      }
    }

    const tile = (img: HTMLCanvasElement, off: number, y: number) => {
      const o = ((Math.floor(off) % W) + W) % W;
      ctx.drawImage(img, o - W, y);
      ctx.drawImage(img, o, y);
    };

    let frame = 0;
    const t0 = performance.now();
    const draw = (sec: number) => {
      ctx.clearRect(0, 0, W, H);
      // in the sky only: the cloud bands, then the overcast lid under them
      for (const b of bands) {
        ctx.globalAlpha = b.alpha;
        tile(b.img, sec * b.speed * side, b.y);
      }
      if (lid) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.globalAlpha = night ? 0.5 : 0.42;
        ctx.fillStyle = lid;
        ctx.fillRect(0, 0, W, hz);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (mask) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = "source-over";
      }

      // over everything: fog, rain, the river's rings and glints, leaves
      if (fog) {
        ctx.globalAlpha = night ? 0.22 : 0.16;
        ctx.fillStyle = pal.fog;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.9;
        tile(fog, sec * pxs * 0.35 * side, fogY);
        ctx.globalAlpha = 0.55;
        tile(fog, -sec * pxs * 0.2 * side + W * 0.37, fogY + Math.round(H * 0.05));
      }
      if (lid) {
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = lid;
        ctx.fillRect(0, hz, W, H - hz);
      }

      if (drops.length) {
        ctx.fillStyle = pal.rain;
        for (const near of [false, true]) {
          ctx.globalAlpha = near ? (night ? 0.62 : 0.72) : night ? 0.36 : 0.42;
          ctx.beginPath();
          for (const d of drops) {
            if (d.near !== near) continue;
            for (let k = 0; k < d.len; k++) ctx.rect(Math.round(d.x + slant * k), Math.round(d.y + k), 1, 1);
          }
          ctx.fill();
        }
        ctx.globalAlpha = night ? 0.45 : 0.5;
        ctx.beginPath();
        for (const g of rings) for (const [dx, dy] of RING[g.age]) if (onWater(g.x + dx, g.y + dy)) ctx.rect(g.x + dx, g.y + dy, 1, 1);
        ctx.fill();
      }

      if (glints.length) {
        ctx.fillStyle = pal.glint;
        ctx.globalAlpha = night ? 0.4 : 0.75;
        ctx.beginPath();
        for (const g of glints) if (g.life > 0 && onWater(g.x, g.y) && onWater(g.x + g.len - 1, g.y)) ctx.rect(g.x, g.y, g.len, 1);
        ctx.fill();
      }
      if (leaves.length) {
        ctx.globalAlpha = night ? 0.5 : 0.95;
        for (const l of leaves) {
          const x = Math.round(l.x);
          const y = Math.round(l.y + Math.sin(l.ph + frame * 0.7) * 2);
          const flat = (frame + Math.round(l.ph * 3)) % 4 < 2;
          ctx.fillStyle = l.c;
          ctx.fillRect(x, y, flat ? 2 : 1, flat ? 1 : 2);
        }
      }
      ctx.globalAlpha = 1;
    };

    const step = () => {
      frame++;
      for (const d of drops) {
        d.y += d.v;
        d.x += slant * d.v;
        if (d.y >= d.end) {
          const x = Math.round(d.x);
          const y = Math.round(d.end);
          if (d.near && onWater(x, y) && rings.length < 60) rings.push({ x, y, age: 0 });
          spawn(d, false);
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) if (++rings[i].age >= RING.length) rings.splice(i, 1);
      for (const g of glints) {
        g.x += side;
        if (--g.life <= 0 && r() < 0.5) respot(g);
      }
      for (const l of leaves) {
        l.x += l.v * side;
        if (l.x < -4 || l.x > W + 4) {
          l.x = side > 0 ? -2 : W + 2;
          l.y = hz * 0.55 + r() * (H - hz * 0.55);
        }
      }
    };

    if (reduced) {
      draw(0);
      return;
    }
    let timer = 0;
    const tick = () => {
      step();
      draw((performance.now() - t0) / 1000);
      timer = window.setTimeout(tick, 1000 / FPS);
    };
    const onVis = () => {
      window.clearTimeout(timer);
      if (!document.hidden) tick();
    };
    draw(0);
    timer = window.setTimeout(tick, 1000 / FPS);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [city, phase, kind, weather]);

  if (kind === "clear") return null;
  return <canvas ref={ref} className="os-wallpaper-weather" data-kind={kind} style={{ width: city.W * cell, height: city.H * cell }} />;
}

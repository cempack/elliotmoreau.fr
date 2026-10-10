/**
 * PixelPlanet: a deterministic micro-planet identicon from any seed string.
 * A banded planet or cratered moon with rings, a moonlet and a starfield,
 * painted on a 64px canvas in Nocturne inks — a sibling of the wallpaper moon.
 * Same seed = same sky. Transparent background: card panels show through.
 */
"use client";

import { useEffect, useRef } from "react";

const S = 64;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

function seed32(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // splitmix32 finalizer: full avalanche, so similar seeds decorrelate
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const STAR_INKS = ["#f5f2ec", "#f5f2ec", "#c3c5cf", "#8be9ff", "#b3a4ff", "#c6ff5e"].map(hex);
const STAR_RARE = ["#ffb86b", "#ff5f7e", "#ffd9a3"].map(hex);
const NEBULAE = ["#2c2a66", "#1d3358", "#3d2460"].map(hex);

type Family = { base: RGB; band: RGB; rim: RGB; moon: boolean };
const FAMILIES: { f: Family; w: number }[] = [
  { f: { base: hex("#d6d1e4"), band: hex("#aaa3c8"), rim: hex("#f5f2ec"), moon: true }, w: 0.22 },
  { f: { base: hex("#b3a4ff"), band: hex("#7d6cdc"), rim: hex("#ece8ff"), moon: false }, w: 0.2 },
  { f: { base: hex("#8be9ff"), band: hex("#4aa9cf"), rim: hex("#e2fbff"), moon: false }, w: 0.2 },
  { f: { base: hex("#ffb86b"), band: hex("#d98a48"), rim: hex("#ffe7c8"), moon: false }, w: 0.13 },
  { f: { base: hex("#b8ec6a"), band: hex("#82b83c"), rim: hex("#efffd2"), moon: false }, w: 0.13 },
  { f: { base: hex("#ff8aa0"), band: hex("#d9566f"), rim: hex("#ffdde4"), moon: false }, w: 0.12 },
];

export function paintPlanet(seed: string, ctx: CanvasRenderingContext2D) {
  const rng = mulberry32(seed32(seed));
  const img = ctx.createImageData(S, S);
  const d = img.data;

  /** Source-over blend of one pixel. */
  const dot = (x: number, y: number, c: RGB, a: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= S || yi >= S || a <= 0) return;
    const i = (yi * S + xi) * 4;
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  };

  // --- nebula wash: faint dithered blobs ---
  for (let k = 0; k < 3; k++) {
    const cx = rng() * S;
    const cy = rng() * S;
    const rad = 14 + rng() * 16;
    const col = NEBULAE[Math.floor(rng() * NEBULAE.length)];
    const peak = 0.1 + rng() * 0.08;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const t = 1 - Math.hypot(x - cx, y - cy) / rad;
        if (t <= 0 || bayer(x, y) > t * 1.15) continue;
        dot(x, y, col, peak * t);
      }
    }
  }

  // --- stars ---
  const nStars = 70 + Math.floor(rng() * 45);
  for (let s = 0; s < nStars; s++) {
    const x = Math.floor(rng() * S);
    const y = Math.floor(rng() * S);
    const roll = rng();
    const col =
      rng() < 0.06
        ? STAR_RARE[Math.floor(rng() * STAR_RARE.length)]
        : STAR_INKS[Math.floor(rng() * STAR_INKS.length)];
    if (roll < 0.78) {
      dot(x, y, col, 0.3 + rng() * 0.55);
    } else if (roll < 0.93) {
      const a = 0.45 + rng() * 0.4;
      if (rng() < 0.5) {
        dot(x, y, col, a);
        dot(x + 1, y, col, a * 0.8);
      } else {
        dot(x, y, col, a);
        dot(x, y + 1, col, a * 0.8);
      }
    } else {
      const len = 2 + Math.floor(rng() * 2);
      dot(x, y, col, 0.95);
      for (let i = 1; i <= len; i++) {
        const a = 0.55 * (1 - i / (len + 1));
        dot(x + i, y, col, a);
        dot(x - i, y, col, a);
        dot(x, y + i, col, a);
        dot(x, y - i, col, a);
      }
    }
  }

  // --- planet ---
  let pick = rng();
  let fam = FAMILIES[0].f;
  for (const e of FAMILIES) {
    pick -= e.w;
    if (pick < 0) {
      fam = e.f;
      break;
    }
  }
  const cx = 25 + rng() * 14;
  const cy = 25 + rng() * 14;
  const r = 13 + rng() * 6;
  const la = Math.atan2(-0.35, rng() < 0.5 ? -1 : 1);
  const lx = Math.cos(la);
  const ly = Math.sin(la);
  const bands = 3 + Math.floor(rng() * 3);
  const phase = rng() * Math.PI * 2;

  const craters: { x: number; y: number; r: number }[] = [];
  if (fam.moon) {
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * r * 0.55;
      craters.push({
        x: cx + Math.cos(a) * rr,
        y: cy + Math.sin(a) * rr,
        r: 1.2 + rng() * r * 0.14,
      });
    }
  }

  // --- ring (back half now, front half after the planet) ---
  const hasRing = rng() < 0.65;
  const rx = r * (1.5 + rng() * 0.45);
  const ry = rx * (0.26 + rng() * 0.15);
  const ringPass = (front: boolean) => {
    if (!hasRing) return;
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) {
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        if ((y > cy) !== front) continue;
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const e = dx * dx + dy * dy;
        if (e < 0.96 || e > 1.42) continue;
        if (e > 1.16 && e < 1.24 && bayer(x, y) > 0.25) continue; // Cassini gap
        const edge = e < 1.02 ? (e - 0.96) / 0.06 : e > 1.36 ? (1.42 - e) / 0.06 : 1;
        if (bayer(x, y) > edge) continue;
        const l = clamp01((dx * lx + dy * ly) * 2 + 0.35);
        dot(x, y, fam.rim, 0.3 + 0.45 * l);
      }
    }
  };
  ringPass(false);

  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > r + 0.4) continue;
      if (dist > r - 0.6 && bayer(x, y) > r + 0.4 - dist) continue; // dithered limb
      const nx = dx / r;
      const ny = dy / r;
      let t: RGB;
      if (fam.moon) {
        t = mix(fam.base, fam.band, clamp01(0.5 + (bayer(x, y) - 0.5) * 0.7 + ny * 0.15));
      } else {
        const bc = (ny * 0.5 + 0.5) * bands + Math.sin(nx * 2.5 + phase) * 0.4;
        const stripe = 0.5 + 0.5 * Math.sin(bc * Math.PI * 2);
        t = mix(fam.base, fam.band, clamp01(stripe + (bayer(x, y) - 0.5) * 0.35));
      }
      const l = nx * lx + ny * ly;
      const day = smooth(-0.35, 0.85, l);
      const limb = smooth(1.0, 0.8, dist / r);
      let shade = (0.3 + 0.78 * day) * (0.5 + 0.5 * limb);
      for (const c of craters) {
        const cd = Math.hypot(x - c.x, y - c.y);
        if (cd < c.r) shade *= 0.72;
        else if (cd < c.r + 1 && (x - c.x) * lx + (y - c.y) * ly > 0) shade *= 1.12;
      }
      dot(x, y, [t[0] * shade, t[1] * shade, t[2] * shade], 1);
      if (dist > r - 1.4 && l > 0.1) dot(x, y, fam.rim, 0.35 + 0.4 * l); // rim light
    }
  }
  // specular glint on the day side
  const sx = cx + lx * r * 0.38;
  const sy = cy - r * 0.38;
  for (let y = Math.floor(sy - r * 0.2); y <= sy + r * 0.2; y++) {
    for (let x = Math.floor(sx - r * 0.2); x <= sx + r * 0.2; x++) {
      if (Math.hypot(x - cx, y - cy) > r - 1) continue;
      if (Math.hypot(x - sx, y - sy) < r * 0.15 && bayer(x, y) > 0.35) {
        dot(x, y, [255, 255, 255], 0.45);
      }
    }
  }
  ringPass(true);

  // --- moonlet ---
  if (rng() < 0.55) {
    let mx = 0;
    let my = 0;
    let ok = false;
    for (let t = 0; t < 12 && !ok; t++) {
      mx = 7 + rng() * (S - 14);
      my = 7 + rng() * (S - 14);
      ok = Math.hypot(mx - cx, my - cy) > r + 9;
    }
    if (ok) {
      const mr = 2.5 + rng() * 2.5;
      const mc = rng() < 0.5 ? hex("#e6e1d6") : fam.base;
      const craterX = mx + (rng() - 0.5) * mr;
      const craterY = my + (rng() - 0.5) * mr;
      for (let y = Math.floor(my - mr - 1); y <= my + mr + 1; y++) {
        for (let x = Math.floor(mx - mr - 1); x <= mx + mr + 1; x++) {
          const dist = Math.hypot(x - mx, y - my);
          if (dist > mr) continue;
          const l = ((x - mx) / mr) * lx + ((y - my) / mr) * ly;
          const shade = 0.25 + 0.85 * smooth(-0.3, 0.8, l);
          const cratered = Math.hypot(x - craterX, y - craterY) < mr * 0.4 ? 0.7 : 1;
          const k = shade * cratered;
          dot(x, y, [mc[0] * k, mc[1] * k, mc[2] * k], 1);
        }
      }
    }
  }

  // --- shooting star ---
  if (rng() < 0.25) {
    const ox = 10 + rng() * (S - 20);
    const oy = 6 + rng() * (S / 2);
    const dirx = rng() < 0.5 ? 1 : -1;
    const len = 5 + Math.floor(rng() * 3);
    const col = hex("#f5f2ec");
    dot(ox, oy, col, 0.95);
    for (let i = 1; i <= len; i++) {
      dot(ox - dirx * i, oy + Math.round(i * 0.5), col, 0.7 * (1 - i / (len + 1)));
    }
  }

  ctx.putImageData(img, 0, 0);
}

export function PixelPlanet({ seed, className = "" }: { seed: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintPlanet(seed, ctx);
  }, [seed]);
  return (
    <canvas
      ref={ref}
      width={S}
      height={S}
      aria-hidden
      style={{ imageRendering: "pixelated" }}
      className={className}
    />
  );
}

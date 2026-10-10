"use client";

import { useEffect, useRef } from "react";

/**
 * The desktop wallpaper: a starry night over mossy hills, painted ONCE into a
 * low-res canvas (3 CSS px per pixel) with ordered dithering, then left
 * alone. Repaints only when the viewport width changes. Static on purpose:
 * windows blur it, so it must never animate under them.
 */
const PX = 3;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5;

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
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const SKY: [number, RGB][] = [
  [0, hex("#14181b")],
  [0.38, hex("#1a1f22")],
  [0.62, hex("#1e2527")],
  [0.8, hex("#212b29")],
  [1, hex("#253027")],
];

function skyAt(t: number): RGB {
  for (let i = 1; i < SKY.length; i++) {
    if (t <= SKY[i][0]) {
      const [t0, c0] = SKY[i - 1];
      const [t1, c1] = SKY[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return SKY[SKY.length - 1][1];
}

function paint(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const w = Math.ceil(cssW / PX);
  const h = Math.ceil(cssH / PX);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const rand = mulberry32(0x5eed);

  // hill silhouettes: sums of seeded sines, far → near
  const layers = [
    { base: 0.66, amp: 0.05, f: [1.3, 3.1, 7.7], col: hex("#232c2d"), rim: hex("#2c3837") },
    { base: 0.75, amp: 0.045, f: [1.9, 4.3, 9.1], col: hex("#26312c"), rim: hex("#34443a") },
    { base: 0.86, amp: 0.04, f: [1.1, 2.7, 6.3], col: hex("#2a372f"), rim: hex("#3f5240") },
  ].map((L) => ({ ...L, ph: L.f.map(() => rand() * Math.PI * 2) }));
  const ridge = layers.map((L) => {
    const arr = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let v = 0;
      L.f.forEach((f, i) => (v += Math.sin(u * Math.PI * f + L.ph[i]) / (i + 1)));
      arr[x] = Math.round((L.base - L.amp * v) * h);
    }
    return arr;
  });

  // two soft glows in the sky: moss low-left, glacier high-right
  const glowA = hex("#2c3a2f");
  const glowB = hex("#22323a");
  const STEP = 5;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    for (let x = 0; x < w; x++) {
      let c = skyAt(t);
      const ga = Math.max(0, 1 - Math.hypot((x / w - 0.18) * 1.2, (t - 0.72) * 2.2));
      const gb = Math.max(0, 1 - Math.hypot((x / w - 0.86) * 1.4, (t - 0.12) * 2.6));
      c = mix(c, glowA, ga * ga * 0.75);
      c = mix(c, glowB, gb * gb * 0.6);
      // hills (nearest wins)
      for (let li = layers.length - 1; li >= 0; li--) {
        const top = ridge[li][x];
        if (y >= top) {
          const L = layers[li];
          const depth = Math.min(1, (y - top) / (h * 0.25));
          c = y - top < 1 ? L.rim : mix(L.col, mix(L.col, hex("#1b2220"), 0.6), depth);
          // mist sits in the valley above the nearer layer
          break;
        }
      }
      const o = (y * w + x) * 4;
      const dth = bayer(x, y) * STEP;
      d[o] = Math.round((c[0] + dth) / STEP) * STEP;
      d[o + 1] = Math.round((c[1] + dth) / STEP) * STEP;
      d[o + 2] = Math.round((c[2] + dth) / STEP) * STEP;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // stars: only above the far ridge
  const inks = ["#d3c6aa", "#9da9a0", "#83c092", "#dbbc7f", "#7fbbb3"];
  const count = Math.round((w * h) / 520);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h * 0.7);
    if (y >= ridge[0][x] - 2) continue;
    const r = rand();
    ctx.globalAlpha = 0.25 + rand() * 0.55 * (1 - y / h);
    ctx.fillStyle = inks[r < 0.6 ? 1 : Math.floor(rand() * inks.length)];
    ctx.fillRect(x, y, 1, 1);
    if (r > 0.975) {
      // a few sparkle crosses
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
  }
  ctx.globalAlpha = 1;

  // pines along the middle ridge
  ctx.fillStyle = "#212b27";
  for (let x = 4; x < w - 4; x += 3 + Math.floor(rand() * 9)) {
    if (rand() < 0.45) continue;
    const top = ridge[1][x];
    const th = 4 + Math.floor(rand() * 6);
    for (let k = 0; k < th; k++) {
      const half = Math.floor((k / th) * 2.6);
      ctx.fillRect(x - half, top - th + k, half * 2 + 1, 1);
    }
  }
}

export function Wallpaper() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let lastW = 0;
    let timer = 0;
    const run = () => {
      const w = window.innerWidth;
      // mobile URL bars resize the height constantly: only width repaints
      if (w === lastW) return;
      lastW = w;
      paint(canvas, w, Math.max(window.innerHeight, screen.height * 0.9, 640));
    };
    run();
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return (
    <div className="rice-wall" aria-hidden>
      <canvas ref={ref} />
    </div>
  );
}

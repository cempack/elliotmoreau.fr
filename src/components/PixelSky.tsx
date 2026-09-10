"use client";

import { useEffect, useRef } from "react";

type Star = { x: number; y: number; s: number; ph: number; ink: string };
type Lamp = { x: number; y: number; depth: number; ph: number; green: boolean };
type Fly = { x: number; y: number; vx: number; vy: number; ph: number; ink: string };
type Meteor = { x: number; y: number; vx: number; vy: number; life: number };
type Cloud = { x: number; y: number; w: number; speed: number; seed: number };
type Bat = { x: number; y: number; vx: number; ph: number };

const STAR_INKS = ["#D3C6AA", "#CFE3B8", "#83C092", "#A7C080"];
const FLY_INKS = ["#CFE3B8", "#A7C080", "#D3C6AA"];
// baked overscan below the fold so parallax never reveals empty canvas
const MARGIN = 240;

function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Night forest backdrop: dithered sky bands with constellations, a chunky
 * moon, drifting clouds, a luminous dithered horizon, three moonlit ridges
 * with a pine treeline, valley mist, hamlet lamplight, fireflies, meteors
 * and bats. Four baked depth layers parallax with scroll while the sky
 * deepens the further you read. One throttled loop, still frame under
 * reduced motion.
 */
export function PixelSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = 0;
    let H = 0;
    let stars: Star[] = [];
    let lamps: Lamp[] = [];
    let flies: Fly[] = [];
    let clouds: Cloud[] = [];
    const meteors: Meteor[] = [];
    const bats: Bat[] = [];
    let lastBat = 0;
    let lastMeteor = 0;
    let raf = 0;
    let last = 0;
    let scrollY = 0;
    const t0 = performance.now();

    // four baked depth layers: sky / far ridge / mid ridge / near ridge
    const layers = [0, 1, 2, 3].map(() => document.createElement("canvas"));
    const DEPTH = [0.012, 0.022, 0.034, 0.05];
    const shift = (i: number) => Math.min(MARGIN, reduced ? 0 : scrollY * DEPTH[i]);
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // ridge line, shared by the bake (fills, rims, pines) and lamp seeding
    const ridgeY = (x: number, base: number, amp: number) =>
      H * base + Math.sin(x * 0.008) * amp + Math.sin(x * 0.021 + 1.7) * amp * 0.4;

    // dusk gradient as chunky rows, transitions dissolving through ordered
    // dither instead of hard stripe edges; last band extends past the fold
    const bakeSky = (g: CanvasRenderingContext2D) => {
      const segs = ["#0C1216", "#121A20", "#182227", "#202C32", "#2A3733", "#2A3733"];
      const bounds = [0.3, 0.5, 0.66, 0.8];
      const row = 6;
      for (let y = 0; y < H + MARGIN; y += row) {
        const f = Math.min(1, y / H);
        let si = 0;
        while (si < bounds.length && f > bounds[si]) si++;
        const bi = bounds.findIndex((b) => Math.abs(f - b) < 0.016);
        if (bi >= 0 && y < H) {
          for (let x = 0; x < W; x += 6) {
            g.fillStyle = hash(x * 0.913 + y * 1.71) > 0.5 ? segs[bi] : segs[bi + 1];
            g.fillRect(x, y, 6, row);
          }
        } else {
          g.fillStyle = segs[si];
          g.fillRect(0, y, W, row);
        }
      }
      // luminous horizon: dithered glow breathing behind the far ridge,
      // denser toward the ridgeline with sparse bright flecks
      for (let y = H * 0.46; y < H * 0.68; y += 6) {
        const f = (y - H * 0.46) / (H * 0.22);
        for (let x = 0; x < W; x += 6) {
          const h = hash(x * 1.37 + y * 0.71);
          if (h > 0.06 + f * 0.42) continue;
          g.globalAlpha = 0.07 + f * 0.16;
          g.fillStyle = h > 0.035 + f * 0.42 - 0.015 ? "#CFE3B8" : "#3D5A4E";
          g.fillRect(x, y, 5, 5);
        }
      }
      g.globalAlpha = 1;
    };

    // chunky moon with pixel halo rings and cratered face
    const bakeMoon = (g: CanvasRenderingContext2D) => {
      const mx = W * 0.8;
      const my = H * 0.2;
      const cell = Math.max(6, Math.min(10, Math.floor(W / 200)));
      const glow = g.createRadialGradient(mx, my, cell * 2, mx, my, cell * 12);
      glow.addColorStop(0, "rgba(207,227,184,0.14)");
      glow.addColorStop(1, "rgba(207,227,184,0)");
      g.fillStyle = glow;
      g.fillRect(mx - cell * 12, my - cell * 12, cell * 24, cell * 24);
      for (const [rr, a] of [[7.4, 0.05], [6.2, 0.08], [5.2, 0.12]] as const) {
        g.globalAlpha = a;
        g.fillStyle = "#CFE3B8";
        for (let gy = -7; gy <= 7; gy++) {
          for (let gx = -7; gx <= 7; gx++) {
            const d = Math.sqrt(gx * gx + gy * gy);
            if (d > rr || d < rr - 1.1) continue;
            g.fillRect(mx + gx * cell, my + gy * cell, cell - 1, cell - 1);
          }
        }
      }
      g.globalAlpha = 1;
      for (let gy = -4; gy <= 4; gy++) {
        for (let gx = -4; gx <= 4; gx++) {
          const d = Math.sqrt(gx * gx + gy * gy);
          if (d > 4.2) continue;
          g.fillStyle = hash(gx * 31 + gy * 57 + 7) > 0.78 ? "#A7C080" : "#CFE3B8";
          g.fillRect(mx + gx * cell, my + gy * cell, cell - 1, cell - 1);
        }
      }
    };

    // a few bright stars joined into constellations, faint bone lines
    const bakeConstellations = (g: CanvasRenderingContext2D) => {
      const bright = stars.filter((s) => s.s >= 3).slice(0, 12);
      g.strokeStyle = "rgba(207,227,184,0.16)";
      g.lineWidth = 2;
      for (let c = 0; c + 2 < bright.length; c += 4) {
        g.beginPath();
        g.moveTo(bright[c].x, bright[c].y);
        for (let k = 1; k < 3; k++) {
          const a = bright[c + k - 1];
          const b = bright[c + k];
          // close pairs only — small clusters, never a slash across the sky
          if (Math.hypot(a.x - b.x, a.y - b.y) > 170) {
            g.moveTo(b.x, b.y);
          } else {
            g.lineTo(b.x, b.y);
          }
        }
        g.stroke();
      }
    };

    // lone pine: deep forest green with a snow tip catching the moon
    const pine = (g: CanvasRenderingContext2D, x: number, groundY: number, s: number) => {
      const q = (v: number) => Math.round(v / 2) * 2;
      g.fillStyle = "#24352B";
      let y = q(groundY) + 2;
      for (const w of [20 * s, 15 * s, 10 * s, 6 * s]) {
        y -= 7 * s;
        g.fillRect(q(x - w / 2), Math.round(y), Math.round(w), Math.ceil(7 * s));
      }
      g.globalAlpha = 0.55;
      g.fillStyle = "#CFE3B8";
      g.fillRect(q(x) - 2, Math.round(y), 4, 3);
      g.globalAlpha = 1;
    };

    const RIDGES = [
      { base: 0.66, amp: 26, step: 14, fill: "#2C3833", rim: "#677B6B" },
      { base: 0.78, amp: 30, step: 10, fill: "#232F2A", rim: "#4C6157" },
      { base: 0.9, amp: 24, step: 8, fill: "#1A2422", rim: "#37463F" },
    ];

    // one ridge layer: chunky fill down past the fold, a moonlit rim along
    // the top edge, pines riding the nearest ridge
    const bakeRidge = (g: CanvasRenderingContext2D, li: number) => {
      const L = RIDGES[li];
      for (let x = 0; x < W; x += L.step) {
        const y = Math.round(ridgeY(x, L.base, L.amp) / 4) * 4;
        g.fillStyle = L.fill;
        g.fillRect(x, y, L.step, H + MARGIN - y);
        g.fillStyle = L.rim;
        g.fillRect(x, y, L.step, 3);
        if (hash(x * 3.3 + li * 91) > 0.82) {
          g.globalAlpha = 0.5;
          g.fillStyle = "#CFE3B8";
          g.fillRect(x + 2, y, 2, 2);
          g.globalAlpha = 1;
        }
      }
      if (li === RIDGES.length - 1) {
        for (let x = 10; x < W; x += 22) {
          const h = hash((x * 13.7) | 0);
          if (h < 0.48) continue;
          pine(g, x + h * 8, ridgeY(x, L.base, L.amp), 0.8 + hash((x * 7.3) | 0) * 0.5);
        }
      }
    };

    const bakeLayer = (i: number) => {
      const c = layers[i];
      c.width = Math.round(W * dpr);
      c.height = Math.round((H + MARGIN) * dpr);
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H + MARGIN);
      if (i === 0) {
        bakeSky(g);
        bakeMoon(g);
        bakeConstellations(g);
      } else {
        bakeRidge(g, i - 1);
      }
    };

    const layout = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.floor((W * H) / 8000) }, (_, i) => {
        const h1 = hash(i * 3 + 1);
        const h2 = hash(i * 3 + 2);
        const h3 = hash(i * 3 + 3);
        return {
          x: h1 * W,
          y: h2 * H * 0.55,
          s: h3 > 0.85 ? 3 : 2,
          ph: h1 * Math.PI * 2,
          ink: STAR_INKS[(h2 * STAR_INKS.length) | 0],
        };
      });
      // far-off hamlets: bone lamplight twinkling on the far + mid ridges
      lamps = [];
      [
        [0, 9],
        [1, 6],
      ].forEach(([li, count], si) => {
        const L = RIDGES[li];
        for (let i = 0; i < count; i++) {
          const h1 = hash(si * 501 + i * 37.7);
          const h2 = hash(si * 911 + i * 71.3);
          const cx = h1 * W;
          const cy = ridgeY(cx, L.base, L.amp) - 6 - h2 * 26;
          const n = 3 + ((h1 * 7) | 0);
          for (let l = 0; l < n; l++) {
            lamps.push({
              x: cx + (hash(h1 * 999 + l * 13.1) - 0.5) * 46,
              y: cy + (hash(h2 * 555 + l * 29.7) - 0.5) * 10,
              depth: DEPTH[li + 1],
              ph: h1 * 40 + l * 2.4,
              green: l % 4 === 0,
            });
          }
        }
      });
      flies = Array.from({ length: Math.max(8, Math.floor(W / 110)) }, (_, i) => {
        const h1 = hash(i * 7 + 11);
        const h2 = hash(i * 7 + 23);
        return {
          x: h1 * W,
          y: H * 0.55 + h2 * H * 0.35,
          vx: 6 + h1 * 10,
          vy: (h2 - 0.5) * 8,
          ph: h1 * Math.PI * 2,
          ink: FLY_INKS[i % FLY_INKS.length],
        };
      });
      clouds = Array.from({ length: 4 }, (_, i) => {
        const h1 = hash(i * 13 + 101);
        const h2 = hash(i * 13 + 202);
        const h3 = hash(i * 13 + 303);
        return {
          x: h1 * (W + 400) - 200,
          y: H * (0.06 + h2 * 0.24),
          w: 130 + h3 * 170,
          speed: 4 + h1 * 7,
          seed: i * 977,
        };
      });
      bakeLayer(0);
      bakeLayer(1);
      bakeLayer(2);
      bakeLayer(3);
    };
    layout();
    window.addEventListener("resize", layout);

    // dark dithered clouds crossing the stars
    const drawClouds = (dt: number, off: number) => {
      ctx.fillStyle = "#10171B";
      for (const c of clouds) {
        if (!reduced) {
          c.x += c.speed * dt;
          if (c.x - c.w > W + 40) {
            c.x = -c.w - 40;
            c.y = H * (0.06 + hash(c.seed + ((performance.now() / 1000) | 0)) * 0.24);
          }
        }
        const cy = c.y - off;
        if (cy < -80 || cy > H + 80) continue;
        const cell = 8;
        const n = Math.ceil(c.w / cell);
        for (let i = 0; i < n; i++) {
          const arch = Math.sin((i / n) * Math.PI);
          const hgt = Math.round(arch * 3);
          for (let r = -hgt; r <= 1; r++) {
            if (hash(c.seed + i * 17 + r * 131) < 0.3) continue;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(Math.round(c.x + i * cell), Math.round(cy + r * cell), cell - 1, cell - 1);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    // low mist drifting through the valleys between ridges
    const mist = (t: number, frac: number, depth: number, speed: number) => {
      const yBase = H * frac - (reduced ? 0 : scrollY * depth);
      if (yBase < -40 || yBase > H + 40) return;
      ctx.fillStyle = "#9DA9A0";
      for (let x = 0; x < W; x += 12) {
        const drift = x + t * speed;
        if (hash(drift * 0.61) > 0.42) continue;
        const wob = Math.sin(drift * 0.008 + t * 0.4) * 8;
        ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t * 0.6 + drift * 0.02);
        ctx.fillRect(x, Math.round((yBase + wob) / 2) * 2, 10, 4);
      }
      ctx.globalAlpha = 1;
    };

    const paint = (now: number, dt: number) => {
      const t = (now - t0) / 1000;
      const o = [shift(0), shift(1), shift(2), shift(3)];
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(layers[0], 0, -o[0], W, H + MARGIN);
      // twinkling block stars riding the sky layer
      for (const s of stars) {
        const y = s.y - o[0];
        if (y < -4 || y > H + 4) continue;
        ctx.globalAlpha = reduced ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.ph));
        ctx.fillStyle = s.ink;
        ctx.fillRect(Math.round(s.x), Math.round(y), s.s, s.s);
      }
      ctx.globalAlpha = 1;
      drawClouds(dt, o[0]);
      ctx.drawImage(layers[1], 0, -o[1], W, H + MARGIN);
      mist(t, 0.6, 0.026, 9);
      ctx.drawImage(layers[2], 0, -o[2], W, H + MARGIN);
      mist(t, 0.72, 0.04, 14);
      ctx.drawImage(layers[3], 0, -o[3], W, H + MARGIN);
      // hamlet lamps flicker on their own ridge's depth
      for (const l of lamps) {
        const y = l.y - (reduced ? 0 : Math.min(MARGIN, scrollY * l.depth));
        if (y < -4 || y > H + 4) continue;
        ctx.globalAlpha = reduced
          ? 0.6
          : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.1 + l.ph));
        ctx.fillStyle = l.green ? "#A7C080" : "#D3C6AA";
        ctx.fillRect(Math.round(l.x), Math.round(y), 2, 2);
      }
      ctx.globalAlpha = 1;
      // fireflies drift over the hills with a faint glow
      for (const f of flies) {
        if (!reduced) {
          f.x += f.vx * dt;
          f.y += f.vy * dt + Math.sin(t * 2 + f.ph) * 6 * dt;
          if (f.x > W + 10) {
            f.x = -10;
            f.y = H * (0.55 + hash((f.x | 0) + ((t * 10) | 0)) * 0.35);
          }
          if (f.y < H * 0.45) f.y = H * 0.45;
          if (f.y > H * 0.95) f.y = H * 0.95;
        }
        const y = f.y - o[2];
        if (y < -6 || y > H + 6) continue;
        const tw = reduced ? 0.8 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + f.ph));
        ctx.globalAlpha = tw * 0.25;
        ctx.fillStyle = f.ink;
        ctx.fillRect(Math.round(f.x) - 2, Math.round(y) - 2, 7, 7);
        ctx.globalAlpha = tw;
        ctx.fillRect(Math.round(f.x), Math.round(y), 3, 3);
      }
      ctx.globalAlpha = 1;
      if (!reduced) {
        // bats flap across the upper sky, a few at a time
        if (t - lastBat > 5 && bats.length < 3 && hash((t | 0) + 77) > 0.25) {
          lastBat = t;
          const fromLeft = hash(t) > 0.5;
          bats.push({
            x: fromLeft ? -40 : W + 40,
            y: H * (0.12 + hash(t * 3.7) * 0.3),
            vx: (fromLeft ? 1 : -1) * (70 + hash(t * 9.1) * 60),
            ph: hash(t * 5.3) * Math.PI * 2,
          });
        }
        ctx.fillStyle = "#0B1114";
        for (let i = bats.length - 1; i >= 0; i--) {
          const b = bats[i];
          b.x += b.vx * dt;
          b.y += Math.sin(t * 3 + b.ph) * 24 * dt;
          if (b.x < -70 || b.x > W + 70) {
            bats.splice(i, 1);
            continue;
          }
          const up = Math.sin(t * 14 + b.ph) > 0; // wingbeat, two frames
          const bx = Math.round(b.x);
          const by = Math.round(b.y);
          ctx.fillRect(bx - 2, by - 1, 5, 3);
          if (up) {
            ctx.fillRect(bx - 9, by - 5, 7, 3);
            ctx.fillRect(bx + 3, by - 5, 7, 3);
          } else {
            ctx.fillRect(bx - 9, by + 1, 7, 3);
            ctx.fillRect(bx + 3, by + 1, 7, 3);
          }
        }
        // occasional shooting star
        if (t - lastMeteor > 6.5 && meteors.length === 0 && hash((t | 0) + 3) > 0.3) {
          lastMeteor = t;
          meteors.push({ x: W * (0.2 + hash(t | 0) * 0.6), y: H * 0.08, vx: -520, vy: 200, life: 0.9 });
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          m.life -= dt;
          if (m.life <= 0) {
            meteors.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = Math.min(1, m.life * 2);
          ctx.fillStyle = "#EDEAD8";
          for (let sgm = 0; sgm < 8; sgm++) {
            ctx.fillRect(Math.round(m.x - (m.vx / 60) * sgm), Math.round(m.y - (m.vy / 60) * sgm), 2, 2);
          }
        }
        ctx.globalAlpha = 1;
      }
      // the further you read, the deeper the night gets
      const grade = Math.min(0.3, scrollY * 0.00012);
      if (grade > 0.005) {
        ctx.fillStyle = `rgba(8,13,15,${grade.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    if (reduced) {
      paint(t0, 0);
      return () => {
        window.removeEventListener("resize", layout);
        window.removeEventListener("scroll", onScroll);
      };
    }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000 || 0.033);
      if (now - last < 40) return; // ~25fps is plenty for a backdrop
      last = now;
      paint(now, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-full w-full [image-rendering:pixelated]"
    />
  );
}

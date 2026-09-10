"use client";

import { useEffect } from "react";

/**
 * Click stamps, after omarchy.org's pixel field: every real click stamps a
 * small theme-bright sparkle onto the page — it blooms from a few cells wide
 * to a burst, then dissolves through dither, with a couple of drifting motes.
 * Purely visual, pointer-transparent, off under reduced motion.
 */

const GLYPH = ["...X...", "...X...", ".XXXXX.", "XXXXXXX", ".XXXXX.", "...X...", "...X..."];
const ROWS = GLYPH.length;
const COLS = GLYPH[0].length;

// Everforest accents as rgb triplets — each stamp blooms in one of them
const STAMP_INKS = [
  "167,192,128",
  "211,198,170",
  "230,126,128",
  "167,192,128",
  "127,187,179",
  "131,192,146",
];

type Stamp = {
  x: number;
  y: number;
  born: number;
  life: number;
  seed: number;
  ink: string;
};

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  ink: string;
};

type Trail = {
  x: number;
  y: number;
  born: number;
  life: number;
  ink: string;
  big: boolean;
};

type Ring = {
  x: number;
  y: number;
  born: number;
  life: number;
  ink: string;
};

function hash(n: number) {
  let h = (n * 1664525 + 1013904223) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function ClickStamps() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "65",
      pointerEvents: "none",
    });
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const stamps: Stamp[] = [];
    const motes: Mote[] = [];
    const trail: Trail[] = [];
    const rings: Ring[] = [];
    let raf = 0;
    let running = false;
    let inkCycle = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = false;

      for (let s = stamps.length - 1; s >= 0; s--) {
        const st = stamps[s];
        const age = (now - st.born) / 1000;
        if (age > st.life) {
          stamps.splice(s, 1);
          continue;
        }
        alive = true;
        const k = age / st.life; // 0 → 1
        const cell = 3 + k * 9; // modest bloom, never covers content
        const alpha = (1 - k) * 0.65;
        const size = COLS * cell;
        const ox = st.x - size / 2;
        const oy = st.y - size / 2;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (GLYPH[r][c] !== "X") continue;
            // dither dissolve: late cells drop out pseudo-randomly
            const drop = hash(st.seed + r * COLS + c);
            if (drop < k * 0.85) continue;
            const edge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
            ctx.fillStyle = edge ? `rgba(${st.ink},1)` : "rgba(211,198,170,1)";
            ctx.globalAlpha = alpha * (0.55 + 0.45 * drop);
            ctx.fillRect(ox + c * cell, oy + r * cell, cell - 0.5, cell - 0.5);
          }
        }
      }

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        const age = (now - m.born) / 1000;
        if (age > m.life) {
          motes.splice(i, 1);
          continue;
        }
        alive = true;
        const k = age / m.life;
        ctx.fillStyle = `rgba(${m.ink},1)`;
        ctx.globalAlpha = (1 - k) * 0.85;
        const px = m.x + m.vx * age;
        const py = m.y + m.vy * age - 14 * age * age;
        ctx.fillRect(px, py, 2.5, 2.5);
      }

      // pointer trail: chunky bright cells that fade fast behind the cursor
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        const age = (now - p.born) / 1000;
        if (age > p.life) {
          trail.splice(i, 1);
          continue;
        }
        alive = true;
        const k = age / p.life;
        ctx.fillStyle = `rgba(${p.ink},1)`;
        ctx.globalAlpha = (1 - k) * 0.5;
        const sz = p.big ? 6 : 4;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }

      // shockwave rings: dotted pixel circles racing outward
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        const age = (now - g.born) / 1000;
        if (age > g.life) {
          rings.splice(i, 1);
          continue;
        }
        alive = true;
        const k = age / g.life;
        const radius = 6 + k * 70;
        ctx.fillStyle = `rgba(${g.ink},1)`;
        ctx.globalAlpha = (1 - k) * 0.6;
        const dots = 18;
        for (let d = 0; d < dots; d++) {
          if (hash(g.born + d * 31) < k * 0.5) continue;
          const a = (d / dots) * Math.PI * 2;
          ctx.fillRect(g.x + Math.cos(a) * radius, g.y + Math.sin(a) * radius, 3, 3);
        }
      }
      ctx.globalAlpha = 1;
      if (!alive) {
        running = false;
        return; // stop the loop until the next click
      }
    };
    const kick = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };

    // only real clicks stamp — drags and scrolls stay clean
    let downX = 0;
    let downY = 0;
    let downAt = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downAt = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 10 || performance.now() - downAt > 450) return;
      if (stamps.length > 8) stamps.shift();
      const ink = STAMP_INKS[(Math.random() * STAMP_INKS.length) | 0];
      const now = performance.now();
      // quick small bloom that clears fast
      stamps.push({
        x: e.clientX,
        y: e.clientY,
        born: now,
        life: 0.65 + Math.random() * 0.2,
        seed: (Math.random() * 1e9) | 0,
        ink,
      });
      // single soft shockwave
      rings.push({ x: e.clientX, y: e.clientY, born: now, life: 0.45, ink });
      if (rings.length > 8) rings.splice(0, rings.length - 8);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 30 + Math.random() * 110;
        motes.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 30,
          born: now,
          life: 0.6 + Math.random() * 0.6,
          ink,
        });
      }
      if (motes.length > 160) motes.splice(0, motes.length - 160);
      kick();
    };
    // faint pixel trail behind a moving pointer, throttled and capped
    let lastTrail = 0;
    let lastTX = -99;
    let lastTY = -99;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return; // touch scrolls paint enough already
      const now = performance.now();
      if (now - lastTrail < 70) return;
      if (Math.hypot(e.clientX - lastTX, e.clientY - lastTY) < 8) return;
      lastTrail = now;
      lastTX = e.clientX;
      lastTY = e.clientY;
      inkCycle = (inkCycle + 1) % STAMP_INKS.length;
      trail.push({
        x: e.clientX,
        y: e.clientY,
        born: now,
        life: 0.3,
        ink: STAMP_INKS[inkCycle],
        big: false,
      });
      if (trail.length > 32) trail.splice(0, trail.length - 32);
      kick();
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", fit);
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, []);

  return null;
}

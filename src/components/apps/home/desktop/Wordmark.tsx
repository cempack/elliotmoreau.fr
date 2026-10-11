"use client";

import { useEffect, useRef, useState } from "react";
import { playHeroField, type GridEffect } from "@/lib/ttfx";
import { StillFace, stampWordmark } from "./hero";

/* calm pool only (decrypt, rings, waves): the loud ones turn the name
   into noise instead of presenting it */
const CALM: GridEffect[] = ["grid-decrypt", "grid-rings", "grid-waves"];

export type Box = { w: number; h: number };

/**
 * The name: HeroNameFx's living pixel field (the same engine, stamp and
 * options), directed for the Desktop.
 * - One face. The still name (server HTML, and the whole story under
 *   reduced motion) sits on exactly the cells the canvas lights, in the
 *   same bands, and steps aside only once the canvas has painted its first
 *   frame: the hand-over reads as the word dimming for its decrypt
 *   entrance, never as two names.
 * - Every loop rests off-screen: the field and the drift run only while
 *   the box is in view (out of the layout counts as out of view), and
 *   requestAnimationFrame already sleeps in a hidden tab.
 * - Replays on `em:replay` (the Desktop decides which clicks count).
 * Both boxes' still faces are in the HTML; CSS shows the one that fits.
 */
export function Wordmark({ desk, phone, live }: { desk: Box; phone: Box; live: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0, y: 0, active: false });
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!live) return;
    const box = boxRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!box || !stage || !canvas) return;
    let cancel: (() => void) | null = null;
    let visible = false;
    let size = "";
    let handover = 0;

    const start = () => {
      cancel?.();
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w < 8 || h < 8) return;
      const st = stampWordmark(w, h);
      cancel = playHeroField(canvas, { cols: st.cols, rows: st.rows, lit: st.lit, chars: [] }, {
        motes: true,
        bands: st.bands,
        extrude: true,
        effects: CALM,
        hold: 5500, // the name rests readable; shimmer is the exception
        restFade: 0.85,
        restSheen: 1,
      });
      // the field paints on its next frame: hand over on the one after
      cancelAnimationFrame(handover);
      handover = requestAnimationFrame(() => {
        handover = requestAnimationFrame(() => setPainted(true));
      });
    };
    const stop = () => {
      cancel?.();
      cancel = null;
    };

    /* the drift: the stage orbits on slow non-repeating sine pairs, the
       pointer bends the orbit (never owns it); ~30 fps is plenty for it */
    let raf = 0;
    let last = 0;
    let rx = 0;
    let ry = 0;
    const drift = (now: number) => {
      raf = requestAnimationFrame(drift);
      if (now - last < 33) return;
      last = now;
      const t = now / 1000;
      const autoY = 7 * Math.sin((2 * Math.PI * t) / 7 + 1.7) + 2.8 * Math.sin((2 * Math.PI * t) / 4.6 + 0.6);
      const autoX = 5.6 * Math.sin((2 * Math.PI * t) / 5.8 + 2.9) + 2.2 * Math.sin((2 * Math.PI * t) / 4.1 + 1.2);
      const p = pointer.current;
      const ty = Math.max(-13, Math.min(13, autoY + (p.active ? p.x * 16 : 0)));
      const tx = Math.max(-11, Math.min(11, autoX + (p.active ? p.y * 14 : 0)));
      ry += (ty - ry) * 0.085;
      rx += (tx - rx) * 0.085;
      stage.style.setProperty("--app-home-ry", `${ry.toFixed(3)}deg`);
      stage.style.setProperty("--app-home-rx", `${rx.toFixed(3)}deg`);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting === visible) return;
        visible = e.isIntersecting;
        cancelAnimationFrame(raf);
        if (visible) {
          start();
          raf = requestAnimationFrame(drift);
        } else stop();
      },
      { threshold: 0.2, rootMargin: "64px" }
    );
    io.observe(box);
    // the box only changes size between the desk and the phone layouts
    const ro = new ResizeObserver(() => {
      const next = `${box.clientWidth}x${box.clientHeight}`;
      if (next === size) return;
      const first = !size;
      size = next;
      if (!first && visible) start();
    });
    ro.observe(box);
    const onReplay = () => {
      if (visible) start();
    };
    window.addEventListener("em:replay", onReplay);
    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("em:replay", onReplay);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(handover);
      stop();
    };
  }, [live]);

  const on = live && painted;
  return (
    <div
      ref={boxRef}
      className="app-home-word"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5, active: true };
      }}
      onPointerLeave={() => {
        pointer.current.active = false;
      }}
    >
      <div ref={stageRef} className="app-home-word-stage" data-on={on || undefined}>
        <StillFace w={desk.w} h={desk.h} className="app-home-word-still app-home-word-still--desk" />
        <StillFace w={phone.w} h={phone.h} className="app-home-word-still app-home-word-still--phone" />
        <canvas ref={canvasRef} className="app-home-word-canvas" />
      </div>
    </div>
  );
}

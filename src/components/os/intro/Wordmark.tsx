"use client";

import { useEffect, useRef, useState } from "react";
import { playHeroField, type GridEffect } from "@/lib/ttfx";
import { StillFace, stampWordmark } from "./stamp";

/* calm pool only (decrypt, rings, waves): the loud ones turn the name
   into noise instead of presenting it */
const CALM: GridEffect[] = ["grid-decrypt", "grid-rings", "grid-waves"];

export type Box = { w: number; h: number };

/**
 * The name, as the boot screen plays it: HeroNameFx's living pixel field
 * (the same engine, stamp and options).
 * - One face. The still name (server HTML, and the whole story under
 *   reduced motion) sits on exactly the cells the canvas lights, and steps
 *   aside once the canvas has painted its first frame, then leaves the
 *   layout so the drift costs no style work on it.
 * - The loops run only while the box is on screen and stop on unmount.
 * Both boxes' still faces are in the HTML; CSS shows the one that fits.
 */
export function Wordmark({ desk, phone, live }: { desk: Box; phone: Box; live: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  const [settled, setSettled] = useState(false);

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
    let settle = 0;

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
        hold: 5500,
        restFade: 0.85,
        restSheen: 1,
      });
      // the field paints on its next frame: hand over on the one after
      cancelAnimationFrame(handover);
      handover = requestAnimationFrame(() => {
        handover = requestAnimationFrame(() => {
          setPainted(true);
          window.clearTimeout(settle);
          settle = window.setTimeout(() => setSettled(true), 400);
        });
      });
    };
    const stop = () => {
      cancel?.();
      cancel = null;
    };

    /* the drift: slow non-repeating sine pairs, ~30 fps, written straight
       to the stage's transform (no inherited custom properties, so no
       style work below it) */
    let raf = 0;
    let last = 0;
    const drift = (now: number) => {
      raf = requestAnimationFrame(drift);
      if (now - last < 33) return;
      last = now;
      const t = now / 1000;
      const ry = 5 * Math.sin((2 * Math.PI * t) / 7 + 1.7) + 2 * Math.sin((2 * Math.PI * t) / 4.6 + 0.6);
      const rx = 4 * Math.sin((2 * Math.PI * t) / 5.8 + 2.9) + 1.6 * Math.sin((2 * Math.PI * t) / 4.1 + 1.2);
      stage.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
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
      { threshold: 0.2 }
    );
    io.observe(box);
    const ro = new ResizeObserver(() => {
      const next = `${box.clientWidth}x${box.clientHeight}`;
      if (next === size) return;
      const first = !size;
      size = next;
      if (!first && visible) start();
    });
    ro.observe(box);
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      cancelAnimationFrame(handover);
      window.clearTimeout(settle);
      stop();
    };
  }, [live]);

  const on = live && painted;
  return (
    <div ref={boxRef} className="os-boot-word">
      <div ref={stageRef} className="os-boot-word-stage" data-on={on || undefined} data-settled={(on && settled) || undefined}>
        <StillFace w={desk.w} h={desk.h} className="os-boot-word-still os-boot-word-still--desk" />
        <StillFace w={phone.w} h={phone.h} className="os-boot-word-still os-boot-word-still--phone" />
        <canvas ref={canvasRef} className="os-boot-word-canvas" />
      </div>
    </div>
  );
}

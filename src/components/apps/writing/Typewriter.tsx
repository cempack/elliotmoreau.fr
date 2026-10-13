"use client";

import { useEffect, useRef } from "react";
import { CELL, pixelLoop } from "@/lib/pixel3d";
import { useReduced } from "@/hooks/env";
import { makeTypewriter } from "./typewriter/scene";
import { dateTyped } from "./util";

/**
 * The typewriter in Write back: once it is well in view it feeds a sheet
 * and starts your letter, today's date and then the subject Mail will
 * open with. Drag it to turn it. Decorative: the subject is the link
 * right below it.
 */
export function Typewriter({ subject }: { subject: string }) {
  const reduced = useReduced();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const tw = makeTypewriter(reduced);
    const loop = pixelLoop({
      host,
      canvas,
      size: (w, h) => [Math.ceil(w / CELL), Math.ceil(h / CELL)],
      frame: tw.frame,
    });
    const start = () => {
      tw.type({ title: subject, date: dateTyped(new Date().toISOString()) }, loop.clock());
      loop.wake();
    };

    // the sheet goes in once most of the machine is on screen (at once, without motion)
    let io: IntersectionObserver | null = null;
    if (reduced) start();
    else {
      io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          io?.disconnect();
          io = null;
          start();
        },
        { threshold: 0.5 }
      );
      io.observe(host);
    }

    let drag: { id: number; x: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, t: performance.now() };
      tw.grab();
      loop.wake();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dx = e.clientX - drag.x;
      if (dx && !host.hasPointerCapture(e.pointerId)) host.setPointerCapture(e.pointerId);
      tw.turn(dx, now - drag.t);
      drag.x = e.clientX;
      drag.t = now;
      loop.wake();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      tw.release(performance.now() - drag.t > 80);
      drag = null;
      loop.wake();
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    return () => {
      io?.disconnect();
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      loop.dispose();
    };
  }, [reduced, subject]);

  return (
    <div ref={hostRef} className="app-writing-tw" aria-hidden>
      <canvas ref={canvasRef} className="app-writing-tw-canvas" />
    </div>
  );
}

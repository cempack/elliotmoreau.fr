"use client";

import { useEffect, useRef } from "react";
import { CELL, pixelLoop } from "@/lib/pixel3d";
import { useReduced } from "@/hooks/env";
import { spun, useSound } from "@/lib/sound";
import { markAt } from "./postmark";
import { letterLines, makeTypewriter } from "./typewriter/scene";

/**
 * The typewriter beside the letter: once it is in view it feeds a sheet,
 * types today's date (the postmark's, in Toulouse), then follows the
 * subject and the message as they are written, and sounds like one: a
 * typebar striking for each letter, the spacebar, the margin bell near the
 * end of a line, the carriage thrown back. Drag it to turn it. Decorative: the letter itself is the form beside it.
 */
export function Typewriter({ subject, body }: { subject: string; body: string }) {
  const reduced = useReduced();
  const { blip } = useSound();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ subject, body });
  const sound = useRef(blip);
  /** it only sounds once the letter is the visitor's: the date and a restored draft go in quietly */
  const live = useRef(false);
  const first = useRef(true);
  /** what the running machine is handed when the letter changes */
  const follow = useRef<(() => void) | null>(null);

  useEffect(() => {
    sound.current = blip;
  }, [blip]);

  useEffect(() => {
    if (!first.current) live.current = true;
    first.current = false;
    latest.current = { subject, body };
    follow.current?.();
  }, [subject, body]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const tw = makeTypewriter(reduced, (s) => {
      if (!live.current) return;
      const b = sound.current;
      if (s === "erase") b("space");
      else if (s === "out") b("page");
      else if (s === "in") b("fold");
      else b(s);
    });
    const loop = pixelLoop({
      host,
      canvas,
      size: (w, h) => [Math.ceil(w / CELL), Math.ceil(h / CELL)],
      frame: tw.frame,
    });
    const m = markAt(new Date());
    const date = `${m.dd}.${m.mo}.20${m.yy}`;
    const show = () => {
      const { subject, body } = latest.current;
      tw.show(letterLines(date, subject, body), loop.clock());
      loop.wake();
    };

    // the first sheet goes in once the machine is on screen (at once, without motion)
    let io: IntersectionObserver | null = null;
    if (reduced) {
      follow.current = show;
      show();
    } else {
      io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          io?.disconnect();
          io = null;
          follow.current = show;
          show();
        },
        { threshold: 0.4 }
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
      spun(sound.current, tw.release(performance.now() - drag.t > 80), 8);
      drag = null;
      loop.wake();
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    return () => {
      io?.disconnect();
      follow.current = null;
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      loop.dispose();
    };
  }, [reduced]);

  return (
    <div ref={hostRef} className="app-contact-card app-contact-tw" aria-hidden>
      <canvas ref={canvasRef} className="app-contact-tw-canvas" />
    </div>
  );
}

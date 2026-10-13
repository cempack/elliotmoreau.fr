"use client";

import { useEffect, useRef } from "react";
import { CELL, pixelLoop } from "@/lib/pixel3d";
import { useReduced } from "@/hooks/env";
import { makeTypewriter, type Sheet } from "./typewriter/scene";

/** what the loop reads of the latest props, and what the props reach of the loop */
type Live = {
  sheets: Sheet[];
  pick: number | null;
  /** the sheet in the machine, -1 before the first */
  current: number;
  pickedAt: number;
  wake: () => void;
  clock: () => number;
  onPick: () => void;
};

/** idle this long after a sheet is done (and nobody pointing at a post), it types the next one */
const NEXT_AFTER = 3.8;
const HANDS_OFF = 6;

/**
 * The typewriter over the list: it types the newest post's title as the
 * Blog opens, and whichever post you point at (or tab to) after that;
 * left alone, it works through the others. Drag it to turn it.
 * Decorative: the titles it types are the links right below it.
 */
export function Typewriter({ sheets, pick }: { sheets: Sheet[]; pick: number | null }) {
  const reduced = useReduced();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<Live>({ sheets, pick, current: -1, pickedAt: -Infinity, wake: () => {}, clock: () => 0, onPick: () => {} });

  useEffect(() => {
    live.current.sheets = sheets;
  }, [sheets]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const tw = makeTypewriter(reduced);
    const L = live.current;
    L.current = -1;
    const show = (i: number, t: number) => {
      const s = L.sheets[i];
      if (!s) return;
      L.current = i;
      tw.type(s, t, i + 1);
    };
    const loop = pixelLoop({
      host,
      canvas,
      size: (w, h) => [Math.ceil(w / CELL), Math.ceil(h / CELL)],
      frame: (R, t, dt) => {
        // the first sheet waits until the machine is on screen
        if (L.current < 0) show(L.pick ?? 0, t);
        else if (!reduced && L.pick === null && L.sheets.length > 1 && tw.idle(t) > NEXT_AFTER && t - L.pickedAt > HANDS_OFF)
          show((L.current + 1) % L.sheets.length, t);
        return tw.frame(R, t, dt);
      },
    });
    L.wake = loop.wake;
    L.clock = loop.clock;

    let drag: { id: number; x: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, t: performance.now() };
      tw.grab(loop.clock());
      loop.wake();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dx = e.clientX - drag.x;
      if (dx && !host.hasPointerCapture(e.pointerId)) host.setPointerCapture(e.pointerId);
      tw.turn(dx, now - drag.t, loop.clock());
      drag.x = e.clientX;
      drag.t = now;
      loop.wake();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      tw.release(loop.clock(), performance.now() - drag.t > 80);
      drag = null;
      loop.wake();
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    // a post pointed at: a fresh sheet for it, unless it is the one already in
    L.onPick = () => {
      const i = L.pick;
      if (i === null || i === L.current) return;
      show(i, loop.clock());
      loop.wake();
    };
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      loop.dispose();
      L.wake = () => {};
      L.onPick = () => {};
    };
  }, [reduced]);

  useEffect(() => {
    const L = live.current;
    L.pick = pick;
    L.pickedAt = L.clock();
    L.onPick();
    L.wake();
  }, [pick]);

  return (
    <div ref={hostRef} className="app-writing-tw" aria-hidden>
      <canvas ref={canvasRef} className="app-writing-tw-canvas" />
    </div>
  );
}

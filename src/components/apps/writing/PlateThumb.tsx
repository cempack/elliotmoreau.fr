"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { useSettled, viewTransitionActive } from "@/hooks/useSettled";
import { useReduced } from "@/hooks/env";
import { spring } from "@/lib/motion";
import { MAX_SHIFT, composite, layerOffsets, paintPlateLayers, type PlateLayers } from "./plate";

/** the plate as the reader paints it in a ~610 px frame (3 px cells) */
const PW = 204;
const PH = 100;

/** one seed's plate, painted, and the window onto it */
type Painted = {
  key: string;
  layers: PlateLayers;
  /** the window: its top-left corner in the plate, and its size, in cells */
  x0: number;
  y0: number;
  W: number;
  H: number;
  full: Uint8ClampedArray;
  out: ImageData;
  /** the layer offsets on screen: a shift only repaints when a layer moves a cell */
  at: string;
};

/** Stack the layers at a shift and put the window on the canvas. */
function draw(canvas: HTMLCanvasElement | null, p: Painted | null, shift: number) {
  const ctx = canvas?.getContext("2d");
  if (!ctx || !p) return;
  const offsets = layerOffsets(shift);
  const at = offsets.join();
  if (at === p.at) return;
  p.at = at;
  composite(p.layers, offsets, p.full);
  const out = p.out.data;
  for (let y = 0; y < p.H; y++) {
    const i = ((p.y0 + y) * PW + p.x0) * 4;
    out.set(p.full.subarray(i, i + p.W * 4), y * p.W * 4);
  }
  ctx.putImageData(p.out, 0, 0);
}

/**
 * A post's pixel world in miniature: the plate its reader opens on (seeded
 * by the slug), painted at the reader's size once, then framed around the
 * sun, so each row shows the same sky the post does.
 *
 * `lean` (−1…1) glides the depth layers sideways in whole-cell steps, the
 * reader plate's parallax in small: the near hills travel furthest, the
 * moon barely moves. It holds still under reduced motion.
 */
export function PlateThumb({
  seed,
  cols: W = 64,
  rows: H = 44,
  lean = 0,
  className = "",
}: {
  seed: string;
  /** the window cut from the plate: the sun, its sky and the first ridges */
  cols?: number;
  rows?: number;
  lean?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // painted once the window has finished opening (a plate is a few hundred thousand pixels)
  const settled = useSettled();
  const reduced = useReduced();
  const painted = useRef<Painted | null>(null);
  const shift = useRef(0);
  const to = reduced ? 0 : Math.max(-1, Math.min(1, lean)) * MAX_SHIFT;

  useEffect(() => {
    const key = `${seed}:${W}x${H}`;
    // (settled is read at render, before a window's transition starts: ask again here)
    if (!settled || viewTransitionActive() || !ref.current || painted.current?.key === key) return;
    // the first paint lands where the lean already is; a later seed keeps the glide's place
    if (!painted.current) shift.current = to;
    const layers = paintPlateLayers(seed, PW, PH);
    // the sun sits on the window's right third, a little below its top
    const x0 = Math.max(0, Math.min(PW - W, layers.sun.x - Math.round(W * 0.66)));
    const y0 = Math.max(0, Math.min(PH - H, layers.sun.y - Math.round(Math.min(13, H * 0.3))));
    painted.current = { key, layers, x0, y0, W, H, full: new Uint8ClampedArray(PW * PH * 4), out: new ImageData(W, H), at: "" };
    draw(ref.current, painted.current, shift.current);
  }, [seed, W, H, settled, to]);

  useEffect(() => {
    if (to === shift.current) return;
    // not painted yet: the first paint starts there; reduced motion (read
    // after hydration, so it can arrive late): straight there
    if (!painted.current || reduced) {
      shift.current = to;
      draw(ref.current, painted.current, to);
      return;
    }
    const controls = animate(shift.current, to, {
      ...spring.gentle,
      onUpdate: (v) => {
        shift.current = v;
        draw(ref.current, painted.current, v);
      },
    });
    return () => controls.stop();
  }, [to, reduced]);

  return <canvas ref={ref} className={className} width={W} height={H} aria-hidden />;
}

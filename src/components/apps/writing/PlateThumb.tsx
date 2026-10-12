"use client";

import { useEffect, useRef } from "react";
import { useSettled } from "@/hooks/useSettled";
import { composite, paintPlateLayers } from "./plate";

/** the plate as the reader paints it in a ~610 px frame (3 px cells) */
const PW = 204;
const PH = 100;

/**
 * A post's pixel world in miniature: the plate its reader opens on (seeded
 * by the slug), painted at the reader's size once, then framed around the
 * sun, so each row shows the same sky the post does.
 */
export function PlateThumb({
  seed,
  cols: W = 64,
  rows: H = 44,
  className = "",
}: {
  seed: string;
  /** the window cut from the plate: the sun, its sky and the first ridges */
  cols?: number;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // painted once the window has finished opening (a plate is a few hundred thousand pixels)
  const settled = useSettled();
  const painted = useRef("");
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    const key = `${seed}:${W}x${H}`;
    if (!settled || !c || !ctx || painted.current === key) return;
    painted.current = key;
    const layers = paintPlateLayers(seed, PW, PH);
    const full = new Uint8ClampedArray(PW * PH * 4);
    composite(layers, [0, 0, 0, 0], full);
    // the sun sits on the window's right third, a little below its top
    const x0 = Math.max(0, Math.min(PW - W, layers.sun.x - Math.round(W * 0.66)));
    const y0 = Math.max(0, Math.min(PH - H, layers.sun.y - Math.round(Math.min(13, H * 0.3))));
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      const s = ((y0 + y) * PW + x0) * 4;
      out.set(full.subarray(s, s + W * 4), y * W * 4);
    }
    ctx.putImageData(new ImageData(out, W, H), 0, 0);
  }, [seed, W, H, settled]);
  return <canvas ref={ref} className={className} width={W} height={H} aria-hidden />;
}

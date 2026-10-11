"use client";

import { useEffect, useRef } from "react";
import { composite, paintPlateLayers } from "./plate";

/** the plate as the reader paints it in a ~610 px frame (3 px cells) */
const PW = 204;
const PH = 100;
/** the window cut from it: the sun, its sky and the first ridges */
const W = 64;
const H = 44;

/**
 * A post's pixel world in miniature: the plate its reader opens on (seeded
 * by the slug), painted at the reader's size once, then framed around the
 * sun, so each row shows the same sky the post does.
 */
export function PlateThumb({ seed, className = "" }: { seed: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const layers = paintPlateLayers(seed, PW, PH);
    const full = new Uint8ClampedArray(PW * PH * 4);
    composite(layers, [0, 0, 0, 0], full);
    const x0 = Math.max(0, Math.min(PW - W, layers.sun.x - 42));
    const y0 = Math.max(0, Math.min(PH - H, layers.sun.y - 13));
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      const s = ((y0 + y) * PW + x0) * 4;
      out.set(full.subarray(s, s + W * 4), y * W * 4);
    }
    ctx.putImageData(new ImageData(out, W, H), 0, 0);
  }, [seed]);
  return <canvas ref={ref} className={className} width={W} height={H} aria-hidden />;
}

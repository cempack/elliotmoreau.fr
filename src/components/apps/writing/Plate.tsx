"use client";

import { useEffect, useRef, useState } from "react";
import type { MotionValue } from "motion/react";
import type { GhostPost } from "@/lib/ghost";
import { bayer, composite, layerOffsets, paintPlateLayers, plateSeed, type PlateLayers } from "./plate";
import { realImage } from "./util";
import { afterTransition, viewTransitionActive } from "@/hooks/useSettled";

/** how long the dithered dissolve between two posts' worlds takes */
const DISSOLVE_MS = 340;

/** worlds already painted this visit, by seed and grid: reopening the Blog
    puts its plate up at once instead of painting it again */
const worlds = new Map<string, PlateLayers>();
function remember(key: string, layers: PlateLayers) {
  worlds.delete(key);
  worlds.set(key, layers);
  if (worlds.size > 4) worlds.delete(worlds.keys().next().value!);
}

/**
 * Keeps one canvas sized to its frame (whole cells, 2–4 CSS px each) and
 * paints plates into it. Switching seeds while visible dissolves the old
 * world into the new one in Bayer order: the pixel grid itself is the
 * transition. A shift (parallax) restacks the depth layers in whole-cell
 * steps; it only repaints when a layer actually moves a cell.
 *
 * What is on screen always lives in `img` (JS memory), so a dissolve that
 * interrupts another starts from it without reading the canvas back.
 */
class PlateRenderer {
  W = 0;
  H = 0;
  cell = 0;
  seed = "";
  layers: PlateLayers | null = null;
  /** the frame on screen */
  img: ImageData | null = null;
  /** the current seed at the current offsets */
  target: Uint8ClampedArray | null = null;
  offsets = [0, 0, 0, 0];
  shift = 0;
  from: Uint8ClampedArray | null = null;
  t0 = 0;
  raf = 0;
  /** a paint waiting for the page transition to end */
  private later: (() => void) | null = null;
  private ctx: CanvasRenderingContext2D | null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  /** the frame's size, as its ResizeObserver reports it (reading it here
      would force a layout, inside a window's opening transition at that);
      true when the cell grid changed */
  measure(w: number, h: number) {
    if (w < 8 || h < 8) return false;
    const cell = w >= 760 ? 4 : w >= 520 ? 3 : 2;
    const W = Math.ceil(w / cell);
    const H = Math.ceil(h / cell);
    if (W === this.W && H === this.H && cell === this.cell) return false;
    this.W = W;
    this.H = H;
    this.cell = cell;
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${W * cell}px`;
    this.canvas.style.height = `${H * cell}px`;
    this.img = null;
    this.layers = null;
    return true;
  }

  private build() {
    if (!this.seed || !this.W) return false;
    const key = `${this.seed}|${this.W}x${this.H}`;
    let layers = worlds.get(key);
    if (!layers) {
      // a new world (a few hundred thousand pixels) is painted once the
      // window is in, not in the frames of its opening
      if (viewTransitionActive()) {
        this.later ??= afterTransition(() => {
          this.later = null;
          this.paintNow();
        });
        return false;
      }
      layers = paintPlateLayers(this.seed, this.W, this.H);
      remember(key, layers);
    }
    this.layers = layers;
    this.target = new Uint8ClampedArray(this.W * this.H * 4);
    composite(layers, this.offsets, this.target);
    return true;
  }

  /** put the target (or the dissolve towards it) on the canvas */
  private draw = (now = performance.now()) => {
    const { ctx, target } = this;
    if (!ctx || !target) return;
    if (!this.img || this.img.width !== this.W || this.img.height !== this.H) this.img = new ImageData(this.W, this.H);
    const out = this.img.data;
    const from = this.from;
    if (!from || from.length !== out.length) {
      this.from = null;
      out.set(target);
      ctx.putImageData(this.img, 0, 0);
      return;
    }
    const k = Math.min(1, (now - this.t0) / DISSOLVE_MS);
    // ease out: most pixels flip early, the last few linger
    const e = 1 - (1 - k) * (1 - k);
    const { W, H } = this;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const src = bayer(x >> 1, y >> 1) < e ? target : from;
        out[i] = src[i];
        out[i + 1] = src[i + 1];
        out[i + 2] = src[i + 2];
        out[i + 3] = src[i + 3];
      }
    }
    ctx.putImageData(this.img, 0, 0);
    if (k < 1) this.raf = requestAnimationFrame(this.draw);
    else this.from = null;
  };

  paintNow() {
    cancelAnimationFrame(this.raf);
    this.from = null;
    if (this.build()) this.draw();
  }

  setSeed(seed: string, animate: boolean) {
    if (seed === this.seed) return;
    this.seed = seed;
    if (!this.W || !this.ctx) return;
    if (!animate || !this.img) {
      this.paintNow();
      return;
    }
    cancelAnimationFrame(this.raf);
    // start from whatever is on screen (maybe a dissolve in progress)
    this.from = this.img.data.slice();
    this.t0 = performance.now();
    if (!this.build()) return;
    this.raf = requestAnimationFrame(this.draw);
  }

  setShift(shift: number) {
    this.shift = shift;
    const next = layerOffsets(shift);
    if (next.every((v, i) => v === this.offsets[i])) return;
    this.offsets = next;
    if (!this.layers || !this.target) return;
    composite(this.layers, next, this.target);
    // a running dissolve picks the new target up on its next frame
    if (!this.from) this.draw();
  }

  /** a new seed may dissolve in (before the first size, it is only kept) */
  sync(seed: string, animate: boolean) {
    if (seed !== this.seed) this.setSeed(seed, animate);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.later?.();
  }
}

export function Plate({ post, animate, shift }: { post: GhostPost; animate: boolean; shift?: MotionValue<number> }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PlateRenderer | null>(null);
  const src = realImage(post);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // one renderer per mount; repaint (no dissolve) whenever the grid changes
  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const r = new PlateRenderer(canvas);
    rendererRef.current = r;
    let raf = 0;
    let settle = 0;
    const onResize = ([entry]: ResizeObserverEntry[]) => {
      const { width, height } = entry.contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.clearTimeout(settle);
        // first paint right away (also when a hidden screen is shown),
        // later ones once the size settles
        if (!r.img) {
          r.measure(width, height);
          r.paintNow();
          return;
        }
        settle = window.setTimeout(() => {
          if (r.measure(width, height)) r.paintNow();
        }, 120);
      });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(frame);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      r.destroy();
      rendererRef.current = null;
    };
  }, []);

  const seed = plateSeed(post);
  useEffect(() => {
    rendererRef.current?.sync(seed, animate);
  }, [seed, animate]);

  useEffect(() => {
    if (!shift) return;
    rendererRef.current?.setShift(shift.get());
    return shift.on("change", (v) => rendererRef.current?.setShift(v));
  }, [shift]);

  const showImg = src && failed !== src;

  return (
    <div ref={frameRef} className="app-writing-plate" aria-hidden>
      <canvas ref={canvasRef} className="app-writing-plate-canvas" width={1} height={1} />
      {showImg && (
        // plain img: Ghost covers live on other hosts; the pixel plate under
        // it is the placeholder while it loads (and the fallback if it fails)
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          decoding="async"
          className="app-writing-plate-img"
          data-loaded={loaded === src || undefined}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      )}
    </div>
  );
}

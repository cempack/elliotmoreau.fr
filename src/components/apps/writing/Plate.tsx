"use client";

import { useEffect, useRef, useState } from "react";
import type { GhostPost } from "@/lib/ghost";
import { PixelLabel } from "@/components/PixelLabel";
import { bayer, paintPlate } from "./plate";
import { primaryTag, realImage } from "./util";

/** how long the dithered dissolve between two posts' worlds takes */
const DISSOLVE_MS = 340;

/**
 * Keeps one canvas sized to its frame (whole cells, 2–4 CSS px each) and
 * paints plates into it. Switching seeds while visible dissolves the old
 * world into the new one in Bayer order: the pixel grid itself is the
 * transition.
 */
class PlateRenderer {
  W = 0;
  H = 0;
  cell = 0;
  seed = "";
  img: ImageData | null = null;
  raf = 0;
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private canvas: HTMLCanvasElement,
    private frame: HTMLElement
  ) {
    this.ctx = canvas.getContext("2d");
  }

  /** true when the cell grid changed */
  measure() {
    const w = this.frame.clientWidth;
    const h = this.frame.clientHeight;
    if (w < 8 || h < 8) return false;
    const cell = w >= 760 ? 4 : w >= 420 ? 3 : 2;
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
    return true;
  }

  paintNow() {
    cancelAnimationFrame(this.raf);
    if (!this.seed || !this.W || !this.ctx) return;
    this.img = paintPlate(this.seed, this.W, this.H);
    this.ctx.putImageData(this.img, 0, 0);
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
    const { W, H, ctx } = this;
    // start from whatever is on screen (maybe a dissolve in progress)
    const from = ctx.getImageData(0, 0, W, H).data;
    const next = paintPlate(seed, W, H);
    const to = next.data;
    const frame = new ImageData(W, H);
    const out = frame.data;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DISSOLVE_MS);
      // ease out: most pixels flip early, the last few linger
      const e = 1 - (1 - k) * (1 - k);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const src = bayer(x >> 1, y >> 1) < e ? to : from;
          out[i] = src[i];
          out[i + 1] = src[i + 1];
          out[i + 2] = src[i + 2];
          out[i + 3] = src[i + 3];
        }
      }
      ctx.putImageData(frame, 0, 0);
      if (k < 1) this.raf = requestAnimationFrame(step);
      else {
        this.img = next;
        ctx.putImageData(next, 0, 0);
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }
}

export function Plate({ post, animate }: { post: GhostPost; animate: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PlateRenderer | null>(null);
  const src = realImage(post);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const tag = primaryTag(post);

  // one renderer per mount; repaint (no dissolve) whenever the grid changes
  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const r = new PlateRenderer(canvas, frame);
    rendererRef.current = r;
    let raf = 0;
    let settle = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.clearTimeout(settle);
        // first paint right away, later ones once the size settles
        if (!r.img) {
          if (r.measure()) r.paintNow();
          return;
        }
        settle = window.setTimeout(() => {
          if (r.measure()) r.paintNow();
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

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (!r.W) r.measure();
    r.setSeed(post.slug, animate);
  }, [post.slug, animate]);

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
      {tag && !showImg && <PixelLabel text={tag.name} cell={2} className="app-writing-plate-tag" />}
    </div>
  );
}

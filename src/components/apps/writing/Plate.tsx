"use client";

import { useEffect, useRef, useState } from "react";
import type { GhostPost } from "@/lib/ghost";
import { useI18n } from "@/i18n/client";
import { afterTransition, viewTransitionActive } from "@/hooks/useSettled";
import { loadSky, publishedMs, skyModule, type Sky } from "./sky";
import { realImage } from "./util";

/** CSS px per cell: the globe's grid */
const CELL = 3;
/** a press held this long (still) names the stars */
const HOLD_MS = 260;

/** skies already painted this visit, by post and grid: reopening the Blog
    puts its picture up at once instead of painting it again */
const painted = new Map<string, Uint32Array>();
function remember(key: string, px: Uint32Array) {
  painted.delete(key);
  painted.set(key, px.slice());
  if (painted.size > 6) painted.delete(painted.keys().next().value!);
}

/**
 * Keeps one canvas sized to its frame (whole 3 px cells) and paints the
 * post's sky into it: the real one over Toulouse at the minute it went
 * out, with the amber date stamp and a dithered foot for the title to
 * sit on. Dragging turns the camera along the horizon (and up, with a
 * mouse); holding it draws the constellations in. A drag on a link
 * doesn't follow the link.
 */
class SkyPicture {
  W = 0;
  H = 0;
  sky: Sky | null = null;
  ms = 0;
  face = 0;
  key = "";
  /** the camera has left its first look */
  turned = false;
  private img: ImageData | null = null;
  private out: Uint32Array | null = null;
  private ctx: CanvasRenderingContext2D | null;
  private later: (() => void) | null = null;
  private raf = 0;
  /* the constellation names: where they are, where they're going */
  private want = 0;
  private from = 0;
  private t0 = 0;
  private dur = 0;
  private nraf = 0;
  private hideT = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private planets: readonly string[],
    private reduced: () => boolean,
  ) {
    this.ctx = canvas.getContext("2d");
  }

  /** the frame's size, as its ResizeObserver reports it; true when the cell grid changed */
  measure(w: number, h: number) {
    if (w < 8 || h < 8) return false;
    const W = Math.ceil(w / CELL);
    const H = Math.ceil(h / CELL);
    if (W === this.W && H === this.H) return false;
    this.W = W;
    this.H = H;
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${W * CELL}px`;
    this.canvas.style.height = `${H * CELL}px`;
    this.img = new ImageData(W, H);
    this.out = new Uint32Array(this.img.data.buffer);
    this.sky = null;
    this.turned = false;
    return true;
  }

  setPost(ms: number, face: number, key: string) {
    this.ms = ms;
    this.face = face;
    this.key = key;
    this.turned = false;
    this.sky?.set(ms, face);
  }

  private get cacheKey() {
    return `${this.key}|${this.W}x${this.H}`;
  }

  /** paint the first look, from memory when this post was painted at this size before */
  paintNow() {
    if (!this.W || !this.ms || !this.out) return;
    const hit = painted.get(this.cacheKey);
    if (hit && !this.turned && this.want === 0 && hit.length === this.out.length) {
      this.out.set(hit);
      this.put();
      return;
    }
    const mod = skyModule();
    if (!mod) {
      loadSky().then(() => this.paintNow(), () => {});
      return;
    }
    // a sky is a few tens of thousands of cells: painted once the window is in, not in its opening frames
    if (viewTransitionActive()) {
      this.later ??= afterTransition(() => {
        this.later = null;
        this.paintNow();
      });
      return;
    }
    const sky = this.ensure();
    if (!sky) return;
    sky.paint(this.out);
    if (!this.turned && sky.names === 0) remember(this.cacheKey, this.out);
    this.put();
  }

  /** the sky for this size and post (a picture put up from memory has none until it's touched) */
  ensure() {
    const mod = skyModule();
    if (!mod || !this.W || !this.ms) return null;
    if (!this.sky) {
      const fade = Math.max(6, Math.round(this.H * 0.22));
      this.sky = new mod.Sky({ fov: { h: 55 }, bottom: -2.5, moonR: 6, sunR: 3.5, stamp: true, offset: 14, fade, planets: this.planets });
      this.sky.size(this.W, this.H);
      this.sky.set(this.ms, this.face);
    }
    return this.sky;
  }

  private put() {
    if (!this.ctx || !this.img) return;
    this.ctx.putImageData(this.img, 0, 0);
    this.canvas.dataset.on = "";
  }

  /** turn the camera by a number of cells across and up */
  turn(dx: number, dy: number) {
    const sky = this.sky;
    if (!sky || !this.out) return;
    const k = sky.degPerCell;
    sky.look(-dx * k, dy * k);
    this.turned = true;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      if (this.out) sky.paint(this.out);
      this.put();
    });
  }

  /** draw the constellations in (quickly) or out (a moment after letting go, slowly) */
  names(on: boolean) {
    const target = on ? 1 : 0;
    window.clearTimeout(this.hideT);
    if (target === this.want) return;
    const go = () => {
      const sky = this.sky;
      if (!sky || !this.out) return;
      this.want = target;
      cancelAnimationFrame(this.nraf);
      if (this.reduced()) {
        sky.names = target;
        sky.compose(this.out);
        this.put();
        return;
      }
      this.from = sky.names;
      this.t0 = performance.now();
      this.dur = on ? 220 : 520;
      const step = (now: number) => {
        const k = Math.min(1, (now - this.t0) / this.dur);
        sky.names = this.from + (target - this.from) * k;
        if (this.out) sky.compose(this.out);
        this.put();
        if (k < 1) this.nraf = requestAnimationFrame(step);
      };
      this.nraf = requestAnimationFrame(step);
    };
    if (on) go();
    else this.hideT = window.setTimeout(go, 700);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.nraf);
    window.clearTimeout(this.hideT);
    this.later?.();
  }
}

export function Plate({ post }: { post: GhostPost }) {
  const { t } = useI18n();
  // (a key, so a dictionary rebuilt with the same words doesn't repaint)
  const planets = t.writing.planets.join("|");
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pictureRef = useRef<SkyPicture | null>(null);
  const src = realImage(post);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // one picture per mount (and language); repaint whenever the grid changes
  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pic = new SkyPicture(canvas, planets.split("|"), () => reduced.matches);
    pictureRef.current = pic;
    let raf = 0;
    let settle = 0;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.clearTimeout(settle);
        // first paint right away (also when a hidden screen is shown), later ones once the size settles
        if (!pic.W) {
          pic.measure(width, height);
          pic.paintNow();
          return;
        }
        settle = window.setTimeout(() => {
          if (pic.measure(width, height)) pic.paintNow();
        }, 120);
      });
    });
    ro.observe(frame);

    /* drag to turn, hold to name the stars */
    let drag: { id: number; x: number; y: number; x0: number; y0: number; touch: boolean; moved: boolean } | null = null;
    let hold = 0;
    /** the press that just ended turned the sky or named the stars: it isn't a click */
    let swallow = false;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !pic.ensure()) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== "mouse", moved: false };
      swallow = false;
      window.clearTimeout(hold);
      hold = window.setTimeout(() => {
        swallow = true;
        pic.names(true);
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        const ax = Math.abs(e.clientX - drag.x0);
        const ay = Math.abs(e.clientY - drag.y0);
        // a finger going up or down is scrolling the page: leave it to the browser
        if (Math.hypot(ax, ay) < 4 || (drag.touch && ay > ax)) return;
        drag.moved = true;
        swallow = true;
        window.clearTimeout(hold);
        frame.setPointerCapture(e.pointerId);
        frame.dataset.drag = "";
        pic.names(true);
      }
      const dx = (e.clientX - drag.x) / CELL;
      // a finger only turns along the horizon: up and down is the page's scroll
      const dy = drag.touch ? 0 : (e.clientY - drag.y) / CELL;
      drag.x = e.clientX;
      drag.y = e.clientY;
      pic.turn(dx, dy);
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      window.clearTimeout(hold);
      delete frame.dataset.drag;
      pic.names(false);
    };
    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // a held finger names the stars rather than opening a menu
    const menu = (e: Event) => {
      if (drag?.touch) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const nodrag = (e: Event) => e.preventDefault();
    frame.addEventListener("pointerdown", down);
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", up);
    frame.addEventListener("pointercancel", up);
    frame.addEventListener("click", click, true);
    frame.addEventListener("contextmenu", menu);
    frame.addEventListener("dragstart", nodrag);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.clearTimeout(hold);
      frame.removeEventListener("pointerdown", down);
      frame.removeEventListener("pointermove", move);
      frame.removeEventListener("pointerup", up);
      frame.removeEventListener("pointercancel", up);
      frame.removeEventListener("click", click, true);
      frame.removeEventListener("contextmenu", menu);
      frame.removeEventListener("dragstart", nodrag);
      pic.destroy();
      pictureRef.current = null;
    };
  }, [planets]);

  const ms = publishedMs(post);
  useEffect(() => {
    const pic = pictureRef.current;
    if (!pic || ms == null) return;
    const key = `${post.slug}@${ms}`;
    if (pic.key === key) return;
    loadSky().then(
      (mod) => {
        if (pictureRef.current !== pic) return;
        pic.setPost(ms, mod.faceOf(post.slug, ms), key);
        pic.paintNow();
      },
      () => {},
    );
  }, [post.slug, ms, planets]);

  const showImg = src && failed !== src;

  return (
    <div ref={frameRef} className="app-writing-plate" aria-hidden>
      <canvas ref={canvasRef} className="app-writing-plate-canvas" width={1} height={1} />
      {showImg && (
        // plain img: Ghost covers live on other hosts; the sky under it is
        // the placeholder while it loads (and the fallback if it fails)
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

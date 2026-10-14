"use client";

import { useEffect, useRef, useState } from "react";
import type { RepoInfo } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";
import { scenePixels } from "../KindArt";
import { titleOf, type ProjectKind } from "../kind";
import { fmt } from "../model";
import { MODELS, type Model, type Vec3 } from "./models";
import { DISSOLVE, painter, type Ask, type FromPainter, type ToPainter } from "./painter";
import { marqueeTexture, pick, project, scaled, screenTexture, sharpTexture, type Tex, type View } from "./render";

/** a cell, in CSS pixels; 2 on a small stage (the card's, on tablets and phones), so the machine keeps its detail */
const CELL = 3;
const CELL_SMALL = 2;
const SMALL = 560;
/** the resting camera: looking down a little, turned to show a side */
const TILT = 0.3;
const YAW = -0.42;
const SWAY = 0.5;
/** ambient frames (the sway, the screen's rolling band) */
const AMBIENT_FPS = 15;
/** the most cells painted each frame */
const MAX_W = 340;
const MAX_H = 300;

type Fit = { unit: number; cx: number; cy: number };
/** the screenshot (fetched by the worker, or loaded here as a picture when it can't be) or the shelf's drawing */
type Shot = { kind: "shot"; url: string; img: HTMLImageElement | null };
type Source = Shot | { kind: "scene"; tex: Tex };
/** the sharp screenshot under a frame: the picture, the transform that lands it on the screen, a cell's margin in its pixels */
type Under = { pic: HTMLCanvasElement; m: [number, number, number, number, number, number]; ex: number; ey: number };

/** how big the model can be drawn in w×h cells, whichever way the sway turns it */
function fitRest(model: Model, w: number, h: number): Fit {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const pts: Vec3[] = [];
  for (const b of model.boxes) for (let i = 0; i < 8; i++) pts.push([i & 1 ? b.b[0] : b.a[0], i & 2 ? b.b[1] : b.a[1], i & 4 ? b.b[2] : b.a[2]]);
  for (let i = 0; i < 16; i++) pts.push([Math.cos((i / 16) * Math.PI * 2) * model.turn, model.floorY, Math.sin((i / 16) * Math.PI * 2) * model.turn]);
  for (const yaw of [YAW - SWAY - 0.5, YAW - SWAY, YAW, YAW + SWAY, YAW + SWAY + 0.5])
    for (const p of pts) {
      const [x, y] = project(p, { yaw, tilt: TILT, unit: 1, look: model.center });
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  const unit = Math.max((x1 - x0) / (w * 0.94), (y1 - y0) / (h * 0.9));
  return { unit, cx: w / 2 - (x0 + x1) / 2 / unit, cy: h / 2 - (y0 + y1) / 2 / unit };
}
/** close up: the screen square on, filling the stage */
function fitClose(model: Model, w: number, h: number): Fit & { look: Vec3 } {
  const s = model.screen;
  const unit = Math.max((s.x1 - s.x0) / (w * 0.94), (s.y1 - s.y0) / (h * 0.94));
  return { unit, cx: w / 2, cy: h / 2, look: [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, s.z] };
}

/** the shelf's drawing, as a texture: CSS colours resolved against `el` */
function sceneTexture(kind: ProjectKind, seed: string, el: Element, tint?: Model["screen"]["tint"]): Tex | null {
  const { w, h, px } = scenePixels(kind, seed);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const css = getComputedStyle(el);
  const resolve = (f: string) => f.replace(/var\((--[\w-]+)\)/g, (_, v: string) => css.getPropertyValue(v).trim() || "#000");
  for (const p of px) {
    ctx.globalAlpha = p.o ?? 1;
    ctx.fillStyle = resolve(p.f);
    ctx.fillRect(p.x, p.y, p.w ?? 1, p.h ?? 1);
  }
  return screenTexture(cv, w, h, tint);
}

/**
 * The project, on the machine it runs on: Projects' stage on wide screens,
 * and on top of the project's card on tablets and phones.
 * Apps sit on an old CRT, games in an arcade cabinet with their name on
 * the marquee, desktop add-ons on a widescreen monitor, tools on a green
 * terminal, experiments on a handheld. The screen shows the README's
 * screenshot, or the shelf's drawing when there is none.
 *
 * - drag turns it on its turntable and a throw keeps it turning; at rest it
 *   sways slowly, and picks the sway back up a few seconds after a drag; a
 *   finger dragging mostly up or down is left to the page or the sheet;
 * - the screenshot is drawn sharp under the screen's cells, which keep their
 *   scanlines, soft edge, rolling band and the bezel's shadow on it;
 * - pressing the screen (or Enter) looks closer: the camera squares up to
 *   the screen until it fills the stage; pressing again (or Esc) steps back;
 * - another project on the same machine switches channel (static, then the
 *   picture opening out of a line); another machine dissolves into place in
 *   Bayer order, like the Atlas globe's terminator;
 * - painted on demand, by a worker where there is one (./paint.worker):
 *   every frame while something moves, 15 a second for the sway, nothing
 *   while off screen or in a hidden tab;
 * - reduced motion: no sway or throw, the camera cuts, the screen just
 *   changes.
 */
export function Machine({ repo, kind }: { repo: RepoInfo; kind: ProjectKind }) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [closer, setCloser] = useState(false);
  /** the loop's controls, set up once the canvas is there */
  const api = useRef<{ show(repo: RepoInfo, kind: ProjectKind): void; toggle(): void; back(): void; turn(dir: number): void } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current, frameEl = frameRef.current;
    if (!wrap || !canvas || !frameEl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const buf = document.createElement("canvas");
    const bctx = buf.getContext("2d");
    if (!bctx) return;

    const s = {
      w: 0, h: 0, dpr: 1, cell: CELL,
      /** the frame's cells; lent to the painter while it paints one */
      cells: null as ArrayBuffer | null,
      /** the frame being painted, with where its sharp screenshot goes */
      asked: null as { id: number; at: number; v: View; w: number; h: number; under: Under | null } | null,
      /** a frame was wanted while one was being painted */
      again: false,
      seq: 0,
      /** the textures the painter has */
      sent: null as { screen: Tex | null; marquee: Tex | null } | null,
      kind: null as ProjectKind | null,
      model: null as Model | null,
      rest: null as Fit | null,
      close: null as (Fit & { look: Vec3 }) | null,
      name: "",
      title: "",
      source: null as Source | null,
      texRest: null as Tex | null,
      /** the screenshot, sharp, at the screen's size at rest and close up (in device pixels) */
      sharpRest: null as HTMLCanvasElement | null,
      sharpClose: null as HTMLCanvasElement | null,
      /** bumped by each new picture or size, so a texture finished late for an old one is dropped */
      gen: 0,
      marquee: null as Tex | null,
      since: Infinity,
      changedAt: 0,
      fadeUntil: 0,
      yaw: 0, vYaw: 0, sway: reduced ? 0 : 1,
      zoom: 0, zoomTo: 0,
      drag: null as { id: number; x: number; y: number; at: number; moved: boolean } | null,
      lastInput: -1e9,
      visible: false,
      raf: 0, timer: 0, last: 0,
    };
    const now = () => performance.now() / 1000;

    // the frames: painted by a worker where there is one, else here
    const here = painter();
    let worker: Worker | null = null;
    /** screenshots being scaled by the worker */
    const pictures = new Map<number, (pic: ImageBitmap | null) => void>();
    const tell = (m: ToPainter) => {
      if (worker) worker.postMessage(m);
      else if (m.type === "textures") here.textures(m);
      else if (m.type === "dissolve") here.dissolve(m.at);
    };
    /** the worker failed: paint here from now on */
    const local = () => {
      worker?.terminate();
      worker = null;
      s.asked = null;
      s.sent = null;
      for (const done of pictures.values()) done(null);
      pictures.clear();
    };
    try {
      worker = new Worker(new URL("./paint.worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (e: MessageEvent<FromPainter>) => {
        const d = e.data;
        if (d.type === "picture") {
          pictures.get(d.id)?.(d.pic);
          pictures.delete(d.id);
          return;
        }
        const a = s.asked;
        if (!a || d.id !== a.id) return;
        s.asked = null;
        shown(a, d.buf, d.pictured);
        if (s.again) {
          s.again = false;
          wake();
        } else schedule(now());
      });
      worker.addEventListener("error", () => { local(); wake(); });
    } catch {
      worker = null;
    }

    /** a scaled screenshot's memory back, once its textures are drawn from it */
    const release = (pic: object) => {
      if (typeof ImageBitmap !== "undefined" && pic instanceof ImageBitmap) pic.close();
    };
    /** the screenshot at `w`×`h`: scaled by the worker, or here from the picture loaded here */
    const scaledShot = (src: Shot, w: number, h: number) => {
      if (src.img) return scaled(src.img, w, h);
      const wk = worker;
      if (!wk) return Promise.resolve(null);
      return new Promise<ImageBitmap | null>((done) => {
        const id = ++s.seq;
        pictures.set(id, done);
        wk.postMessage({ type: "picture", id, url: src.url, w, h } satisfies ToPainter);
      });
    };
    /**
     * The screenshot's textures for the current sizes: the screen's cells
     * (what a dissolve shows of it) and the sharp copy at rest; then,
     * without holding the picture up, the close-up copy. False when the
     * picture can't be drawn.
     */
    const shotTextures = async (src: Shot) => {
      const m = s.model, r = s.rest, c = s.close;
      // not laid out yet: the layout builds them
      if (!m || !r || !c) return true;
      const gen = ++s.gen;
      const sw = m.screen.x1 - m.screen.x0, tint = m.screen.tint;
      const px = (unit: number, cap: number) => {
        const w = Math.max(16, Math.min(cap, Math.round((sw / unit) * s.cell * s.dpr)));
        return [w, Math.round(w / 1.6)] as const;
      };
      const [rw, rh] = px(r.unit, 1280);
      const rest = await scaledShot(src, rw, rh);
      if (gen !== s.gen) {
        if (rest) release(rest);
        return true;
      }
      if (!rest) return false;
      const cells = Math.max(16, Math.min(480, Math.round(sw / r.unit)));
      s.texRest = screenTexture(rest, cells, Math.max(10, Math.round(cells / 1.6)), tint);
      s.sharpRest = sharpTexture(rest, rw, rh, tint);
      s.sharpClose = null;
      release(rest);
      void (async () => {
        const [cw, ch] = px(c.unit, 2560);
        const close = await scaledShot(src, cw, ch);
        if (!close) return;
        if (gen === s.gen) s.sharpClose = sharpTexture(close, cw, ch, tint);
        release(close);
        wake();
      })();
      return true;
    };
    const textures = () => {
      const src = s.source;
      if (src?.kind === "scene") s.texRest = src.tex;
      else if (src?.kind === "shot") void shotTextures(src).then(() => wake());
    };
    const marquee = () => {
      s.marquee = null;
      if (s.kind !== "game" || !s.rest) return;
      const mw = Math.max(8, Math.round((1.6 * 0.92) / s.rest.unit)), mh = Math.max(5, Math.round((0.46 * 0.72) / s.rest.unit));
      s.marquee = marqueeTexture(s.title, mw, mh, PIXEL_GLYPHS, PIXEL_FOLD);
    };

    const layout = () => {
      const r = wrap.getBoundingClientRect();
      const cell = r.width < SMALL ? CELL_SMALL : CELL;
      // capped, so a very large window doesn't cost more than a frame can spare
      const w = Math.min(MAX_W, Math.floor(r.width / cell)), h = Math.min(MAX_H, Math.floor(r.height / cell));
      if (w < 24 || h < 24) { s.w = s.h = 0; return; }
      s.cell = cell;
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w !== s.w || h !== s.h) {
        s.w = w; s.h = h;
        buf.width = w; buf.height = h;
      }
      canvas.width = Math.round(w * cell * s.dpr);
      canvas.height = Math.round(h * cell * s.dpr);
      frameEl.style.width = `${w * cell}px`;
      frameEl.style.height = `${h * cell}px`;
      if (s.model) {
        s.rest = fitRest(s.model, w, h);
        s.close = fitClose(s.model, w, h);
        textures();
        marquee();
      }
    };

    const ease = (z: number) => z * z * (3 - 2 * z);
    const view = (t: number): View | null => {
      const m = s.model, r = s.rest, c = s.close;
      if (!m || !r || !c) return null;
      const z = ease(s.zoom);
      const restYaw = s.yaw + YAW + (reduced ? 0 : SWAY * s.sway * Math.sin(t * 0.33));
      const lerp = (a: number, b: number) => a + (b - a) * z;
      const unit = Math.exp(lerp(Math.log(r.unit), Math.log(c.unit)));
      return {
        model: m,
        yaw: lerp(restYaw, 0),
        tilt: lerp(TILT, 0),
        unit,
        cx: lerp(r.cx, c.cx),
        cy: lerp(r.cy, c.cy),
        look: [lerp(m.center[0], c.look[0]), lerp(m.center[1], c.look[1]), lerp(m.center[2], c.look[2])],
        t,
        screen: s.texRest,
        marquee: s.marquee,
        since: s.source ? t - s.changedAt : 0,
      };
    };

    /**
     * Where the sharp screenshot goes under a frame: its corners where the
     * screen's land, the close-up copy once the screen is drawn well over the
     * resting one's size, and a cell's margin round it.
     */
    const beneath = (v: View): Under | null => {
      const rest = s.sharpRest;
      if (!rest) return null;
      const sc = v.model.screen, k = s.cell * s.dpr;
      const at = (x: number, y: number) => {
        const [px, py] = project([x, y, sc.z], v);
        return [(v.cx + px) * k, (v.cy + py) * k] as const;
      };
      const [ax, ay] = at(sc.x0, sc.y1), [bx, by] = at(sc.x1, sc.y1), [cx, cy] = at(sc.x0, sc.y0);
      const across = Math.hypot(bx - ax, by - ay), down = Math.hypot(cx - ax, cy - ay);
      if (across < 1 || down < 1) return null;
      const pic = s.sharpClose && across > rest.width * 1.25 ? s.sharpClose : rest;
      return {
        pic,
        m: [(bx - ax) / pic.width, (by - ay) / pic.width, (cx - ax) / pic.height, (cy - ay) / pic.height, ax, ay],
        ex: (pic.width * k) / across,
        ey: (pic.height * k) / down,
      };
    };
    /** a painted frame onto the canvas: the sharp screenshot first, then the cells over it */
    const shown = (a: { w: number; h: number; under: Under | null }, cells: ArrayBuffer, pictured: number) => {
      // painted for another size: the next one is on its way
      if (a.w !== s.w || a.h !== s.h) return;
      s.cells = cells;
      bctx.putImageData(new ImageData(new Uint8ClampedArray(cells), a.w, a.h), 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const u = a.under;
      if (u && pictured) {
        ctx.setTransform(...u.m);
        // dark round the picture, for the edge cells it doesn't quite reach
        ctx.fillStyle = "#04050e";
        ctx.fillRect(-u.ex, -u.ey, u.pic.width + 2 * u.ex, u.pic.height + 2 * u.ey);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(u.pic, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, 0, 0, a.w, a.h, 0, 0, canvas.width, canvas.height);
    };
    const draw = () => {
      s.raf = 0;
      if (s.asked) {
        // the next frame goes once this one is in, unless the worker has stopped answering
        if (performance.now() - s.asked.at < 1000) { s.again = true; return; }
        local();
      }
      const t = now();
      const dt = Math.min(0.1, t - (s.last || t));
      s.last = t;
      if (!s.w || !s.kind) return;
      // motion
      if (!s.drag && s.vYaw) {
        s.yaw += s.vYaw * dt;
        s.vYaw *= Math.exp(-dt * 2.4);
        if (Math.abs(s.vYaw) < 0.01) s.vYaw = 0;
      }
      if (!reduced) {
        const idle = t - s.lastInput > 3 && s.zoomTo === 0;
        s.sway = Math.max(0, Math.min(1, s.sway + (idle ? dt * 0.35 : -dt * 4)));
      }
      if (s.zoom !== s.zoomTo) {
        if (reduced) s.zoom = s.zoomTo;
        else {
          s.zoom += (s.zoomTo - s.zoom) * (1 - Math.exp(-dt * 6.5));
          if (Math.abs(s.zoom - s.zoomTo) < 0.002) s.zoom = s.zoomTo;
        }
      }
      const v = view(t);
      if (!v) return;
      if (!s.sent || s.sent.screen !== s.texRest || s.sent.marquee !== s.marquee) {
        s.sent = { screen: s.texRest, marquee: s.marquee };
        tell({ type: "textures", ...s.sent });
      }
      const under = s.source?.kind === "shot" ? beneath(v) : null;
      const ask: Ask = { kind: s.kind, w: s.w, h: s.h, yaw: v.yaw, tilt: v.tilt, unit: v.unit, cx: v.cx, cy: v.cy, look: v.look, t, since: v.since, sharp: !!under };
      const size = s.w * s.h * 4;
      const cells = s.cells?.byteLength === size ? s.cells : new ArrayBuffer(size);
      s.cells = null;
      if (worker) {
        s.asked = { id: ++s.seq, at: performance.now(), v, w: s.w, h: s.h, under };
        worker.postMessage({ type: "frame", id: s.seq, ask, buf: cells } satisfies ToPainter, [cells]);
        return;
      }
      shown({ w: s.w, h: s.h, under }, cells, here.frame(ask, new Uint32Array(cells)));
      schedule(t);
    };
    const busy = (t: number) =>
      !!s.drag || s.vYaw !== 0 || s.zoom !== s.zoomTo || t < s.fadeUntil || !s.source || t - s.changedAt < 0.5 || (s.sway > 0 && s.sway < 1);
    const schedule = (t: number) => {
      if (s.raf || s.timer || !s.visible || document.hidden) return;
      if (busy(t)) s.raf = requestAnimationFrame(draw);
      else if (!reduced && s.zoomTo === 0)
        s.timer = window.setTimeout(() => {
          s.timer = 0;
          s.raf = requestAnimationFrame(draw);
        }, 1000 / AMBIENT_FPS);
    };
    const wake = () => {
      if (s.timer) { clearTimeout(s.timer); s.timer = 0; }
      if (!s.raf && s.visible && !document.hidden) s.raf = requestAnimationFrame(draw);
    };

    const show = (r: RepoInfo, k: ProjectKind) => {
      const t = now();
      const model = MODELS[k];
      if (s.model && model !== s.model && !reduced) {
        tell({ type: "dissolve", at: t });
        s.fadeUntil = t + DISSOLVE;
      }
      if (model !== s.model) {
        s.model = model;
        s.yaw = 0;
        s.vYaw = 0;
        if (s.w) {
          s.rest = fitRest(model, s.w, s.h);
          s.close = fitClose(model, s.w, s.h);
        }
      }
      s.kind = k;
      s.name = r.name;
      s.title = titleOf(r);
      s.zoomTo = 0;
      setCloser(false);
      marquee();
      // the screen goes to static until the new picture is in
      s.source = null;
      s.texRest = s.sharpRest = s.sharpClose = null;
      s.gen++;
      const done = (src: Source | null) => {
        if (s.name !== r.name) return;
        s.source = src;
        s.changedAt = reduced ? -Infinity : now();
        wake();
      };
      const scene = () => {
        if (s.name !== r.name) return;
        const tex = sceneTexture(k, r.name, wrap, model.screen.tint);
        s.texRest = tex;
        done(tex ? { kind: "scene", tex } : null);
      };
      const shot = (src: Shot, fail: () => void) =>
        void shotTextures(src).then((ok) => {
          if (s.name !== r.name) return;
          if (ok) done(src);
          else fail();
        });
      const load = (url: string, cors: boolean, fail: () => void) => {
        const img = new Image();
        if (cors) img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => {
          if (s.name === r.name) shot({ kind: "shot", url, img }, scene);
        };
        img.onerror = fail;
        img.src = url;
      };
      // the screenshot from the README's host: fetched and scaled by the worker (GitHub's raw files
      // allow it); else loaded here, openly (its pixels then give the cells too) or as a plain
      // picture; else the drawing
      const url = r.preview;
      if (!url) scene();
      else {
        const loaded = () => load(url, true, () => load(url, false, scene));
        if (worker) shot({ kind: "shot", url, img: null }, loaded);
        else loaded();
      }
      wake();
    };
    const zoom = (to: 0 | 1) => {
      if (!s.model) return;
      if (to === 1) {
        // square up from wherever it was turned: the short way round
        const turned = s.yaw + YAW + SWAY * s.sway * Math.sin(now() * 0.33);
        s.yaw = Math.atan2(Math.sin(turned), Math.cos(turned)) - YAW - SWAY * s.sway * Math.sin(now() * 0.33);
        s.vYaw = 0;
      }
      s.zoomTo = to;
      s.lastInput = now();
      setCloser(to === 1);
      wake();
    };
    api.current = {
      show,
      toggle: () => zoom(s.zoomTo ? 0 : 1),
      back: () => zoom(0),
      turn: (dir) => {
        if (s.zoomTo) zoom(0);
        s.lastInput = now();
        if (reduced) s.yaw += dir * 0.35;
        else s.vYaw += dir * 2.4;
        wake();
      },
    };

    // the pointer: drag turns, a press on the screen looks closer
    const cellAt = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * s.w, ((e.clientY - r.top) / r.height) * s.h];
    };
    const hover = (e: PointerEvent) => {
      if (s.drag) return;
      const v = view(now());
      if (!v) return;
      const [x, y] = cellAt(e);
      const hit = pick(v, s.w, s.h, x, y);
      wrap.dataset.over = s.zoomTo ? "closer" : hit ?? "";
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      s.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), moved: false };
      s.vYaw = 0;
      s.lastInput = now();
      wake();
    };
    const move = (e: PointerEvent) => {
      const d = s.drag;
      if (!d || d.id !== e.pointerId) return hover(e);
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      // a finger going up or down scrolls the card or pulls the sheet: not a turn
      if (!d.moved && e.pointerType === "touch" && Math.abs(dy) > Math.abs(dx)) {
        s.drag = null;
        return;
      }
      if (!d.moved) {
        d.moved = true;
        wrap.setPointerCapture(e.pointerId);
        if (s.zoomTo) zoom(0);
      }
      const at = performance.now(), k = 0.009;
      s.yaw += dx * k;
      s.vYaw = reduced ? 0 : (dx * k) / Math.max(0.008, (at - d.at) / 1000);
      d.x = e.clientX; d.at = at;
      s.lastInput = now();
      wake();
    };
    const up = (e: PointerEvent) => {
      const d = s.drag;
      if (!d || d.id !== e.pointerId) return;
      s.drag = null;
      if (performance.now() - d.at > 90) s.vYaw = 0;
      if (!d.moved) {
        if (s.zoomTo) zoom(0);
        else {
          const v = view(now());
          const [x, y] = cellAt(e);
          if (v && pick(v, s.w, s.h, x, y) === "screen") zoom(1);
        }
      }
      s.lastInput = now();
      wake();
    };
    const cancel = () => { s.drag = null; };
    wrap.addEventListener("pointerdown", down);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", cancel);

    const ro = new ResizeObserver(() => { layout(); wake(); });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; wake(); });
    io.observe(wrap);
    const vis = () => wake();
    document.addEventListener("visibilitychange", vis);
    layout();
    return () => {
      api.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      wrap.removeEventListener("pointerdown", down);
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerup", up);
      wrap.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(s.raf);
      clearTimeout(s.timer);
      worker?.terminate();
    };
  }, []);

  useEffect(() => {
    api.current?.show(repo, kind);
    // the picture and the machine follow the project; its other fields don't change what's drawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.name, repo.preview, kind]);

  const name = titleOf(repo);
  const m = t.work.machine;
  const label = closer ? fmt(m.closer, { name }) : fmt(m.label, { name, device: m[kind] });
  return (
    <div
      ref={wrapRef}
      className="app-work-machine"
      role="button"
      tabIndex={0}
      aria-pressed={closer}
      aria-label={label}
      data-closer={closer ? "" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); api.current?.toggle(); }
        else if (e.key === "Escape" && closer) { e.stopPropagation(); api.current?.back(); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); api.current?.turn(e.key === "ArrowLeft" ? -1 : 1); }
      }}
    >
      <div ref={frameRef} className="app-work-machine-frame">
        <canvas ref={canvasRef} className="app-work-machine-canvas" aria-hidden />
      </div>
    </div>
  );
}

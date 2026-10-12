"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GhostPost } from "@/lib/ghost";
import { project } from "@/lib/motion";
import { composite, paintPlateLayers, plateSeed } from "./plate";
import type { BookFrom } from "./openBook";
import { useThemeTokens } from "@/hooks/useTheme";
import { mix, type ThemeTokens } from "@/lib/theme";
import { afterTransition } from "@/hooks/useSettled";

/**
 * The Shelf of Spines: every post a pixel book standing over the list.
 * A book is as thick as the post takes to read (4 cells plus one per
 * minute), the top of its spine is a slice of the post's plate sky (the
 * real Toulouse sky at the hour it went out), the newest stands face-out
 * like a new release, and a Toulouse brick stood on end, its year pressed
 * in, closes each year. The selected post is the book pulled up out of
 * the row; picking a folder sinks the others behind the lip.
 *
 * Drag it sideways and it coasts, rubber-banding at the ends; pull a book
 * up (fine pointers) or tap it to open it: it comes off the shelf and
 * opens on the post (openBook.ts). Its neighbours lean into the
 * gap in whole-cell steps. An aria-hidden mirror of the list, which keeps
 * the semantics and the keys.
 */

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;

/** the shelf's inks: the wood and cloth from the live theme's ink scale and
    accent; the year bricks stay Toulouse clay */
function shelfInks(t: ThemeTokens) {
  return {
    PANEL: hex(t.ink950),
    GRAIN: hex(mix(t.ink950, t.ink800, 0.45)),
    PLANK: hex(mix(t.ink800, t.ink700, 0.5)),
    LIP: hex(t.ink600),
    CLOTH: [mix(t.ink700, t.ink600, 0.2), t.ink600, mix(t.ink600, t.ink500, 0.35)].map(hex),
    EDGE: hex(t.ink950),
    LABEL: hex(mix(t.ink600, t.label3, 0.45)),
    INK: hex(t.label2),
    LIME: hex(t.signal),
  };
}
const BRICK_A = hex("#e2786b");
const BRICK_B = hex("#e0bd6e");
const BRICK_SIDE = hex("#3f4842");
const PRESSED = hex("#7a3a2e");
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

const DIGITS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};

const PLANK_H = 5;
const SKY_H = 5;

type Item =
  | { kind: "book"; slug: string; post: GhostPost; w: number; h: number; cloth: RGB; face: boolean; sky: Uint8ClampedArray; skyW: number }
  | { kind: "brick"; year: string; w: number; h: number };

type Anim = { x: number; vx: number; lift: number; vl: number; lean: number; vle: number };

function seedHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** a post's plate, small, for spine tops and the face-out cover */
function plateSlice(post: GhostPost, w: number, h: number) {
  const PW = 48;
  const PH = 30;
  const L = paintPlateLayers(plateSeed(post), PW, PH);
  const full = new Uint8ClampedArray(PW * PH * 4);
  composite(L, [0, 0, 0, 0], full);
  const x0 = Math.max(0, Math.min(PW - w, L.sun.x - Math.round(w / 2)));
  const y0 = Math.max(0, Math.min(PH - h, L.sun.y - Math.round(h * 0.45)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(full.subarray(((y0 + y) * PW + x0) * 4, ((y0 + y) * PW + x0 + w) * 4), y * w * 4);
  // the plate fades out at its foot: there, it is the cover's own sky
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
}

export function Shelf({
  posts,
  visible,
  selected,
  opened,
  onPick,
  label,
}: {
  /** every post (newest first), so a folder can sink the rest */
  posts: GhostPost[];
  /** the slugs in the current folder */
  visible: Set<string>;
  selected: string | null;
  /** posts this visitor opened (a ribbon) */
  opened: Set<string>;
  /** a book taken off the shelf, with where its spine stood (to open it from there) */
  onPick: (slug: string, from: BookFrom | null) => void;
  /** a book's full title, for the hover callout */
  label: (p: GhostPost) => string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tokens = useThemeTokens();
  const K = useMemo(() => shelfInks(tokens), [tokens]);
  const titles = useRef(new Map<string, HTMLSpanElement>());
  const [dims, setDims] = useState<{ W: number; H: number; cell: number } | null>(null);
  const [hover, setHoverState] = useState<{ slug: string; x: number } | null>(null);
  const kickRef = useRef<() => void>(() => {});
  const st = useRef({ s: 0, vs: 0, sTarget: 0, anims: new Map<string, Anim>(), raf: 0, running: false, reduced: false });
  const g = useRef<{ pid: number; x0: number; y0: number; s0: number; axis: "x" | "y" | null; slug: string | null; lift0: number; samples: { t: number; x: number; y: number }[]; touch: boolean } | null>(null);
  const pulling = useRef<{ slug: string; lift: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // the books are cut and painted once the window has opened, never mid transition
    let cancel = () => {};
    const measure = () => {
      cancel();
      cancel = afterTransition(measureNow);
    };
    const measureNow = () => {
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
      const cell = Math.max(1, Math.round(3 * dpr)) / dpr;
      const W = Math.max(40, Math.floor(el.clientWidth / cell));
      const H = Math.max(30, Math.floor(el.clientHeight / cell));
      setDims((p) => (p && p.W === W && p.H === H && p.cell === cell ? p : { W, H, cell }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    st.current.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      cancel();
      ro.disconnect();
    };
  }, []);

  // the books: sizes, cloth, sky slices (painted once per post)
  const items = useMemo<Item[]>(() => {
    if (!dims) return [];
    const tags = new Map<string, number>();
    const out: Item[] = [];
    let year = "";
    posts.forEach((p, i) => {
      const y = p.published_at.slice(0, 4);
      if (year && y !== year) out.push({ kind: "brick", year, w: 7, h: Math.min(26, dims.H - PLANK_H - 6) });
      year = y;
      const tag = p.tags?.[0]?.slug ?? "";
      if (!tags.has(tag)) tags.set(tag, tags.size % K.CLOTH.length);
      const face = i === 0;
      const tall = seedHash(p.slug) & 1;
      // the tallest a book can be and still come 40% out of the row
      const hMax = Math.floor((dims.H - PLANK_H - 1) / 1.4);
      const h = face || tall ? hMax : hMax - 2;
      const w = face ? 20 : Math.max(6, Math.min(18, 4 + Math.max(1, p.reading_time || 1)));
      const skyW = face ? w - 2 : w - 1;
      out.push({ kind: "book", slug: p.slug, post: p, w, h, cloth: K.CLOTH[tags.get(tag)!], face, sky: plateSlice(p, skyW, face ? 12 : SKY_H), skyW });
    });
    if (year) out.push({ kind: "brick", year, w: 7, h: Math.min(26, dims.H - PLANK_H - 6) });
    return out;
  }, [posts, dims, K]);

  // targets: x along the plank (sunk books close ranks), lift, lean
  const targets = useMemo(() => {
    const t = new Map<string, { x: number; lift: number; lean: number; w: number }>();
    let x = 3;
    const keyOf = (it: Item, i: number) => (it.kind === "book" ? it.slug : `y${it.year}-${i}`);
    items.forEach((it, i) => {
      const shown = it.kind === "brick" || visible.has(it.slug);
      const lift = it.kind === "book" ? (!shown ? -(it.h + 6) : it.slug === selected ? Math.round(it.h * 0.4) : hover?.slug === it.slug ? 1 : 0) : 0;
      t.set(keyOf(it, i), { x, lift, lean: 0, w: it.w });
      if (shown) x += it.w + (it.kind === "brick" ? 2 : 0);
    });
    // neighbours lean into the pulled-out book's gap
    const idx = items.findIndex((it) => it.kind === "book" && it.slug === selected);
    if (idx >= 0) {
      for (const [d, k] of [
        [-1, 1],
        [1, -1],
      ] as const) {
        const j = idx + d;
        const it = items[j];
        if (it?.kind === "book" && visible.has(it.slug)) t.get(it.slug)!.lean = 2 * k;
      }
    }
    return { t, width: x + 2, keyOf };
  }, [items, visible, selected, hover]);

  // the painter, and a spring loop that runs only while something moves
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || !dims) return;
    const { W, H, cell } = dims;
    cv.width = W;
    cv.height = H;
    cv.style.width = `${W * cell}px`;
    cv.style.height = `${H * cell}px`;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const S = st.current;
    const base = H - PLANK_H;
    const minS = Math.min(0, W - targets.width);
    S.sTarget = Math.max(minS, Math.min(0, S.sTarget));

    const put = (x: number, y: number, c: RGB) => {
      if (x < 0 || y < 0 || x >= W || y >= base) return;
      const o = (y * W + x) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    };

    const draw = () => {
      // panel with grain, then the plank and its lip
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          const c = y >= base ? (y === base ? K.LIP : K.PLANK) : bayer(x + Math.round(S.s), y) < 0.06 ? K.GRAIN : K.PANEL;
          d[o] = c[0];
          d[o + 1] = c[1];
          d[o + 2] = c[2];
          d[o + 3] = 255;
        }
      }
      const sx = Math.round(S.s);
      items.forEach((it, i) => {
        const a = S.anims.get(targets.keyOf(it, i));
        if (!a) return;
        const x0 = Math.round(a.x) + sx;
        const lift = Math.round(a.lift);
        if (x0 > W || x0 + it.w < 0) return;
        if (it.kind === "brick") {
          const top = base - it.h;
          for (let y = top; y < base; y++)
            for (let x = 0; x < it.w; x++) put(x0 + x, y, x === it.w - 1 ? BRICK_SIDE : bayer(x, y) < 0.45 ? BRICK_A : BRICK_B);
          [...it.year].forEach((ch, k) =>
            DIGITS[ch]?.forEach((row, ry) => {
              for (let rx = 0; rx < 3; rx++) if (row[rx] === "#") put(x0 + 2 + rx, top + 2 + k * 6 + ry, PRESSED);
            })
          );
          return;
        }
        const top = base - it.h - lift;
        const lean = Math.round(a.lean);
        for (let y = top; y < base - lift + it.h && y < base; y++) {
          const fromBottom = base - lift - y;
          if (fromBottom <= 0) break;
          // a lean is a shear in whole cells: more at the top
          const off = lean ? Math.round((lean * fromBottom) / it.h) : 0;
          const ry = y - top;
          for (let x = 0; x < it.w; x++) {
            let c: RGB = x === it.w - 1 ? K.EDGE : it.cloth;
            if (it.face) {
              // face-out: a cover with the plate on its upper half
              if (ry >= 1 && ry < 13 && x >= 1 && x < it.w - 1) {
                const o = ((ry - 1) * it.skyW + (x - 1)) * 4;
                c = [it.sky[o], it.sky[o + 1], it.sky[o + 2]];
              } else if (ry === 13 && x >= 1 && x < it.w - 1) c = K.LABEL;
            } else if (ry < SKY_H && x < it.skyW) {
              const o = (ry * it.skyW + x) * 4;
              c = [it.sky[o], it.sky[o + 1], it.sky[o + 2]];
            } else if (ry === SKY_H && x < it.w - 1) c = K.LABEL;
            put(x0 + x + off, y, c);
          }
        }
        // reading minutes at the foot, in pixel numerals
        const mins = String(Math.max(1, it.post.reading_time || 1));
        const nx = x0 + Math.floor((it.w - 1 - (mins.length * 4 - 1)) / 2);
        [...mins].forEach((ch, k) =>
          DIGITS[ch]?.forEach((row, ry) => {
            for (let rx = 0; rx < 3; rx++) if (row[rx] === "#") put(nx + k * 4 + rx, base - lift - 6 + ry, K.INK);
          })
        );
        // the selected book's headband; a ribbon for posts already opened
        if (it.slug === selected) for (let x = 0; x < it.w - 1; x++) put(x0 + x, top, K.LIME);
        if (opened.has(it.slug) && it.slug !== selected) for (let y = top - 2; y < top + 3; y++) put(x0 + it.w - 3, y, K.LIME);
      });
      ctx.putImageData(img, 0, 0);
      // titles ride their books (DOM text, crisp)
      items.forEach((it, i) => {
        if (it.kind !== "book") return;
        const el = titles.current.get(it.slug);
        const a = S.anims.get(targets.keyOf(it, i));
        if (!el || !a) return;
        const x = (Math.round(a.x) + sx + (it.w - 1) / 2) * cell;
        const top = it.face ? 15 : SKY_H + 2;
        const y0 = (base - it.h - Math.round(a.lift) + top) * cell;
        const len = (it.h - top - 7) * cell;
        el.style.transform = `translate(${x}px, ${y0 + len}px) rotate(-90deg)`;
        el.style.width = `${Math.max(0, len)}px`;
        el.style.opacity = a.lift < -2 ? "0" : "1";
      });
    };

    const k = 320;
    const c = 2 * Math.sqrt(k);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      let moving = false;
      const spring = (x: number, v: number, to: number): [number, number] => {
        if (S.reduced) return [to, 0];
        const nv = v + (k * (to - x) - c * v) * dt;
        const nx = x + nv * dt;
        if (Math.abs(to - nx) < 0.02 && Math.abs(nv) < 0.05) return [to, 0];
        moving = true;
        return [nx, nv];
      };
      items.forEach((it, i) => {
        const key = targets.keyOf(it, i);
        const tg = targets.t.get(key)!;
        const a = S.anims.get(key)!;
        [a.x, a.vx] = spring(a.x, a.vx, tg.x);
        const pull = pulling.current?.slug === key ? pulling.current.lift : null;
        if (pull != null) a.lift = pull;
        else [a.lift, a.vl] = spring(a.lift, a.vl, tg.lift);
        [a.lean, a.vle] = spring(a.lean, a.vle, tg.lean);
      });
      if (!g.current || g.current.axis !== "x") [S.s, S.vs] = spring(S.s, S.vs, S.sTarget);
      draw();
      if (moving || g.current) S.raf = requestAnimationFrame(step);
      else S.running = false;
    };
    // new books start where they belong; existing ones spring from where they are
    items.forEach((it, i) => {
      const key = targets.keyOf(it, i);
      if (!S.anims.has(key)) {
        const tg = targets.t.get(key)!;
        S.anims.set(key, { x: tg.x, vx: 0, lift: tg.lift, vl: 0, lean: 0, vle: 0 });
      }
    });
    S.running = true;
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(step);
    kickRef.current = () => {
      if (S.running) return;
      S.running = true;
      last = performance.now();
      S.raf = requestAnimationFrame(step);
    };
    return () => cancelAnimationFrame(S.raf);
  }, [dims, items, targets, selected, opened, K]);

  // keep the pulled-out book in view
  useEffect(() => {
    if (!dims || !selected) return;
    const S = st.current;
    const i = items.findIndex((it) => it.kind === "book" && it.slug === selected);
    const tg = i >= 0 ? targets.t.get(selected) : null;
    if (!tg) return;
    const minS = Math.min(0, dims.W - targets.width);
    const left = tg.x + S.sTarget;
    if (left < 2) S.sTarget = Math.max(minS, Math.min(0, -tg.x + 4));
    else if (left + tg.w > dims.W - 2) S.sTarget = Math.max(minS, Math.min(0, dims.W - tg.x - tg.w - 4));
    kickRef.current();
  }, [selected, dims, items, targets]);

  const kick = () => kickRef.current();
  const setHover = (slug: string | null) => {
    if ((hover?.slug ?? null) === slug) return;
    const a = slug ? st.current.anims.get(slug) : null;
    setHoverState(slug && a && dims ? { slug, x: (a.x + Math.round(st.current.s)) * dims.cell } : null);
  };

  /** the book under a point, in canvas cells */
  const bookAt = (clientX: number, clientY: number) => {
    if (!dims || !wrap.current) return null;
    const r = wrap.current.getBoundingClientRect();
    const cx = (clientX - r.left) / dims.cell - Math.round(st.current.s);
    const cy = (clientY - r.top) / dims.cell;
    const base = dims.H - PLANK_H;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind !== "book" || !visible.has(it.slug)) continue;
      const a = st.current.anims.get(it.slug);
      if (!a) continue;
      if (cx >= a.x && cx < a.x + it.w && cy >= base - it.h - a.lift - 1 && cy < base) return it;
    }
    return null;
  };

  /** a book's spine as it stands right now: its place on screen and its pixels */
  const spineOf = (slug: string): BookFrom | null => {
    const it = items.find((x) => x.kind === "book" && x.slug === slug);
    const a = st.current.anims.get(slug);
    const cv = canvas.current;
    if (!dims || !it || it.kind !== "book" || !a || !cv || !wrap.current) return null;
    const box = cv.getBoundingClientRect();
    const base = dims.H - PLANK_H;
    const x0 = Math.round(a.x) + Math.round(st.current.s);
    const top = base - it.h - Math.round(a.lift);
    const h = Math.min(it.h, base - top);
    if (h <= 0) return null;
    const spine = document.createElement("canvas");
    spine.width = it.w;
    spine.height = h;
    spine.getContext("2d")?.drawImage(cv, x0, top, it.w, h, 0, 0, it.w, h);
    return {
      rect: new DOMRect(box.left + x0 * dims.cell, box.top + top * dims.cell, it.w * dims.cell, h * dims.cell),
      spine,
      cloth: css(it.cloth),
      edge: css(K.EDGE),
      label: css(K.LABEL),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !dims) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const b = bookAt(e.clientX, e.clientY);
    const a = b ? st.current.anims.get(b.slug) : null;
    g.current = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, s0: st.current.s, axis: null, slug: b?.slug ?? null, lift0: a?.lift ?? 0, samples: [], touch: e.pointerType !== "mouse" };
    // the book drops a cell under the finger
    if (b && a) a.lift -= 1;
    kick();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!dims) return;
    if (!d) {
      if (e.pointerType === "mouse") setHover(bookAt(e.clientX, e.clientY)?.slug ?? null);
      return;
    }
    if (d.pid !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      // a vertical pull is for a mouse or pen on a book; fingers scroll the list
      d.axis = Math.abs(dy) > Math.abs(dx) && d.slug && !d.touch ? "y" : "x";
    }
    d.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 80) d.samples.shift();
    const S = st.current;
    if (d.axis === "x") {
      const minS = Math.min(0, dims.W - targets.width);
      let s = d.s0 + dx / dims.cell;
      const span = dims.W / 4;
      if (s > 0) s = (s * span * 0.55) / (span + 0.55 * s);
      if (s < minS) s = minS - ((minS - s) * span * 0.55) / (span + 0.55 * (minS - s));
      S.s = s;
      S.vs = 0;
    } else if (d.slug) {
      const it = items.find((x) => x.kind === "book" && x.slug === d.slug);
      if (!it) return;
      const max = it.h * 0.6;
      let lift = d.lift0 - dy / dims.cell;
      if (lift > max) lift = max + (lift - max) * 0.25;
      pulling.current = { slug: d.slug, lift: Math.max(0, lift) };
    }
    kick();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId || !dims) return;
    g.current = null;
    const S = st.current;
    let v = { x: 0, y: 0 };
    if (d.samples.length > 1 && e.timeStamp - d.samples[d.samples.length - 1].t < 60) {
      const a = d.samples[0];
      const b = d.samples[d.samples.length - 1];
      const dt = Math.max(8, b.t - a.t);
      v = { x: ((b.x - a.x) / dt) * 1000, y: ((b.y - a.y) / dt) * 1000 };
    }
    if (!d.axis) {
      if (d.slug) onPick(d.slug, spineOf(d.slug));
    } else if (d.axis === "x") {
      const minS = Math.min(0, dims.W - targets.width);
      const to = S.reduced ? S.s : S.s + project(v.x) / dims.cell;
      S.sTarget = Math.max(minS, Math.min(0, to));
      S.vs = S.reduced ? 0 : v.x / dims.cell;
    } else if (d.slug) {
      const it = items.find((x) => x.kind === "book" && x.slug === d.slug);
      const p = pulling.current;
      pulling.current = null;
      if (it && p && (-v.y > 250 || p.lift > it.h * 0.35)) {
        const a = S.anims.get(d.slug);
        if (a) a.vl = -v.y / dims.cell;
        onPick(d.slug, spineOf(d.slug));
      }
    }
    kick();
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!dims || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const S = st.current;
    const minS = Math.min(0, dims.W - targets.width);
    S.sTarget = Math.max(minS, Math.min(0, S.sTarget - e.deltaX / dims.cell));
    S.s = S.sTarget;
    kick();
  };

  const hovered = hover ? posts.find((p) => p.slug === hover.slug) : null;
  const hoverX = hover?.x ?? 0;

  return (
    <div
      ref={wrap}
      className="app-writing-shelf"
      aria-hidden
      data-lenis-prevent
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onWheel={onWheel}
    >
      <canvas ref={canvas} className="app-writing-shelf-canvas" />
      {items.map((it) =>
        it.kind === "book" ? (
          <span
            key={it.slug}
            ref={(el) => {
              if (el) titles.current.set(it.slug, el);
              else titles.current.delete(it.slug);
            }}
            className="app-writing-shelf-title"
          >
            {it.post.title}
          </span>
        ) : null
      )}
      {hovered && (
        <span className="app-writing-shelf-callout" style={{ left: Math.max(4, Math.min(hoverX, (dims?.W ?? 0) * (dims?.cell ?? 0) - 180)) }}>
          {label(hovered)}
        </span>
      )}
    </div>
  );
}

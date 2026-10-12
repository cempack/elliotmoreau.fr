"use client";

import Link from "next/link";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { project, spring, springFrom } from "@/lib/motion";
import { Glass } from "@/components/os/Glass";
import { useSiteData } from "@/components/os/SiteData";
import { composite, paintPlateLayers, plateSeed } from "@/components/apps/writing/plate";
import type { GhostPost } from "@/lib/ghost";
import { useMinute } from "./time";
import { afterTransition } from "@/hooks/useSettled";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/* ───────────────────────────── the kiosk ─────────────────────────────
   The latest post as the headline poster outside a French tabac, held in
   its wire frame with the older posts stacked under it. The top sheet
   carries the post's own Writing plate, re-dithered coarsely like
   newsprint, a kicker, the headline in heavy capitals (real text, accents
   and all), the reading time where a poster's price would be and the
   date at the foot.

   Peel the corner: the sheet folds along the line perpendicular to the
   drag (the bisector between the corner and the hand), its back face
   showing the headline through the paper, mirrored. Past the threshold,
   or thrown, it folds all the way and tucks behind the stack; short of it
   it lies flat again. Pull down from the top edge to bring the last sheet
   back. A tap opens the post. The stack is a loop of the latest six. */

const STACK = 6;
const CELL = 2;

type Pt = { x: number; y: number };

/** the plate's sky, cropped round its sun and printed in four inks */
function Newsprint({ seed, w, h }: { seed: string; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // printed once the Desktop is in, not in the frames of its transition
  useEffect(() => afterTransition(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const PW = 204;
    const PH = 100;
    const L = paintPlateLayers(seed, PW, PH);
    const full = new Uint8ClampedArray(PW * PH * 4);
    composite(L, [0, 0, 0, 0], full);
    const x0 = Math.max(0, Math.min(PW - w, L.sun.x - Math.round(w * 0.6)));
    const y0 = Math.max(0, Math.min(PH - h, L.sun.y - Math.round(h * 0.35)));
    const inks = [
      [42, 41, 38],
      [104, 100, 91],
      [163, 158, 145],
      [214, 210, 198],
    ];
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((y0 + y) * PW + x0 + x) * 4;
        const lum = full[s + 3] === 0 ? 1 : (0.2126 * full[s] + 0.7152 * full[s + 1] + 0.0722 * full[s + 2]) / 255;
        // lift the darks so the sky reads as print, then four dithered inks
        const v = Math.min(1, Math.pow(lum, 0.62) * 1.08);
        const k = Math.min(3, Math.floor(v * 3 + (B[((y & 3) << 2) | (x & 3)] + 0.5) / 16));
        const o = (y * w + x) * 4;
        img.data[o] = inks[k][0];
        img.data[o + 1] = inks[k][1];
        img.data[o + 2] = inks[k][2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }), [seed, w, h]);
  return <canvas ref={ref} width={w} height={h} className="app-home-kiosk-print" aria-hidden />;
}

function Face({ post, kicker, minutes, date }: { post: GhostPost; kicker: string; minutes: string; date: string }) {
  return (
    <>
      <Newsprint seed={plateSeed(post)} w={60} h={19} />
      <span className="app-home-kiosk-kicker">{kicker}</span>
      <span className="app-home-kiosk-head">{post.title}</span>
      <span className="app-home-kiosk-foot">
        <span className="app-home-kiosk-price tabular">{minutes}</span>
        <span className="app-home-kiosk-date" suppressHydrationWarning>
          {date}
        </span>
      </span>
    </>
  );
}

/** the part of the sheet still flat, and the folded flap mirrored over it */
function foldGeometry(P: Pt, C: Pt, w: number, h: number) {
  const dx = C.x - P.x;
  const dy = C.y - P.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const n = { x: dx / len, y: dy / len };
  const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
  const side = (q: Pt) => (q.x - M.x) * n.x + (q.y - M.y) * n.y;
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  // clip the rectangle by the fold line, both ways
  const flat: Pt[] = [];
  const flap: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) flat.push(a);
    else flap.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      flat.push(q);
      flap.push(q);
    }
  }
  const k = 2 * (M.x * n.x + M.y * n.y);
  const matrix = `matrix(${1 - 2 * n.x * n.x}, ${-2 * n.x * n.y}, ${-2 * n.x * n.y}, ${1 - 2 * n.y * n.y}, ${k * n.x}, ${k * n.y})`;
  const poly = (pts: Pt[]) => `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ")})`;
  // shading on the back face, starting at the fold: dithered in two steps
  const theta = Math.atan2(n.x, -n.y);
  const L = Math.abs(w * Math.sin(theta)) + Math.abs(h * Math.cos(theta));
  const s0 = (M.x - w / 2) * n.x + (M.y - h / 2) * n.y + L / 2;
  const shade = `linear-gradient(${theta}rad, transparent ${s0}px, rgba(20,18,16,0.34) ${s0}px, rgba(20,18,16,0.34) ${s0 + 2}px, rgba(20,18,16,0.16) ${s0 + 2}px, rgba(20,18,16,0.16) ${s0 + 6}px, transparent ${s0 + 6}px)`;
  return { flat: poly(flat), flap: poly(flap), matrix, shade, done: flat.length === 0 };
}

export function LatestPostWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.post;
  const { posts } = useSiteData();
  const now = useMinute();
  const reduced = useReduced();
  const stack = posts.slice(0, STACK);
  const [top, setTop] = useState(0);
  const [peel, setPeel] = useState<Pt | null>(null);
  // the sheet's size, measured when a hand takes it
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const sheetRef = useRef<HTMLAnchorElement>(null);
  const g = useRef<{ pid: number; mode: "corner" | "pull"; x0: number; y0: number; moved: boolean; s: { t: number; x: number; y: number }[] } | null>(null);
  const flight = useRef<AnimationPlaybackControls[]>([]);
  const suppress = useRef(false);

  if (!stack.length) {
    return (
      <div className="app-home-widget app-home-widget--post app-home-kiosk">
        <Glass thickness="regular" refract={false} aria-hidden className="app-home-widget-glass" />
        <Link prefetch={false} href={path("/writing")} transitionTypes={["app-open"]} className="app-home-kiosk-frame" aria-label={w.ariaEmpty}>
          <span className="app-home-kiosk-sheet app-home-kiosk-blank">
            <span className="app-home-kiosk-head">{w.empty}</span>
          </span>
        </Link>
      </div>
    );
  }

  const n = stack.length;
  const at = (i: number) => stack[((i % n) + n) % n];
  const post = at(top);
  const next = at(top + 1);

  const describe = (p: GhostPost) => {
    const age = Date.parse(p.published_at);
    const fresh = !!now && now.getTime() - age < 7 * 86_400_000;
    return {
      kicker: fresh ? w.kickerNew : (p.tags[0]?.name ?? w.kickerPost),
      minutes: fill(w.minutesShort, { n: Math.max(1, p.reading_time || 1) }),
      // the year only when it isn't this one
      date: new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
        day: "numeric",
        month: "short",
        year: now && new Date(age).getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      }).format(new Date(age)),
    };
  };
  const label = fill(w.aria, {
    title: post.title,
    minutes: fill(w.minutes, { n: Math.max(1, post.reading_time || 1) }),
    date: describe(post).date,
  });

  const size = () => {
    const r = sheetRef.current!.getBoundingClientRect();
    return { r, w: r.width, h: r.height };
  };
  const snap = (v: number) => Math.round(v / CELL) * CELL;

  const stop = () => {
    flight.current.forEach((a) => a.stop());
    flight.current = [];
  };
  /** spring the hand's point to `to`, then call `done` */
  const fly = (from: Pt, to: Pt, v: Pt, thrown: boolean, done: () => void) => {
    stop();
    if (reduced) {
      done();
      return;
    }
    const cfg = thrown ? springFrom(0.4, 0.18) : spring.default;
    let x = from.x;
    let y = from.y;
    let left = 2;
    const end = () => {
      left -= 1;
      if (left === 0) done();
    };
    flight.current = [
      animate(from.x, to.x, { ...cfg, velocity: v.x, onUpdate: (val) => ((x = val), setPeel({ x: snap(x), y: snap(y) })), onComplete: end }),
      animate(from.y, to.y, { ...cfg, velocity: v.y, onUpdate: (val) => ((y = val), setPeel({ x: snap(x), y: snap(y) })), onComplete: end }),
    ];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || reduced || n < 2) return;
    const { r, w: W, h: H } = size();
    const lx = e.clientX - r.left;
    const ly = e.clientY - r.top;
    const corner = lx > W * 0.5 && ly > H * 0.5;
    const pull = ly < Math.max(18, H * 0.16);
    if (!corner && !pull) return;
    stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    setBox({ w: W, h: H });
    g.current = { pid: e.pointerId, mode: corner ? "corner" : "pull", x0: e.clientX, y0: e.clientY, moved: false, s: [] };
    // the corner lifts a cell the moment it is pressed
    if (corner) setPeel({ x: W - CELL, y: H - CELL });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const { r, w: W, h: H } = size();
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    if (!d.moved && d.mode === "pull") {
      // the last sheet comes back: it starts folded away and unfolds with the hand
      setTop((i) => i - 1);
    }
    d.moved = true;
    d.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 90) d.s.shift();
    if (d.mode === "corner") {
      const x = Math.max(-W, Math.min(W - CELL, e.clientX - r.left));
      const y = Math.max(-H, Math.min(H - CELL, e.clientY - r.top));
      setPeel({ x: snap(x), y: snap(y) });
    } else {
      const k = Math.max(0, Math.min(1, (e.clientY - d.y0) / (H * 0.9)));
      setPeel({ x: snap(-W + (2 * W - CELL) * k), y: snap(-H + (2 * H - CELL) * k) });
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    const { w: W, h: H } = size();
    if (!d.moved) {
      if (d.mode === "corner") setPeel(null);
      return; // a tap: the link opens the post
    }
    suppress.current = true;
    window.setTimeout(() => (suppress.current = false), 0);
    let v = { x: 0, y: 0 };
    if (d.s.length > 1 && e.timeStamp - d.s[d.s.length - 1].t < 60) {
      const a = d.s[0];
      const b = d.s[d.s.length - 1];
      const dt = Math.max(8, b.t - a.t);
      v = { x: ((b.x - a.x) / dt) * 1000, y: ((b.y - a.y) / dt) * 1000 };
    }
    const thrown = Math.hypot(v.x, v.y) > 900;
    const P = peel ?? { x: W, y: H };
    const away = { x: -W, y: -H };
    const flat = { x: W, y: H };
    if (d.mode === "corner") {
      // how far the fold would travel with this release
      const reach = Math.hypot(W - (P.x + project(v.x)), H - (P.y + project(v.y)));
      if (reach > Math.hypot(W, H) * 0.55 || (thrown && v.x < 0 && v.y < 0)) {
        fly(P, away, v, thrown, () => {
          setTop((i) => i + 1);
          setPeel(null);
        });
      } else fly(P, flat, v, false, () => setPeel(null));
    } else {
      const k = (P.y + H) / (2 * H);
      if (k + project(v.y) / (2 * H) > 0.4) fly(P, flat, v, thrown, () => setPeel(null));
      else
        fly(P, away, v, false, () => {
          setTop((i) => i + 1);
          setPeel(null);
        });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPeel(null);
    setTop((i) => i + (e.key === "ArrowRight" ? 1 : -1));
  };

  const fold = peel && box ? foldGeometry(peel, { x: box.w, y: box.h }, box.w, box.h) : null;
  const d0 = describe(post);
  const d1 = describe(next);
  const href = path(`/writing/${encodeURIComponent(post.slug)}`);

  return (
    <div className="app-home-widget app-home-widget--post app-home-kiosk" data-peeling={peel ? "" : undefined}>
      <Glass thickness="regular" refract={false} aria-hidden className="app-home-widget-glass" />
      <div className="app-home-kiosk-frame">
        {/* the older sheets' edges under the top one */}
        <span className="app-home-kiosk-edge" data-k="2" aria-hidden />
        <span className="app-home-kiosk-edge" data-k="1" aria-hidden />
        <div className="app-home-kiosk-sheet app-home-kiosk-under" aria-hidden>
          <Face post={next} {...d1} />
        </div>
        <Link prefetch={false}
          ref={sheetRef}
          href={href}
          transitionTypes={["app-open"]}
          className="app-home-kiosk-sheet app-home-kiosk-top"
          aria-label={label}
          aria-describedby="app-home-kiosk-hint"
          data-no-drag
          style={fold ? { clipPath: fold.done ? "inset(50%)" : fold.flat } : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onClick={(e) => {
            // the end of a peel is not a click
            if (suppress.current) e.preventDefault();
          }}
        >
          <Face post={post} {...d0} />
        </Link>
        {fold && !fold.done && (
          <div className="app-home-kiosk-flap" aria-hidden style={{ transform: fold.matrix, clipPath: fold.flap }}>
            <div className="app-home-kiosk-flap-face">
              <Face post={post} {...d0} />
            </div>
            <span className="app-home-kiosk-flap-shade" style={{ backgroundImage: fold.shade }} />
          </div>
        )}
        {reduced && n > 1 && (
          <span className="app-home-kiosk-pager">
            <button type="button" aria-label={w.prev} onClick={() => setTop((i) => i - 1)}>
              ‹
            </button>
            <button type="button" aria-label={w.next} onClick={() => setTop((i) => i + 1)}>
              ›
            </button>
          </span>
        )}
      </div>
      <span id="app-home-kiosk-hint" className="sr-only">
        {n > 1 ? w.hint : ""}
      </span>
    </div>
  );
}

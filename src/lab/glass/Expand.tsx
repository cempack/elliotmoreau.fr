"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { lenisRef } from "@/lib/lenisRef";
import { project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { CloseIcon } from "./bits";
import { clamp01, lerp } from "./env";

export type Rect = { x: number; y: number; w: number; h: number };

/** The page root, so overlays render inside [data-dir] and inherit its vars. */
export const RootCtx = createContext<HTMLElement | null>(null);

const R_CARD = 32;
const R_PANEL = 38;

export const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/**
 * Where an expanded panel lives: a centered slab, or a sheet resting on the
 * bottom edge on phones. `maxH` lets short content get a shorter panel.
 */
export function panelTarget(maxH = 860): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 720) {
    const top = Math.max(44, Math.round(vh * 0.06));
    const h = Math.min(vh - top, maxH + 40) + 2;
    return { x: 8, y: vh - h + 2, w: vw - 16, h };
  }
  const w = Math.min(860, vw - 64);
  const h = Math.min(vh - 96, maxH);
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

type Sample = { y: number; t: number };
function velocityOf(h: Sample[]) {
  if (h.length < 2) return 0;
  const last = h[h.length - 1];
  let first = h[0];
  for (let i = h.length - 2; i >= 0; i--) {
    first = h[i];
    if (last.t - h[i].t > 80) break;
  }
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/**
 * A widget lifts out of the grid and becomes a panel. The panel is laid
 * out once at its final size; the morph is a clip that grows from the
 * card's rect to the panel's while the box travels with it, so text never
 * stretches. Card face cross-fades out, detail fades up.
 *
 * Pull it down: it tracks the finger 1:1 from where it was grabbed, shrinks
 * a little as it lifts, rubber-bands upward, and on release the projected
 * landing point decides dismiss vs. return. Either way the release
 * velocity is handed to the spring, so there is no seam. Dismiss flies the
 * panel back into the card's current rect along the same path it came.
 */
export function Expand({
  origin,
  from,
  target,
  label,
  closeLabel,
  head,
  face,
  onClosed,
  children,
}: {
  origin: HTMLElement;
  from: Rect;
  target: Rect;
  label: string;
  closeLabel: string;
  head: React.ReactNode;
  face: React.ReactNode;
  onClosed: () => void;
  children: React.ReactNode;
}) {
  const root = useContext(RootCtx);
  const reduced = !!useReducedMotion();
  const { blip } = useSound();
  const T = target;

  const p = useMotionValue(0);
  const dy = useMotionValue(0);
  const cx = useMotionValue(from.x);
  const cy = useMotionValue(from.y);
  const cw = useMotionValue(from.w);
  const ch = useMotionValue(from.h);

  const w = useTransform(() => (reduced ? T.w : lerp(cw.get(), T.w, p.get())));
  const h = useTransform(() => (reduced ? T.h : lerp(ch.get(), T.h, p.get())));
  const x = useTransform(() => (reduced ? 0 : lerp(cx.get(), T.x, p.get()) - T.x));
  const y = useTransform(() => (reduced ? 0 : lerp(cy.get(), T.y, p.get()) - T.y) + dy.get());
  const radius = useTransform(() => lerp(R_CARD, R_PANEL, clamp01(p.get())));
  const clip = useTransform(
    () => `inset(0px ${Math.max(0, T.w - w.get())}px ${Math.max(0, T.h - h.get())}px 0px round ${radius.get()}px)`
  );
  const pull = useTransform(() => clamp01(Math.max(0, dy.get()) / T.h));
  const scale = useTransform(() => 1 - pull.get() * 0.16);
  const scrim = useTransform(() => clamp01(p.get()) * (1 - pull.get() * 0.9));
  const ghost = useTransform(() => (reduced ? 0 : 1 - clamp01(p.get() / 0.32)));
  const body = useTransform(() => (reduced ? 1 : clamp01((p.get() - 0.18) / 0.42)));
  const bodyY = useTransform(() => (reduced ? 0 : (1 - clamp01(p.get())) * 24));
  const panelOpacity = useTransform(() => (reduced ? clamp01(p.get()) : 1));

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    base: number;
    active: boolean;
    hist: Sample[];
  } | null>(null);

  const close = (velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    drag.current = null;
    blip("close");
    // fly back to wherever the card is now
    const r = rectOf(origin);
    cx.set(r.x);
    cy.set(r.y);
    cw.set(r.w);
    ch.set(r.h);
    if (reduced) {
      animate(p, 0, { duration: 0.18, ease: "easeOut" }).then(onClosed);
      return;
    }
    animate(dy, 0, { ...spring.default, velocity });
    animate(p, 0, { type: "spring", visualDuration: 0.44, bounce: 0 }).then(onClosed);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useLayoutEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    p.set(0);
    if (reduced) animate(p, 1, { duration: 0.2, ease: "easeOut" });
    else animate(p, 1, { type: "spring", visualDuration: 0.5, bounce: 0 });
    blip("open");
    panelRef.current?.focus({ preventScroll: true });
    lenisRef.current?.stop();
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab" && panelRef.current) {
        // keep focus inside the panel
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      lenisRef.current?.start();
      html.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [blip, p, reduced]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (closing.current || e.button > 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("a,button,input,textarea,select,label,[data-no-drag]")) return;
    const sc = scrollRef.current;
    if (sc && sc.contains(t) && sc.scrollTop > 1) return;
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      base: dy.get(),
      active: false,
      hist: [{ y: e.clientY, t: e.timeStamp }],
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      const ddx = e.clientX - d.x0;
      const ddy = e.clientY - d.y0;
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return;
      const sc = scrollRef.current;
      const canScroll = !!sc && sc.scrollHeight > sc.clientHeight + 2 && sc.contains(e.target as Node);
      // sideways, or an upward swipe over scrollable text, is not ours
      if (Math.abs(ddx) > Math.abs(ddy) || (ddy < 0 && canScroll)) {
        drag.current = null;
        return;
      }
      d.active = true;
      d.y0 = e.clientY;
      d.base = dy.get();
      dy.stop();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.dragging = "";
      window.getSelection()?.removeAllRanges();
    }
    const raw = d.base + (e.clientY - d.y0);
    dy.set(raw >= 0 ? raw : -rubberband(-raw, T.h * 0.5));
    d.hist.push({ y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 14) d.hist.shift();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    delete e.currentTarget.dataset.dragging;
    const v = velocityOf(d.hist);
    const landing = dy.get() + project(v);
    if (landing > Math.min(240, T.h * 0.28)) close(v);
    else animate(dy, 0, { ...(Math.abs(v) > 300 ? spring.flick : spring.default), velocity: v });
  };

  if (!root) return null;

  const pivot = `${T.w / 2}px ${Math.round(T.h * 0.3)}px`;

  return createPortal(
    <div className="g-xp" role="presentation">
      <m.div className="g-xp-scrim" style={{ opacity: scrim }} onClick={() => close()} />
      <m.div
        className="g-xp-shadow"
        aria-hidden
        style={{
          left: T.x,
          top: T.y,
          width: w,
          height: h,
          x,
          y,
          scale,
          borderRadius: radius,
          transformOrigin: pivot,
          opacity: panelOpacity,
        }}
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="g-xp-panel"
        style={{
          left: T.x,
          top: T.y,
          width: T.w,
          height: T.h,
          x,
          y,
          scale,
          clipPath: clip,
          transformOrigin: pivot,
          opacity: panelOpacity,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <m.div className="g-xp-rim" aria-hidden style={{ width: w, height: h, borderRadius: radius }} />
        <m.div className="g-xp-body" style={{ opacity: body, y: bodyY }}>
          <div className="g-xp-head">
            <span className="g-xp-grabber" aria-hidden />
            <div className="g-xp-title">{head}</div>
            <button type="button" className="g-xp-close" onClick={() => close()} aria-label={closeLabel}>
              <CloseIcon />
            </button>
          </div>
          <div
            ref={scrollRef}
            className="g-xp-scroll"
            data-lenis-prevent
            data-at-top="1"
            onScroll={(e) => {
              e.currentTarget.dataset.atTop = e.currentTarget.scrollTop <= 1 ? "1" : "0";
            }}
          >
            {children}
          </div>
        </m.div>
        {!reduced && (
          <m.div className="g-xp-ghost" aria-hidden style={{ width: cw, height: ch, opacity: ghost }}>
            {face}
          </m.div>
        )}
      </m.div>
    </div>,
    root
  );
}

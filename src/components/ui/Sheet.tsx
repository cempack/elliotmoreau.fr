"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { animate, m, useMotionValue, useTransform } from "motion/react";
import { lenisRef } from "@/lib/lenisRef";
import { project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";

type Sample = { y: number; t: number };

const DismissCtx = createContext<() => void>(() => {});
/** Inside a Sheet: animate it out along its exit path, then onClose fires. */
export const useSheetDismiss = () => useContext(DismissCtx);

function velocityOf(history: Sample[]) {
  if (history.length < 2) return 0;
  const last = history[history.length - 1];
  // look back ~80ms for a stable estimate
  let first = history[0];
  for (let i = history.length - 2; i >= 0; i--) {
    first = history[i];
    if (last.t - history[i].t > 80) break;
  }
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/**
 * Bottom sheet you can fling away. Tracks the finger 1:1 from where it was
 * grabbed, rubber-bands past the top, projects the release velocity to
 * decide dismiss vs. return, and hands that velocity to the spring so
 * there's no seam between drag and animation. Enters and exits along the
 * same path (from/to the bottom). Portaled to <body>: no transformed
 * ancestor can capture its fixed positioning.
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!mounted) return null;
  if (!open) return null;
  // every close path animates out first (dismiss), then calls onClose
  return createPortal(
    <SheetBody onClose={onClose} label={label} className={className}>
      {children}
    </SheetBody>,
    document.body
  );
}

function SheetBody({
  onClose,
  label,
  children,
  className,
}: {
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(typeof window === "undefined" ? 1200 : window.innerHeight);
  const height = useRef(600);
  const drag = useRef<{ startY: number; base: number; history: Sample[]; id: number } | null>(null);
  const closing = useRef(false);
  const scrim = useTransform(y, (v) => Math.max(0, 1 - v / Math.max(1, height.current)));
  const { blip } = useSound();

  useLayoutEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    height.current = panelRef.current?.offsetHeight ?? 600;
    // enter from the bottom — the same path it will leave by
    y.set(height.current + 40);
    animate(y, 0, spring.default);
    panelRef.current?.focus({ preventScroll: true });
    lenisRef.current?.stop();
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    // the dock and the tab bar step aside under a sheet (dock.css); a count, for stacked sheets
    root.dataset.sheet = String(Number(root.dataset.sheet || 0) + 1);
    blip("open");
    return () => {
      const n = Number(root.dataset.sheet || 1) - 1;
      if (n > 0) root.dataset.sheet = String(n);
      else delete root.dataset.sheet;
      lenisRef.current?.start();
      root.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [blip, y]);

  const dismiss = (velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    blip("close");
    animate(y, height.current + 40, { ...spring.default, velocity }).then(onClose);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // only start a drag from the grabber/header, or anywhere when content is at the top
    const target = e.target as HTMLElement;
    const scroller = target.closest("[data-sheet-scroll]") as HTMLElement | null;
    if (scroller && scroller.scrollTop > 0) return;
    if (target.closest("a,button,input,textarea,select")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    y.stop();
    drag.current = { startY: e.clientY, base: y.get(), history: [{ y: e.clientY, t: e.timeStamp }], id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = d.base + (e.clientY - d.startY);
    y.set(raw >= 0 ? raw : -rubberband(-raw, height.current));
    d.history.push({ y: e.clientY, t: e.timeStamp });
    if (d.history.length > 12) d.history.shift();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const v = velocityOf(d.history);
    const projected = y.get() + project(v);
    if (projected > height.current * 0.45) dismiss(v);
    else animate(y, 0, { ...(Math.abs(v) > 300 ? spring.flick : spring.default), velocity: v });
  };

  return (
    <div className="em-sheet-root" role="presentation">
      <m.div className="em-sheet-scrim" style={{ opacity: scrim }} onClick={() => dismiss()} />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`em-sheet ${className}`}
        style={{ y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="em-sheet-grabber" aria-hidden />
        <div className="em-sheet-content" data-sheet-scroll data-lenis-prevent>
          <DismissCtx.Provider value={dismiss}>{children}</DismissCtx.Provider>
        </div>
      </m.div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * How you learn the alert moves (with a mouse): rest the pointer on the
 * sheet (not on a control) for a moment and a small pill appears beside
 * it, "Drag me", following the pointer, never covering what it names.
 * Moving onto a control, leaving, or grabbing hides it; once you've
 * grabbed the alert it never shows again this session. Touch gets the
 * one-time nudge instead (NotFoundApp).
 */

const DWELL = 600;
/** beside the pointer, clear of the glass cursor's ring */
const OFFSET_X = 18;
const OFFSET_Y = 22;
const LEARNED = "em-nf-dragged";
/** same as useTether: the controls aren't the sheet */
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[data-no-drag]';

export function DragHint({ surfaceRef, label }: { surfaceRef: React.RefObject<HTMLElement | null>; label: string }) {
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    const pill = pillRef.current;
    if (!surface || !pill) return;
    let learned = false;
    try {
      learned = sessionStorage.getItem(LEARNED) != null;
    } catch {}
    let timer = 0;
    const hide = () => {
      window.clearTimeout(timer);
      timer = 0;
      delete pill.dataset.show;
    };
    const place = (e: PointerEvent) => {
      const r = surface.getBoundingClientRect();
      pill.style.transform = `translate(${Math.round(e.clientX - r.left + OFFSET_X)}px, ${Math.round(e.clientY - r.top + OFFSET_Y)}px)`;
    };
    const onMove = (e: PointerEvent) => {
      if (learned || e.pointerType !== "mouse") return;
      const onSheet =
        !(e.target as Element).closest?.(INTERACTIVE) &&
        !surface.hasAttribute("data-held") &&
        e.buttons === 0;
      if (!onSheet) return hide();
      place(e);
      if (!pill.hasAttribute("data-show") && !timer) {
        timer = window.setTimeout(() => {
          timer = 0;
          pill.dataset.show = "";
        }, DWELL);
      }
    };
    const onDown = (e: PointerEvent) => {
      hide();
      if (learned || (e.target as Element).closest?.(INTERACTIVE)) return;
      // a grab: they've found it
      learned = true;
      try {
        sessionStorage.setItem(LEARNED, "1");
      } catch {}
    };
    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerleave", hide);
    surface.addEventListener("pointerdown", onDown);
    return () => {
      hide();
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerleave", hide);
      surface.removeEventListener("pointerdown", onDown);
    };
  }, [surfaceRef]);

  return (
    <span ref={pillRef} className="app-nf-hint" aria-hidden>
      <svg className="app-nf-hint-grip" width="7" height="11" viewBox="0 0 7 11" shapeRendering="crispEdges">
        <path d="M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h3v3H4zM0 8h3v3H0zM4 8h3v3H4z" fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}

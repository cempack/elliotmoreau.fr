"use client";

import { useRef } from "react";
import type { MotionValue } from "motion/react";

type Sample = { t: number; p: number };

/**
 * One-axis flick gesture on pointer capture. Tracks 1:1 from the grab
 * offset (so grabbing a card mid-flight catches it where it is), shapes
 * the raw offset through `resist` (rubber-banding), and reports the
 * release velocity (px/s, from the last ~100ms of samples) so the caller
 * can project the throw and hand the velocity to a spring. A 4px slop
 * keeps taps and clicks on inner controls intact; pointercancel (the
 * browser took over to scroll) releases with zero velocity.
 */
export function useFlick({
  axis,
  value,
  resist = (raw) => raw,
  onStart,
  onRelease,
}: {
  axis: "x" | "y";
  value: MotionValue<number>;
  resist?: (raw: number) => number;
  onStart?: () => void;
  onRelease: (velocity: number, position: number) => void;
}) {
  const st = useRef<{ id: number; origin: number; start: number; live: boolean; samples: Sample[] } | null>(null);
  const read = (e: React.PointerEvent) => (axis === "x" ? e.clientX : e.clientY);

  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (!s.live) return;
    // velocity over the ~100ms leading up to the last move (robust to a
    // busy main thread delivering sparse events); zero if the pointer
    // came to rest before letting go
    const last = s.samples[s.samples.length - 1];
    const recent = s.samples.filter((x) => last.t - x.t <= 100);
    const a = recent.length > 1 ? recent[0] : s.samples[s.samples.length - 2];
    const rested = e.timeStamp - last.t > 160;
    const v = !cancelled && !rested && a && last.t > a.t ? ((last.p - a.p) / (last.t - a.t)) * 1000 : 0;
    onRelease(v, value.get());
  };

  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as Element).closest?.("button,a,input")) return;
      const p = read(e);
      // capture now: the first move may already be outside the element
      e.currentTarget.setPointerCapture(e.pointerId);
      st.current = { id: e.pointerId, origin: p - value.get(), start: p, live: false, samples: [{ t: e.timeStamp, p }] };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const s = st.current;
      if (!s || s.id !== e.pointerId) return;
      const p = read(e);
      if (!s.live) {
        if (Math.abs(p - s.start) < 4) return;
        s.live = true;
        value.stop();
        onStart?.();
      }
      value.set(resist(p - s.origin));
      s.samples.push({ t: e.timeStamp, p });
      if (s.samples.length > 8) s.samples.shift();
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      end(e, false);
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      end(e, true);
    },
  };
}

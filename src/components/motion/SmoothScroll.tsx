"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { cancelFrame, frame } from "motion/react";
import { lenisRef } from "@/lib/lenisRef";
import "lenis/dist/lenis.css";

/**
 * Inertial wheel scrolling, tuned tight (lerp 0.1) so it tracks the input
 * instead of trailing it. Ticked inside Motion's frame loop, so scroll,
 * springs and scroll-linked values share one frame. Off entirely under
 * reduced motion and on touch screens (native scrolling is already
 * inertial there, and the loop would cost a frame callback forever).
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)").matches) return;
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false,
      anchors: true,
      allowNestedScroll: true,
      prevent: (node) => !!node.closest?.("dialog,[popover],[data-lenis-prevent]"),
    });
    lenisRef.current = lenis;
    const tick = ({ timestamp }: { timestamp: number }) => lenis.raf(timestamp);
    frame.update(tick, true);
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_EXPOSE_LENIS === "1") {
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    }
    return () => {
      cancelFrame(tick);
      lenisRef.current = null;
      lenis.destroy();
    };
  }, []);
  return null;
}

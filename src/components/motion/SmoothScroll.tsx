"use client";

import { useEffect } from "react";
import type Lenis from "lenis";
import { cancelFrame, frame } from "motion/react";
import { lenisRef } from "@/lib/lenisRef";
import "lenis/dist/lenis.css";

/**
 * Inertial wheel scrolling, tuned tight (lerp 0.1) so it tracks the input
 * instead of trailing it. Ticked inside Motion's frame loop, so scroll,
 * springs and scroll-linked values share one frame, but only while it
 * has somewhere to go: a wheel turn or a programmatic scroll starts the
 * tick, and it stops once Lenis settles, so an idle page asks for no
 * frames at all. Off entirely under reduced motion and on touch screens
 * (native scrolling is already inertial there), and the library itself
 * is only fetched where it runs.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)").matches) return;
    let lenis: Lenis | null = null;
    let tick: ((d: { timestamp: number }) => void) | null = null;
    let dead = false;
    import("lenis").then(({ default: L }) => {
      if (dead) return;
      const l = new L({
        lerp: 0.1,
        smoothWheel: true,
        syncTouch: false,
        autoRaf: false,
        anchors: true,
        allowNestedScroll: true,
        prevent: (node) => !!node.closest?.("dialog,[popover],[data-lenis-prevent]"),
      });
      lenis = l;
      lenisRef.current = l;
      let on = false;
      const t = ({ timestamp }: { timestamp: number }) => {
        l.raf(timestamp);
        if (!l.isScrolling) {
          on = false;
          cancelFrame(t);
        }
      };
      tick = t;
      const kick = () => {
        if (on) return;
        on = true;
        frame.update(t, true);
      };
      l.on("virtual-scroll", kick);
      // programmatic scrolls (anchors, scrollToY) need the tick too
      const scrollTo = l.scrollTo.bind(l);
      l.scrollTo = ((...a: Parameters<typeof scrollTo>) => {
        kick();
        return scrollTo(...a);
      }) as typeof l.scrollTo;
      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_EXPOSE_LENIS === "1") {
        (window as unknown as { __lenis?: Lenis }).__lenis = l;
      }
    });
    return () => {
      dead = true;
      if (tick) cancelFrame(tick);
      lenisRef.current = null;
      lenis?.destroy();
    };
  }, []);
  return null;
}

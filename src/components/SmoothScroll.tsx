"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { lenisRef } from "@/lib/lenisRef";

/** Buttery inertial scrolling site-wide; off under reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.45, smoothWheel: true, autoRaf: true, anchors: true });
    lenisRef.current = lenis;
    return () => {
      lenisRef.current = null;
      lenis.destroy();
    };
  }, []);
  return null;
}

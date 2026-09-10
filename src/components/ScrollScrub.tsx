"use client";

import { useEffect } from "react";

const CHAPTERS = ["blog", "travel", "more"] as const;

/**
 * Reversible scroll-linked motion, the award-site kind: `[data-parallax]`
 * blocks drift at their own speed while scrubbed, and the chapter rail
 * fills track real section progress instead of flipping on/off.
 *
 * One rAF-coalesced loop, transform/height only, offscreen nodes skipped.
 * Never attach data-parallax to a Reveal node — its CSS entrance owns
 * `transform` there. Off under reduced motion (rail falls back to spy).
 */
export function ScrollScrub() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const els = document.querySelectorAll<HTMLElement>("[data-parallax]");
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh * 0.25 || r.top > vh * 1.25) continue;
        const speed = Number.parseFloat(el.dataset.parallax || "0.04") || 0;
        const progress = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.transform = `translate3d(0, ${(-progress * speed * vh).toFixed(1)}px, 0)`;
      }
      for (const id of CHAPTERS) {
        const s = document.getElementById(id);
        const f = document.getElementById(`rail-fill-${id}`);
        if (!s || !f) continue;
        const r = s.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue;
        const p = Math.min(1, Math.max(0, (vh * 0.65 - r.top) / (r.height + vh * 0.2)));
        f.style.height = `${(p * 100).toFixed(1)}%`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}

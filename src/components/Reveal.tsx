"use client";

import { useEffect, useRef } from "react";

export type RevealPreset = "rise" | "lift" | "focus";

/**
 * Slow, expensive-feeling entrances, once each. `rise` floats content up
 * on a long expo ease; `lift` adds a barely-there settle for cards;
 * `focus` drifts headers in from a soft blur. `delay` staggers cascades.
 * Instantly visible under reduced motion.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 26,
  preset = "rise",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  preset?: RevealPreset;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -4% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-preset={preset === "rise" ? undefined : preset}
      style={{ "--reveal-y": `${y}px`, "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

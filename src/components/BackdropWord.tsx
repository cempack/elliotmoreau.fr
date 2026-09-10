"use client";

import { useEffect, useRef } from "react";
import { PixelLabel } from "./PixelLabel";

/**
 * Giant pixel backdrop word drifting behind a section at its own pace —
 * the deep-site move: scenery that sinks slower than you scroll. Pure
 * translate3d scrub on rAF, static without motion.
 */
export function BackdropWord({
  text,
  cell = 14,
  drift = 90,
  top = 0,
  className = "",
}: {
  text: string;
  cell?: number;
  drift?: number;
  /** px below the section top: keeps the numeral off the header text */
  top?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      const host = el?.parentElement;
      if (!el || !host) return;
      const r = host.getBoundingClientRect();
      const progress = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      el.style.setProperty("transform", `translate3d(0, ${(progress * drift).toFixed(1)}px, 0)`);
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
  }, [drift]);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        ref={ref}
        className="absolute left-0"
        style={{ top, color: "rgba(167,192,128,0.15)" }}
      >
        <PixelLabel text={text} cell={cell} />
      </div>
    </div>
  );
}

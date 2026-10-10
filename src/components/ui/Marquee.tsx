"use client";

import { useEffect, useRef, useState } from "react";
import {
  m,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";

/**
 * Endless band of items. Drifts at `speed` px/s, leans into scroll velocity
 * (and flips with scroll direction), eases to a stop on hover/focus,
 * sleeps off-screen. Static list under reduced motion.
 */
export function Marquee({
  children,
  speed = 40,
  className = "",
  reactToScroll = true,
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
  reactToScroll?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const [copyW, setCopyW] = useState(0);
  const reduced = useReducedMotion();
  const inView = useInView(rootRef, { margin: "100px" });
  const x = useMotionValue(0);
  const hover = useRef(false);
  const rate = useSpring(1, { stiffness: 120, damping: 24 });
  const dir = useRef(1);

  const { scrollY } = useScroll();
  const vel = useVelocity(scrollY);
  const smoothVel = useSpring(vel, { stiffness: 300, damping: 50 });
  const boost = useTransform(smoothVel, [-2400, 0, 2400], [-4, 0, 4], { clamp: true });

  useEffect(() => {
    const el = copyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCopyW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useAnimationFrame((_, delta) => {
    if (reduced || !inView || copyW === 0) return;
    rate.set(hover.current ? 0 : 1);
    const b = reactToScroll ? boost.get() : 0;
    if (b < -0.05) dir.current = -1;
    else if (b > 0.05) dir.current = 1;
    const move = dir.current * speed * (delta / 1000) * (rate.get() + Math.abs(b));
    let next = x.get() - move;
    if (next <= -copyW) next += copyW;
    if (next > 0) next -= copyW;
    x.set(next);
  });

  return (
    <div
      ref={rootRef}
      className={`em-marquee ${className}`}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
      onFocus={() => (hover.current = true)}
      onBlur={() => (hover.current = false)}
    >
      <m.div className="em-marquee-track" style={{ x: reduced ? 0 : x }}>
        <div ref={copyRef} className="em-marquee-copy">
          {children}
        </div>
        {!reduced && (
          <div className="em-marquee-copy" aria-hidden inert>
            {children}
          </div>
        )}
      </m.div>
    </div>
  );
}

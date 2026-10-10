"use client";

import { useRef } from "react";
import { m, useSpring } from "motion/react";

// critically damped, ~0.35s response
const SPRING = { stiffness: 320, damping: 36, mass: 1 };

/**
 * Leans its child toward a fine pointer, then settles home on leave.
 * Owns the transform of this wrapper only — the child keeps its own.
 */
export function Magnetic({
  children,
  strength = 0.3,
  max = 10,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * strength;
    const dy = (e.clientY - (r.top + r.height / 2)) * strength;
    x.set(Math.max(-max, Math.min(max, dx)));
    y.set(Math.max(-max, Math.min(max, dy)));
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <m.span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ x, y }}
      className={`inline-block ${className}`}
      data-magnetic
    >
      {children}
    </m.span>
  );
}

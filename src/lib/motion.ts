import type { Transition } from "motion/react";

/**
 * A spring from Apple-style designer params (response ≈ visualDuration in
 * seconds, bounce 0 = critically damped), expressed as physics
 * (stiffness/damping/mass) with Motion's own conversion. Physics-defined
 * springs honour a `velocity` handoff; time-defined ones (visualDuration /
 * duration + bounce) silently drop it in motion 12 ("time-defined springs
 * ignore inherited velocity") — which would put a seam between every
 * gesture and the animation that follows it. Always build springs here.
 */
export function springFrom(visualDuration: number, bounce = 0) {
  const root = (2 * Math.PI) / (visualDuration * 1.2);
  const stiffness = root * root;
  const damping = 2 * Math.min(1, Math.max(0.05, 1 - bounce)) * Math.sqrt(stiffness);
  return { type: "spring" as const, stiffness, damping, mass: 1 };
}

/**
 * House springs, after Apple's damping + response model. Critically damped
 * by default (bounce 0): graceful, never distracting. Bounce is reserved for
 * motion that a gesture actually threw (`flick`). Spread one and add
 * `velocity` (px/s) to hand off a gesture: `{ ...spring.flick, velocity }`.
 */
export const spring = {
  default: springFrom(0.35),
  snappy: springFrom(0.22),
  gentle: springFrom(0.5),
  flick: springFrom(0.4, 0.18),
} satisfies Record<string, Transition>;

/** Press feedback: lands on pointer-down, springs back on release. */
export const press = { scale: 0.97 } as const;

/**
 * Where a flicked element comes to rest, scroll-deceleration style
 * (Apple's projection from "Designing Fluid Interfaces").
 * @param velocity px/s at release
 * @param decelerationRate 0.998 ≈ normal scroll feel, 0.99 snappier
 */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: real things slow before they stop. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Nearest of a set of snap points to a projected endpoint. */
export function nearest(value: number, points: number[]) {
  return points.reduce((best, p) => (Math.abs(p - value) < Math.abs(best - value) ? p : best), points[0]);
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

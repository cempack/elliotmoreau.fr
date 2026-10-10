import type { Transition } from "motion/react";

/**
 * House springs, after Apple's damping + response model. Critically damped
 * by default (bounce 0): graceful, never distracting. Bounce is reserved for
 * motion that a gesture actually threw (`flick`).
 */
export const spring = {
  default: { type: "spring", visualDuration: 0.35, bounce: 0 },
  snappy: { type: "spring", visualDuration: 0.22, bounce: 0 },
  gentle: { type: "spring", visualDuration: 0.5, bounce: 0 },
  flick: { type: "spring", visualDuration: 0.4, bounce: 0.18 },
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

"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import { spring } from "@/lib/motion";

// full feature set (drag, layout, exit) arrives after first paint
const loadFeatures = () => import("@/lib/motion-features").then((m) => m.default);

/**
 * Motion for the whole tree: lazy-loaded features (use `m.*`, not
 * `motion.*`), critically damped default spring, and the user's
 * reduced-motion preference honored everywhere.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={spring.default}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { spring } from "@/lib/motion";

/**
 * Motion for the whole tree: `m.*` components with the full feature set
 * (drag, layout, exit) loaded synchronously — async features re-seed
 * style-bound motion values when they land, which snaps live gestures
 * back. Critically damped default spring; the user's reduced-motion
 * preference honored everywhere.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user" transition={spring.default}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

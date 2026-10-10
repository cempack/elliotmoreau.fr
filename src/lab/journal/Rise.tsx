"use client";

import { m } from "motion/react";
import { spring } from "@/lib/motion";

const VIEW = { once: true, margin: "0px 0px -12% 0px" } as const;

/**
 * Settles a block into place the first time it scrolls into view: a short
 * rise on a critically damped spring. Under reduced motion MotionConfig
 * drops the travel and keeps only the fade.
 */
export function Rise({
  children,
  className,
  delay = 0,
  y = 28,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEW}
      transition={{ ...spring.gentle, delay }}
    >
      {children}
    </m.div>
  );
}

/** The same, for list items (index rows, table rows), staggered by index. */
export function RiseItem({ children, i = 0 }: { children: React.ReactNode; i?: number }) {
  return (
    <m.li
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEW}
      transition={{ ...spring.gentle, delay: Math.min(i, 6) * 0.06 }}
    >
      {children}
    </m.li>
  );
}

"use client";

import Link from "next/link";
import { m } from "motion/react";
import { press, spring } from "@/lib/motion";

const MLink = m.create(Link);

/**
 * Press feedback that lands on pointer-down (not on release) and springs
 * back when let go. One transform owner: don't add hover translate here.
 */
export function PressLink(props: React.ComponentProps<typeof MLink>) {
  return <MLink whileTap={press} transition={spring.snappy} {...props} />;
}

export function PressButton(props: React.ComponentProps<typeof m.button>) {
  return <m.button type="button" whileTap={press} transition={spring.snappy} {...props} />;
}

export function PressAnchor(props: React.ComponentProps<typeof m.a>) {
  return <m.a whileTap={press} transition={spring.snappy} {...props} />;
}

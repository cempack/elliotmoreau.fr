"use client";

import { Fragment, useRef } from "react";
import { m, useInView, useScroll, useTransform, type MotionValue } from "motion/react";

type Tag = "h1" | "h2" | "h3" | "p" | "span" | "div";

/**
 * Display type that assembles piece by piece. Each word is a no-wrap mask,
 * each piece rises out of it. `inView` plays once on a critically damped
 * spring; `scrub` ties every piece to scroll progress so it reverses
 * as you scroll back. Screen readers get the plain sentence; the split
 * copy is aria-hidden. Never use on running body text.
 */
export function SplitText({
  text,
  as: As = "span",
  by = "char",
  mode = "inView",
  stagger = 0.022,
  delay = 0,
  className = "",
  pieceClassName = "",
}: {
  text: string;
  as?: Tag;
  by?: "char" | "word";
  mode?: "inView" | "scrub";
  stagger?: number;
  delay?: number;
  className?: string;
  pieceClassName?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 95%", "start 35%"] });

  const words = text.split(" ");
  const total = by === "char" ? text.replace(/ /g, "").length : words.length;
  let index = 0;

  return (
    <As ref={ref as never} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="em-split">
        {words.map((word, wi) => (
          // the space lives between word masks: inside an inline-block it collapses
          <Fragment key={wi}>
          {wi > 0 && " "}
          <span className="em-split-word">
            {(by === "char" ? Array.from(word) : [word]).map((piece) => {
              const i = index++;
              return mode === "scrub" ? (
                <ScrubPiece key={i} i={i} total={total} progress={scrollYProgress} className={pieceClassName}>
                  {piece}
                </ScrubPiece>
              ) : (
                <m.span
                  key={i}
                  className={`em-split-piece ${pieceClassName}`}
                  initial={{ y: "125%" }}
                  animate={inView ? { y: "0%" } : { y: "125%" }}
                  transition={{ type: "spring", visualDuration: 0.7, bounce: 0, delay: delay + i * stagger }}
                >
                  {piece}
                </m.span>
              );
            })}
          </span>
          </Fragment>
        ))}
      </span>
    </As>
  );
}

function ScrubPiece({
  i,
  total,
  progress,
  className,
  children,
}: {
  i: number;
  total: number;
  progress: MotionValue<number>;
  className: string;
  children: React.ReactNode;
}) {
  const start = (i / Math.max(1, total)) * 0.6;
  const y = useTransform(progress, [start, start + 0.4], ["125%", "0%"]);
  const opacity = useTransform(progress, [start, start + 0.25], [0, 1]);
  return (
    <m.span className={`em-split-piece ${className}`} style={{ y, opacity }}>
      {children}
    </m.span>
  );
}

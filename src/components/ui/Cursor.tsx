"use client";

import { useEffect, useRef, useState } from "react";
import { m, useMotionValue, useSpring } from "motion/react";

type Variant = "ring" | "glass" | "block";

const RING_SPRING = { stiffness: 520, damping: 46, mass: 0.6 };

/**
 * Contextual cursor for fine pointers only. The dot tracks the pointer 1:1
 * (no lag on the thing you aim with); the ring follows on a critically
 * damped spring and morphs into a label over `[data-cursor="Label"]`.
 * Native cursor stays on touch, under reduced motion and forced colors.
 */
export function Cursor({ variant = "ring" }: { variant?: Variant }) {
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [down, setDown] = useState(false);
  const [hidden, setHidden] = useState(true);
  const dotRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, RING_SPRING);
  const ry = useSpring(y, RING_SPRING);

  useEffect(() => {
    const mq = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)"
    );
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("has-cursor");
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") {
        setHidden(true);
        return;
      }
      x.set(e.clientX);
      y.set(e.clientY);
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
      setHidden(false);
    };
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element | null;
      const labelled = t?.closest?.("[data-cursor]") as HTMLElement | null;
      setLabel(labelled?.dataset.cursor || null);
      setHovering(!!t?.closest?.("a,button,[role=button],[data-cursor],input,textarea,select,label"));
    };
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);
    const onLeave = () => setHidden(true);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      root.classList.remove("has-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  const size = label ? 84 : hovering ? 44 : 30;
  const scale = down ? 0.82 : 1;

  return (
    <div aria-hidden className={`em-cursor em-cursor--${variant}`} data-hidden={hidden || undefined}>
      <m.div
        className="em-cursor-ring"
        style={{ x: rx, y: ry }}
        animate={{ width: size, height: size, scale }}
        transition={{ type: "spring", visualDuration: 0.25, bounce: 0 }}
      >
        {label && <span className="em-cursor-label">{label}</span>}
      </m.div>
      <div ref={dotRef} className="em-cursor-dot" data-active={hovering || undefined} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { m, useMotionValue, useSpring } from "motion/react";
import { springFrom } from "@/lib/motion";

type Variant = "ring" | "glass" | "block";

const RING_SPRING = { stiffness: 520, damping: 46, mass: 0.6 };
const CURSOR_MORPH = springFrom(0.25);

/**
 * Contextual cursor for fine pointers only. The dot tracks the pointer 1:1
 * (no lag on the thing you aim with); the ring follows on a critically
 * damped spring and morphs into a label over `[data-cursor="Label"]`.
 * Native cursor stays on touch, under reduced motion and forced colors.
 * Over an unlabelled control the ring stops frosting what's under it (a
 * hairline, iPadOS-style: the control's own hover state carries it), so
 * it never blurs the label you're about to click. Elements under
 * `[data-cursor-hide]` (the OS chrome, which has its own hover pills) get
 * the dot only.
 */
export function Cursor({ variant = "ring" }: { variant?: Variant }) {
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
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
      // surfaces with their own pointer feedback (the magnifying dock) opt out
      setSuppressed(!!t?.closest?.("[data-cursor-hide]"));
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
    <div
      aria-hidden
      className={`em-cursor em-cursor--${variant}`}
      data-hidden={hidden || undefined}
      data-suppressed={suppressed || undefined}
    >
      <m.div
        className="em-cursor-ring"
        data-hover={hovering || undefined}
        style={{ x: rx, y: ry }}
        animate={{ width: size, height: size, scale }}
        transition={CURSOR_MORPH}
      >
        {label && <span className="em-cursor-label">{label}</span>}
      </m.div>
      <div ref={dotRef} className="em-cursor-dot" data-active={(hovering && !suppressed) || undefined} />
    </div>
  );
}

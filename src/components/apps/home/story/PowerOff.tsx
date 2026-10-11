"use client";

import { useEffect, useRef, useState } from "react";
import { m, type Transition, type Variants } from "motion/react";
import { useI18n } from "@/i18n/client";
import { restartOS } from "@/components/os/menubar/util";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { useFinePointer, useReduced } from "@/hooks/env";
import { lenisRef } from "@/lib/lenisRef";
import { useSound } from "@/lib/sound";

type Phase = "idle" | "off" | "wake" | "boot";

/**
 * Restart emOS into its boot, landing on the Desktop like a real reboot:
 * the reload skips the browser's scroll restoration for this entry.
 */
export function reboot() {
  try {
    history.scrollRestoration = "manual";
  } catch {
    // not supported: the boot still plays, just wherever the page was
  }
  restartOS();
}

/** ease-in for the collapse (a tube losing its deflection), quint out for the return */
const IN: Transition["ease"] = [0.7, 0, 0.84, 0];
const OUT: Transition["ease"] = [0.22, 1, 0.36, 1];

const shutter: Variants = {
  idle: { scaleY: 0 },
  off: { scaleY: 1, transition: { duration: 0.36, ease: IN } },
  wake: { scaleY: 0, transition: { duration: 0.42, ease: OUT, delay: 0.5 } },
  boot: { scaleY: 1 },
};

/**
 * The beam: the picture folds into a bright line, the line into a dot,
 * the dot fades like phosphor. Waking plays the same path backwards.
 */
const beam: Variants = {
  idle: { opacity: 0, scaleX: 1, scaleY: 1 },
  off: {
    opacity: [0, 1, 1, 1, 0],
    scaleX: [1, 1, 1, 0.004, 0.004],
    scaleY: [1, 1, 1, 2.5, 0],
    transition: { duration: 1, times: [0, 0.3, 0.4, 0.72, 1], ease: "easeIn" },
  },
  wake: {
    opacity: [0, 1, 1, 1, 0],
    scaleX: [0.004, 0.004, 1, 1, 1],
    scaleY: [0, 2.5, 1, 1, 1],
    transition: { duration: 0.8, times: [0, 0.2, 0.56, 0.7, 1], ease: "easeOut", delay: 0.12 },
  },
  boot: {
    opacity: [0, 1, 1],
    scaleX: [0.004, 0.004, 1],
    scaleY: [0, 2.5, 1],
    transition: { duration: 0.45, times: [0, 0.3, 1], ease: "easeOut" },
  },
};

const flash: Variants = {
  idle: { opacity: 0 },
  off: { opacity: [0, 0.16, 0], transition: { duration: 0.42, times: [0, 0.7, 1] } },
  wake: { opacity: 0 },
  boot: { opacity: 0 },
};

const screen: Variants = {
  idle: { opacity: 0 },
  off: { opacity: 1, transition: { duration: 0.7, delay: 1.25 } },
  wake: { opacity: 0, transition: { duration: 0.15 } },
  boot: { opacity: 0, transition: { duration: 0.15 } },
};

/* reduced motion: a plain cross-fade to the dark screen and back */
const fade: Variants = {
  idle: { opacity: 0 },
  off: { opacity: 1, transition: { duration: 0.2 } },
  wake: { opacity: 0, transition: { duration: 0.2, delay: 0.1 } },
  boot: { opacity: 1 },
};
const fadeScreen: Variants = {
  idle: { opacity: 0 },
  off: { opacity: 1, transition: { duration: 0.2, delay: 0.2 } },
  wake: { opacity: 0, transition: { duration: 0.1 } },
  boot: { opacity: 0, transition: { duration: 0.1 } },
};

/**
 * "Shut down": emOS powers off like a CRT. Two shutters fold the picture
 * into a glowing line, the line into a dot, and the dot fades. What's left
 * is a dark screen that says it's safe to close the tab, with a power
 * button that boots emOS again (the real boot sequence). Esc wakes the
 * screen instead, back where you were, along the same path reversed.
 *
 * A modal <dialog> in the top layer: above the menu bar, the Dock and the
 * mini player, page inert, focus on the power button, native cursor
 * (globals hand it back while a dialog is open). Lenis rests meanwhile.
 * Mount it to shut down; it calls `onDone` once the screen is awake.
 */
export function PowerOff({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const s = t.story.finale.off;
  const reduced = useReduced();
  const fine = useFinePointer();
  const { blip } = useSound();
  const ref = useRef<HTMLDialogElement>(null);
  const powerRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  // the power button only answers once the dark screen has appeared
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    // the dialog focuses its first control: the power button, still dark
    powerRef.current?.focus({ preventScroll: true });
    // the page underneath holds still: Lenis rests, and native wheel or
    // touch scrolling (no Lenis under reduced motion) can't chain past
    lenisRef.current?.stop();
    const hold = (e: Event) => e.preventDefault();
    d.addEventListener("wheel", hold, { passive: false });
    d.addEventListener("touchmove", hold, { passive: false });
    queueMicrotask(() => setPhase("off"));
    return () => {
      d.removeEventListener("wheel", hold);
      d.removeEventListener("touchmove", hold);
      lenisRef.current?.start();
      if (d.open) d.close();
      back?.focus({ preventScroll: true });
    };
  }, []);

  const wake = () => {
    if (phase !== "off") return;
    blip("open");
    setPhase("wake");
  };

  const boot = () => {
    if (!ready || phase !== "off") return;
    setPhase("boot");
    reboot();
  };

  const settled = (def: unknown) => {
    if (def === "wake") onDone();
  };
  const shown = (def: unknown) => setReady(def === "off");

  return (
    <dialog
      ref={ref}
      className="app-story-off"
      aria-label={s.label}
      data-phase={phase}
      onCancel={(e) => {
        e.preventDefault();
        wake();
      }}
    >
      {reduced ? (
        <m.div className="app-story-off-black" variants={fade} initial="idle" animate={phase} onAnimationComplete={settled} />
      ) : (
        <>
          <m.div className="app-story-off-flash" variants={flash} initial="idle" animate={phase} aria-hidden />
          <m.div className="app-story-off-shutter app-story-off-shutter--top" variants={shutter} initial="idle" animate={phase} aria-hidden />
          <m.div
            className="app-story-off-shutter app-story-off-shutter--bottom"
            variants={shutter}
            initial="idle"
            animate={phase}
            onAnimationComplete={settled}
            aria-hidden
          />
          <m.div className="app-story-off-beam" variants={beam} initial="idle" animate={phase} aria-hidden />
        </>
      )}

      <m.div
        className="app-story-off-screen"
        variants={reduced ? fadeScreen : screen}
        initial="idle"
        animate={phase}
        onAnimationStart={() => setReady(false)}
        onAnimationComplete={shown}
        onClick={(e) => {
          // a touch (or click) anywhere but the power button wakes the screen
          if (!(e.target as Element).closest(".app-story-off-power")) wake();
        }}
      >
        <EmosMark size={27} className="app-story-off-mark" />
        <p className="app-story-off-title">{s.title}</p>
        <p className="app-story-off-hint">{s.hint}</p>
        <button
          ref={powerRef}
          type="button"
          className="app-story-off-power"
          aria-label={s.power}
          onClick={boot}
        >
          <svg width="22" height="22" viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
            <rect x="3" y="0" width="1" height="3" />
            <rect x="1" y="1" width="1" height="1" />
            <rect x="5" y="1" width="1" height="1" />
            <rect x="0" y="2" width="1" height="3" />
            <rect x="6" y="2" width="1" height="3" />
            <rect x="1" y="5" width="1" height="1" />
            <rect x="5" y="5" width="1" height="1" />
            <rect x="2" y="6" width="3" height="1" />
          </svg>
        </button>
        <p className="app-story-off-wake">{fine ? s.wake : s.wakeTouch}</p>
      </m.div>
    </dialog>
  );
}

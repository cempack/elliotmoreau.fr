"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  m,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControlsWithThen,
  type MotionValue,
  type Transition,
} from "motion/react";
import { useI18n } from "@/i18n/client";
import { restartOS } from "@/components/os/menubar/util";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { useFinePointer, useReduced } from "@/hooks/env";
import { lenisRef } from "@/lib/lenisRef";
import { useSound } from "@/lib/sound";

type Phase = "off" | "wake" | "boot";

const RESTORE_KEY = "em-scroll-restoration";

/**
 * Restart emOS into its boot, landing on the Desktop like a real reboot:
 * the reload skips the browser's scroll restoration for this entry (the
 * mode it had is put back once the new page has loaded: restoreScrollMode).
 */
export function reboot() {
  try {
    sessionStorage.setItem(RESTORE_KEY, history.scrollRestoration);
    history.scrollRestoration = "manual";
  } catch {
    // not supported: the boot still plays, just wherever the page was
  }
  restartOS();
}

/**
 * After a reboot: hand the entry its own scroll restoration back once the
 * browser is past restoring this load (it tries until the load event), so
 * a later reload or Back behaves as usual. Returns a cleanup.
 */
export function restoreScrollMode() {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(RESTORE_KEY);
  } catch {
    return () => {};
  }
  if (saved !== "auto" && saved !== "manual") return () => {};
  const mode = saved;
  let timer = 0;
  // the key goes only once the mode is back (a cancelled run leaves it)
  const put = () => {
    timer = window.setTimeout(() => {
      try {
        history.scrollRestoration = mode;
        sessionStorage.removeItem(RESTORE_KEY);
      } catch {
        // nothing to put back
      }
    }, 250);
  };
  if (document.readyState === "complete") put();
  else window.addEventListener("load", put, { once: true });
  return () => {
    window.removeEventListener("load", put);
    window.clearTimeout(timer);
  };
}

/** ease-in for the collapse (a tube losing its deflection), quint out for the return */
const IN: Transition["ease"] = [0.62, 0, 0.88, 0.3];
const OUT: Transition["ease"] = [0.22, 1, 0.36, 1];

/** wait for animations running side by side (their controls are thenable) */
const settle = (...anims: AnimationPlaybackControlsWithThen[]) => Promise.all(anims.map((a) => a.finished));

/** Power glyph, 7×7 pixels. */
export function PowerGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      <rect x="3" y="0" width="1" height="3" />
      <rect x="1" y="1" width="1" height="1" />
      <rect x="5" y="1" width="1" height="1" />
      <rect x="0" y="2" width="1" height="3" />
      <rect x="6" y="2" width="1" height="3" />
      <rect x="1" y="5" width="1" height="1" />
      <rect x="5" y="5" width="1" height="1" />
      <rect x="2" y="6" width="3" height="1" />
    </svg>
  );
}

/**
 * "Shut down": emOS powers off like a CRT. Two shutters fold the picture
 * into a glowing line (the strip left brightens as it thins), the line
 * shrinks to the centre, hands over to a round dot of phosphor, and the
 * dot decays. What's left is a dark screen that says it's safe to close
 * the tab, with a power button that boots emOS again (the dot opens into
 * a line, then the real boot). Esc, or a tap anywhere else, wakes the
 * screen where you were, along the same path reversed.
 *
 * Every stage is a motion value animated from wherever it is, so waking
 * is interruptible at any instant: mid-fold the shutters simply open
 * again, mid-collapse the line grows back, and only a screen that went
 * all the way to the dot replays dot → line → picture.
 *
 * A modal <dialog> in the top layer: above the menu bar, the Dock and the
 * mini player, page inert, focus on the power button, native cursor
 * (globals hand it back while a dialog is open). Lenis rests meanwhile.
 * Reduced motion: a plain cross-fade to the dark screen and back.
 *
 * It stays mounted (closed) so a shut down costs no mount: `open` shows
 * the modal, and the fold starts from the first frame painted after it
 * (showModal's style pass is a long task: an animation whose clock started
 * inside it would open on a half-closed picture). It calls `onDone` once
 * the screen is awake again; the owner then sets `open` back to false.
 */
export function PowerOff({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const s = t.story.finale.off;
  const reduced = useReduced();
  const fine = useFinePointer();
  const { blip } = useSound();
  const ref = useRef<HTMLDialogElement>(null);
  const powerRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("off");
  // the power button only answers once the dark screen has appeared
  const [ready, setReady] = useState(false);
  const run = useRef(0);
  const phaseRef = useRef<Phase>("off");
  const doneRef = useRef(onDone);
  const openRef = useRef(open);
  useEffect(() => {
    doneRef.current = onDone;
    openRef.current = open;
  });

  // the picture's two halves (0 open → 1 closed)
  const shut = useMotionValue(0);
  // the line's width, and its own fade (it hands over to the dot)
  const lineX = useMotionValue(1);
  const lineFade = useMotionValue(1);
  const dotO = useMotionValue(0);
  const dotS = useMotionValue(1);
  const screenO = useMotionValue(0);
  // reduced motion: one black layer
  const blackO = useMotionValue(0);
  // the strip still showing brightens as it thins, like a real tube
  const flash = useTransform(shut, (v) => 0.3 * v * v);
  // the line exists only once the halves have nearly met
  const lineO = useTransform(() => Math.min(1, Math.max(0, (shut.get() - 0.82) / 0.16)) * lineFade.get());

  const all: MotionValue<number>[] = [shut, lineX, lineFade, dotO, dotS, screenO, blackO];

  const enter = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /** awake: ready for the next shut down, and the owner closes the modal */
  const finish = () => {
    enter("off");
    doneRef.current();
  };

  /** the sequence that owns the values; a newer one makes it bail */
  const begin = () => {
    const id = ++run.current;
    all.forEach((v) => v.stop());
    return () => id === run.current;
  };

  const powerDown = async () => {
    const live = begin();
    // the click's sound lands with the first frame of the fold, not before it
    blip("close");
    if (reduced) {
      await settle(animate(blackO, 1, { duration: 0.2 }), animate(screenO, 1, { duration: 0.2, delay: 0.15 }));
      if (live()) setReady(true);
      return;
    }
    await animate(shut, 1, { duration: 0.34, ease: IN });
    if (!live()) return;
    await animate(lineX, 0.03, { duration: 0.3, ease: IN, delay: 0.06 });
    if (!live()) return;
    // the line becomes a dot of phosphor, which decays
    dotS.jump(1);
    animate(lineFade, 0, { duration: 0.08 });
    await animate(dotO, 1, { duration: 0.05 });
    if (!live()) return;
    animate(screenO, 1, { duration: 0.7, delay: 0.32 });
    await settle(animate(dotS, 0.18, { duration: 0.7, ease: OUT }), animate(dotO, 0, { duration: 0.7, ease: OUT }));
    if (!live()) return;
    await animate(screenO, 1, { duration: Math.max(0.05, 0.7 * (1 - screenO.get())) });
    if (live()) setReady(true);
  };

  const wake = async () => {
    if (phaseRef.current !== "off") return;
    const live = begin();
    enter("wake");
    setReady(false);
    blip("open");
    const lit = screenO.get() > 0.02;
    animate(screenO, 0, { duration: 0.15 });
    if (reduced) {
      await animate(blackO, 0, { duration: 0.2, delay: lit ? 0.08 : 0 });
      if (live()) finish();
      return;
    }
    // gone to the dot (or past it): the dot lights again and opens into the line
    if (dotO.get() > 0.01 || lineFade.get() < 0.5) {
      if (dotO.get() < 0.01) dotS.jump(0.18);
      const d = lit ? 0.12 : 0;
      await settle(animate(dotO, 1, { duration: 0.16, ease: OUT, delay: d }), animate(dotS, 1, { duration: 0.16, ease: OUT, delay: d }));
      if (!live()) return;
      lineX.jump(Math.min(lineX.get(), 0.03));
      animate(dotO, 0, { duration: 0.1 });
      animate(lineFade, 1, { duration: 0.06 });
    }
    // a line caught mid-collapse simply grows back from where it is
    if (lineX.get() < 0.999) {
      await animate(lineX, 1, { duration: 0.08 + 0.3 * (1 - lineX.get()), ease: OUT });
      if (!live()) return;
    }
    lineFade.set(1);
    // the halves open from wherever they were; the line fades as they part
    await animate(shut, 0, { duration: 0.06 + 0.38 * shut.get(), ease: OUT });
    if (live()) finish();
  };

  const boot = async () => {
    if (!ready || phaseRef.current !== "off") return;
    const live = begin();
    enter("boot");
    setReady(false);
    animate(screenO, 0, { duration: 0.15 });
    if (!reduced) {
      // the tube warms up: a dot, then a line, then the real boot sequence
      dotS.jump(0.18);
      lineX.jump(0.03);
      await settle(animate(dotO, 1, { duration: 0.14, ease: OUT, delay: 0.12 }), animate(dotS, 1, { duration: 0.14, ease: OUT, delay: 0.12 }));
      if (!live()) return;
      animate(dotO, 0, { duration: 0.1 });
      animate(lineFade, 1, { duration: 0.06 });
      animate(lineX, 1, { duration: 0.3, ease: OUT });
    }
    reboot();
  };

  // the mount effect starts the latest power-down (it lives outside render)
  const powerDownRef = useRef(powerDown);
  useEffect(() => {
    powerDownRef.current = powerDown;
  });

  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // a fresh picture: every stage at rest, the screen fully on
    phaseRef.current = "off";
    shut.jump(0);
    lineX.jump(1);
    lineFade.jump(1);
    dotO.jump(0);
    dotS.jump(1);
    screenO.jump(0);
    blackO.jump(0);
    if (!d.open) d.showModal();
    // the dialog focuses its first control: the power button, still dark
    powerRef.current?.focus({ preventScroll: true });
    // the picture is still all there (the shutters are open): fold it from
    // the next painted frame, once the modal's style pass is behind us
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => void powerDownRef.current());
    });
    // the page underneath holds still: Lenis rests, and native wheel or
    // touch scrolling (no Lenis under reduced motion) can't chain past
    lenisRef.current?.stop();
    const hold = (e: Event) => e.preventDefault();
    d.addEventListener("wheel", hold, { passive: false });
    d.addEventListener("touchmove", hold, { passive: false });
    const runs = run;
    return () => {
      cancelAnimationFrame(raf);
      runs.current++;
      d.removeEventListener("wheel", hold);
      d.removeEventListener("touchmove", hold);
      lenisRef.current?.start();
      if (d.open) d.close();
      back?.focus({ preventScroll: true });
    };
  }, [open, shut, lineX, lineFade, dotO, dotS, screenO, blackO]);

  const titleId = "story-off-title";
  const hintId = "story-off-hint";
  const wakeId = "story-off-wake";

  return (
    <dialog
      ref={ref}
      className="app-story-off"
      aria-label={s.label}
      aria-describedby={`${titleId} ${hintId} ${wakeId}`}
      data-phase={phase}
      onCancel={(e) => {
        e.preventDefault();
        void wake();
      }}
      onClose={() => {
        // the browser may close it itself on a repeated Esc: wake for real
        // (a close queued by a remount finds it open again, and is ignored)
        if (openRef.current && !ref.current?.open && phaseRef.current === "off") doneRef.current();
      }}
    >
      {reduced ? (
        <m.div className="app-story-off-black" style={{ opacity: blackO }} aria-hidden />
      ) : (
        <>
          <m.div className="app-story-off-flash" style={{ opacity: flash }} aria-hidden />
          <m.div className="app-story-off-shutter app-story-off-shutter--top" style={{ scaleY: shut }} aria-hidden />
          <m.div className="app-story-off-shutter app-story-off-shutter--bottom" style={{ scaleY: shut }} aria-hidden />
          <m.div className="app-story-off-line" style={{ scaleX: lineX, opacity: lineO }} aria-hidden />
          <m.div className="app-story-off-dot" style={{ scale: dotS, opacity: dotO }} aria-hidden />
        </>
      )}

      <m.div
        className="app-story-off-screen"
        style={{ opacity: screenO }}
        onClick={(e) => {
          // a touch (or click) anywhere but the power button wakes the screen
          if (!(e.target as Element).closest(".app-story-off-power")) void wake();
        }}
      >
        <EmosMark size={27} className="app-story-off-mark" />
        <p id={titleId} className="app-story-off-title">
          {s.title}
        </p>
        <p id={hintId} className="app-story-off-hint">
          {s.hint}
        </p>
        <button
          ref={powerRef}
          type="button"
          className="app-story-off-power"
          aria-label={s.power}
          // focused from the start, it answers once the dark screen is up
          aria-disabled={!ready}
          data-ready={ready || undefined}
          onClick={() => void boot()}
        >
          <PowerGlyph size={22} />
        </button>
        <p id={wakeId} className="app-story-off-wake">
          {fine ? s.wake : s.wakeTouch}
        </p>
      </m.div>
    </dialog>
  );
}

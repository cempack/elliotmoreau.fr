"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ambientAudio, createGate } from "./sfx/gate";
import type { SoundKind, SoundOpts } from "./sfx/kinds";

export type { SoundKind, SoundOpts } from "./sfx/kinds";

type Kit = typeof import("./sfx");

type SoundCtx = {
  muted: boolean;
  toggle: () => void;
  blip: (kind: SoundKind, opts?: SoundOpts) => void;
};

const Ctx = createContext<SoundCtx>({ muted: false, toggle: () => {}, blip: () => {} });

/** after this long without a sound the context sleeps (an idle audio stream still costs battery) */
const IDLE_MS = 20_000;
/** a sound asked for longer ago than this (a slow wake, a slow load) is better left unplayed */
const LATE_MS = 160;
/** how far a sound leans towards where it happened (0 centred, 1 hard left or right) */
const SPREAD = 0.3;

/**
 * emOS's sounds (lib/sfx/): synthesized, no files, played only where a
 * component calls `blip()` for a real event (an app opening, a letter
 * typed, a turntable thrown, a seal pressed), never on hover and never on
 * load. What keeps them from getting annoying: the gate (repeats dropped,
 * fast runs quieter, bursts cut, and an ear that tires: the more has played
 * lately, the softer the next sound), a bus that never gets louder than one
 * sound, every sound played fresh from a seed so no two are the same,
 * nothing while the tab is hidden, and on iPhone an ambient session, so
 * your music keeps playing and the silent switch silences the site. Each
 * sound leans a little towards where on screen it happened.
 *
 * The page carries only this and the gate: the instruments and recipes
 * load on the first gesture, or once the page is idle. On by default; the
 * choice is remembered.
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  // First render must match the server; sync the saved mute after paint.
  const [muted, setMuted] = useState(false);
  // blip reads the ref, so a toggle → blip in the same tick sees the new state
  const mutedRef = useRef(false);
  const audio = useRef<{ ctx: AudioContext; bus: import("./sfx").Bus | null } | null>(null);
  const kit = useRef<Kit | null>(null);
  const loading = useRef<Promise<Kit | null> | null>(null);
  const gate = useRef(createGate());
  const idle = useRef(0);
  /** where the last press was, and when */
  const press = useRef({ x: 0, t: -1e9 });

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const m = localStorage.getItem("em-sound") === "off";
        mutedRef.current = m;
        setMuted(m);
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      localStorage.setItem("em-sound", next ? "off" : "on");
    } catch {}
  }, []);

  /** the recipes, fetched once */
  const load = useCallback(() => {
    loading.current ??= import("./sfx").then(
      (m) => (kit.current = m),
      () => {
        loading.current = null;
        return null;
      }
    );
    return loading.current;
  }, []);

  /** the context, made on first need (inside a gesture, as browsers ask); its bus once the recipes are here */
  const ensure = useCallback(() => {
    if (!audio.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        ambientAudio();
        audio.current = { ctx: new AC({ latencyHint: "interactive" }), bus: null };
      } catch {
        return null;
      }
    }
    const a = audio.current;
    if (!a.bus && kit.current) a.bus = kit.current.makeBus(a.ctx);
    return a;
  }, []);

  const sleepLater = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      const a = audio.current;
      if (a && a.ctx.state === "running") void a.ctx.suspend().catch(() => {});
    }, IDLE_MS);
  }, []);

  const blip = useCallback(
    (kind: SoundKind, opts?: SoundOpts) => {
      if (mutedRef.current || document.visibilityState === "hidden") return;
      // nothing before the visitor's first gesture (a board flipping on load stays quiet, and the browser has no context to refuse)
      const act = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (!audio.current && act && !act.hasBeenActive) return;
      const asked = performance.now();
      // where it happened: given, or the press that caused it
      const x = opts?.x ?? (asked - press.current.t < 700 ? press.current.x : null);
      const pan = x == null || !window.innerWidth ? 0 : Math.max(-1, Math.min(1, (x / window.innerWidth) * 2 - 1)) * SPREAD;

      const sound = () => {
        const a = ensure();
        const k = kit.current;
        const bus = a?.bus;
        if (!a || !k || !bus) return;
        const go = () => {
          // woken too late: better silent than out of step with what it was for
          if (performance.now() - asked > LATE_MS) return;
          const gain = gate.current(kind, a.ctx.currentTime);
          if (!gain) return;
          try {
            k.play(k.panned(bus, pan), kind, a.ctx.currentTime + 0.004, { ...opts, gain, seed: Math.random() });
          } catch {}
          sleepLater();
        };
        if (a.ctx.state === "running") go();
        else void a.ctx.resume().then(go, () => {});
      };
      if (kit.current) sound();
      else void load().then(sound);
    },
    [ensure, load, sleepLater]
  );

  // the first gesture loads the recipes and unlocks the context (autoplay
  // policy). A touch's pointerdown doesn't count as one on iOS: its release does.
  useEffect(() => {
    const where = (e: PointerEvent) => (press.current = { x: e.clientX, t: performance.now() });
    window.addEventListener("pointerdown", where, { capture: true, passive: true });
    const early = () => {
      if (!mutedRef.current) void load();
    };
    window.addEventListener("pointerdown", early, { capture: true, passive: true, once: true });
    window.addEventListener("keydown", early, { capture: true, passive: true, once: true });
    // or once the page has settled, so the first click's sound is never waiting on the network
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1));
    const later = window.setTimeout(() => ric(early, { timeout: 4000 }), 3000);

    const events = ["pointerup", "touchend", "click", "keydown"] as const;
    const unlock = () => {
      if (mutedRef.current) return;
      void load();
      // inside the gesture itself (Safari won't let a later promise wake it)
      const a = ensure();
      if (!a) return;
      const done = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
      if (a.ctx.state === "running") return done();
      void a.ctx.resume().then(() => {
        done();
        sleepLater();
      }, () => {});
    };
    events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
    return () => {
      window.removeEventListener("pointerdown", where, true);
      window.removeEventListener("pointerdown", early, true);
      window.removeEventListener("keydown", early, true);
      window.clearTimeout(later);
      events.forEach((e) => window.removeEventListener(e, unlock, true));
    };
  }, [ensure, load, sleepLater]);

  // muted, or the tab put away: let the audio hardware rest at once
  useEffect(() => {
    const rest = () => {
      const a = audio.current;
      if (a && a.ctx.state === "running" && (mutedRef.current || document.visibilityState === "hidden")) void a.ctx.suspend().catch(() => {});
    };
    document.addEventListener("visibilitychange", rest);
    rest();
    return () => document.removeEventListener("visibilitychange", rest);
  }, [muted]);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  const value = useMemo(() => ({ muted, toggle, blip }), [muted, toggle, blip]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSound() {
  return useContext(Ctx);
}

/**
 * A turntable let go: a whir as big as the throw. `v` is the spin it keeps
 * and `max` the hardest throw, in the same units; a hand that let go
 * still makes no sound.
 */
export function spun(blip: SoundCtx["blip"], v: number, max: number) {
  const a = Math.abs(v) / max;
  if (a > 0.15) blip("spin", { amount: Math.min(1, a) });
}

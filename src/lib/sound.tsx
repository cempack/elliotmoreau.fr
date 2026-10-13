"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ambientAudio, createGate, makeBus, play, type Bus, type SoundKind } from "./sfx";

export type { SoundKind } from "./sfx";

type SoundCtx = {
  muted: boolean;
  toggle: () => void;
  blip: (kind: SoundKind) => void;
};

const Ctx = createContext<SoundCtx>({ muted: false, toggle: () => {}, blip: () => {} });

/** after this long without a sound the context sleeps (an idle audio stream still costs battery) */
const IDLE_MS = 20_000;

/**
 * emOS's UI sounds (lib/sfx.ts): synthesized, no files, played only where
 * a component calls `blip()` for a real event (an app opening, a copy, a
 * save, a letter leaving), never on hover. What keeps them from getting
 * annoying: the gate (repeats dropped, fast runs quieter, bursts cut), a
 * bus that never gets louder than one sound, nothing while the tab is
 * hidden, and on iPhone an ambient session, so your music keeps playing
 * and the silent switch silences the site. On by default; the choice is
 * remembered.
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  // First render must match the server; sync the saved mute after paint.
  const [muted, setMuted] = useState(false);
  // blip reads the ref, so a toggle → blip in the same tick sees the new state
  const mutedRef = useRef(false);
  const audio = useRef<{ ctx: AudioContext; bus: Bus } | null>(null);
  const gate = useRef(createGate());
  const idle = useRef(0);

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

  /** the context, made on first need (inside a gesture, as browsers ask) */
  const ensure = useCallback(() => {
    if (audio.current) return audio.current;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ambientAudio();
      const ctx = new AC({ latencyHint: "interactive" });
      audio.current = { ctx, bus: makeBus(ctx) };
      return audio.current;
    } catch {
      return null;
    }
  }, []);

  const sleepLater = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      const a = audio.current;
      if (a && a.ctx.state === "running") void a.ctx.suspend().catch(() => {});
    }, IDLE_MS);
  }, []);

  const blip = useCallback(
    (kind: SoundKind) => {
      if (mutedRef.current || document.visibilityState === "hidden") return;
      // nothing before the visitor's first gesture (a board flipping on load stays quiet, and the browser has no context to refuse)
      const act = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (!audio.current && act && !act.hasBeenActive) return;
      const a = ensure();
      if (!a) return;
      const asked = performance.now();
      const go = () => {
        // woken too late (a slow resume): better silent than out of step with what it was for
        if (performance.now() - asked > 160) return;
        const gain = gate.current(kind, a.ctx.currentTime);
        if (!gain) return;
        try {
          // a hair of pitch variation, so a run of the same sound never sounds like a machine
          const pitch = kind === "tick" || kind === "tap" || kind === "select" ? 1 + (Math.random() - 0.5) * 0.024 : 1;
          play(a.bus, kind, a.ctx.currentTime + 0.004, { gain, pitch, offset: Math.random() * 0.4 });
        } catch {}
        sleepLater();
      };
      if (a.ctx.state === "running") go();
      else void a.ctx.resume().then(go, () => {});
    },
    [ensure, sleepLater]
  );

  // the first gesture unlocks the context (autoplay policy). A touch's
  // pointerdown doesn't count as one on iOS: its release does.
  useEffect(() => {
    const events = ["pointerup", "touchend", "click", "keydown"] as const;
    const unlock = () => {
      if (mutedRef.current) return;
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
    return () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  }, [ensure, sleepLater]);

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

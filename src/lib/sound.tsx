"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type SoundCtx = {
  muted: boolean;
  toggle: () => void;
  blip: (kind: "hover" | "click" | "page" | "select") => void;
};

const Ctx = createContext<SoundCtx>({ muted: false, toggle: () => {}, blip: () => {} });

// Tiny synthesized UI sounds — no assets, no background bed.
export function SoundProvider({ children }: { children: React.ReactNode }) {
  // First render must match the server; sync the saved mute after paint.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setMuted(localStorage.getItem("em-sound") === "off");
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastHover = useRef(0);
  const lastHoverEl = useRef<Element | null>(null);
  const pathname = usePathname();
  const firstPath = useRef(true);

  const toggle = useCallback(() => {
    setMuted((m) => {
      try {
        localStorage.setItem("em-sound", m ? "on" : "off");
      } catch {}
      return !m;
    });
  }, []);

  const ensureCtx = () => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
      return ctxRef.current;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctxRef.current = new AC();
    return ctxRef.current;
  };

  const blip = useCallback(
    (kind: "hover" | "click" | "page" | "select") => {
      if (muted) return;
      try {
        const ctx = ensureCtx();
        if (!ctx || ctx.state === "suspended") return;
        const now = ctx.currentTime;
        if (kind === "hover") {
          if (now - lastHover.current < 0.1) return; // backstop throttle
          lastHover.current = now;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const cfg = {
          hover: { f0: 1320, f1: 1180, dur: 0.04, vol: 0.016, type: "sine" as const },
          click: { f0: 620, f1: 920, dur: 0.07, vol: 0.05, type: "triangle" as const },
          page: { f0: 340, f1: 660, dur: 0.16, vol: 0.05, type: "sine" as const },
          select: { f0: 880, f1: 1320, dur: 0.12, vol: 0.05, type: "sine" as const },
        }[kind];
        osc.type = cfg.type;
        osc.frequency.setValueAtTime(cfg.f0, now);
        osc.frequency.exponentialRampToValueAtTime(cfg.f1, now + cfg.dur);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(cfg.vol, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.dur);
        osc.start(now);
        osc.stop(now + cfg.dur + 0.02);
      } catch {}
    },
    [muted]
  );

  // unlock the context on first gesture (autoplay policy)
  useEffect(() => {
    const unlock = () => ensureCtx();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // hover + click sounds via delegation. Hover only fires when ENTERING
  // a new control — sliding across children of the same link, or down a
  // list item by item faster than the throttle, stays quiet.
  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("a,button,[data-sound]");
      if (!el || el === lastHoverEl.current) return;
      lastHoverEl.current = el;
      blip("hover");
    };
    const onOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("a,button,[data-sound]");
      if (!el) return;
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.("a,button,[data-sound]");
      if (to !== el) lastHoverEl.current = null;
    };
    const onDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("a,button");
      if (el) blip("click");
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [blip]);

  // page-change sweep
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    blip("page");
  }, [pathname, blip]);

  const value = useMemo(() => ({ muted, toggle, blip }), [muted, toggle, blip]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSound() {
  return useContext(Ctx);
}

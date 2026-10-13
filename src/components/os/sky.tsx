"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { localHour, phaseOf, sunAt, type SkyPhase } from "@/lib/sun";

/**
 * The sky follows the real sun over Toulouse: dawn, day, dusk, night, set
 * by the sun's elevation (see lib/sun), not by clock bands. The wallpaper,
 * glass tints and a few accents read `html[data-sky]`. A head script
 * (SKY_SCRIPT) sets it before first paint so there is no flash; Control
 * Center can pin a phase ("mode"), persisted in localStorage.
 */
export type { SkyPhase };
export type SkyMode = "auto" | SkyPhase;

export const SKY_PHASES: SkyPhase[] = ["dawn", "day", "dusk", "night"];

// the pre-paint SKY_SCRIPT lives in ./sky-script (plain module: a server
// layout can't read string constants out of a "use client" file)

type SkyCtx = {
  phase: SkyPhase;
  mode: SkyMode;
  setMode: (m: SkyMode) => void;
  /** the Toulouse hour, refreshed each minute; null until mounted */
  hour: number | null;
  /** the real phase in Toulouse right now, whatever is pinned */
  live: SkyPhase | null;
};
const Ctx = createContext<SkyCtx>({ phase: "night", mode: "auto", setMode: () => {}, hour: null, live: null });

export function SkyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<SkyMode>("auto");
  const [now, setNow] = useState<{ hour: number; live: SkyPhase } | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow({ hour: localHour(d), live: phaseOf(sunAt(d)) });
    };
    const read = () => {
      let m: SkyMode = "auto";
      try {
        const saved = localStorage.getItem("em-sky") as SkyMode | null;
        if (saved) m = saved;
      } catch {}
      setModeState(m);
      tick();
    };
    const first = window.setTimeout(read, 0);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const hour = now?.hour ?? null;
  const live = now?.live ?? null;
  const phase: SkyPhase = mode === "auto" ? (live ?? "night") : mode;

  useEffect(() => {
    if (live == null && mode === "auto") return;
    document.documentElement.dataset.sky = phase;
    document.documentElement.dataset.skyMode = mode;
  }, [phase, mode, live]);

  const setMode = useCallback((m: SkyMode) => {
    setModeState(m);
    try {
      localStorage.setItem("em-sky", m);
    } catch {}
  }, []);

  const value = useMemo(() => ({ phase, mode, setMode, hour, live }), [phase, mode, setMode, hour, live]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSky = () => useContext(Ctx);

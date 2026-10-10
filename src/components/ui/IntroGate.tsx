"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { lenisRef } from "@/lib/lenisRef";

const IntroCtx = createContext<() => void>(() => {});
/** Call to end the intro early (e.g. when its sequence finishes). */
export const useIntroFinish = () => useContext(IntroCtx);

/**
 * Once-per-session intro overlay. Server-rendered visible, so the first
 * paint is already the intro (no hero flash); a <head> script marks
 * returning visitors `html[data-intro=done]` and CSS hides it before
 * paint. Any click, key or wheel skips it. Under reduced motion it never
 * shows. On finish it fires `em:intro-done` + `em:replay`, so the hero
 * etch plays in full view.
 *
 * Children render the sequence and call `useIntroFinish()()` when done.
 */
export function IntroGate({
  children,
  className = "",
  maxMs = 2600,
}: {
  children: React.ReactNode;
  className?: string;
  maxMs?: number;
}) {
  const [gone, setGone] = useState(false);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    try {
      sessionStorage.setItem("em-intro", "1");
    } catch {}
    document.documentElement.dataset.intro = "done";
    lenisRef.current?.start();
    setGone(true);
    window.dispatchEvent(new CustomEvent("em:intro-done"));
    window.dispatchEvent(new CustomEvent("em:replay"));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (root.dataset.intro === "done" || reduced) {
      done.current = true;
      queueMicrotask(() => setGone(true));
      return;
    }
    lenisRef.current?.stop();
    const skip = () => finish();
    const t = window.setTimeout(skip, maxMs);
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("wheel", skip, { once: true, passive: true });
    window.addEventListener("touchmove", skip, { once: true, passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
    };
  }, [finish, maxMs]);

  if (gone) return null;
  return (
    <IntroCtx.Provider value={finish}>
      <div className={`em-intro ${className}`} aria-hidden>
        {children}
      </div>
    </IntroCtx.Provider>
  );
}

"use client";

import Link from "next/link";
import { useImperativeHandle, useRef } from "react";
import { animate, m, useMotionValue, type MotionStyle } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";

export type HelloHandle = {
  /** a little nod when someone asks for the README */
  nudge: () => void;
  focus: () => void;
};

/**
 * The intro, set straight on the wallpaper like a riced desktop's conky
 * text: the name, one line, the two ways in. No pane, no chrome: it sits
 * on the sky with the city; the wallpaper's clouds part around it
 * (data-weather-clear) and a soft shade behind the words does the rest.
 * The README icon points at it (a nod and focus). Phones get the same
 * words over the wallpaper, centred.
 */
export function Hello({ ref, reduced }: { ref?: React.Ref<HelloHandle>; reduced: boolean }) {
  const { t, path } = useI18n();
  const h = t.home.hello;
  const { blip } = useSound();
  const rootRef = useRef<HTMLElement>(null);
  const scale = useMotionValue(1);

  useImperativeHandle(
    ref,
    () => ({
      nudge: () => {
        if (reduced) return;
        scale.stop();
        animate(scale, [1, 1.03, 1], { duration: 0.42, ease: [0.22, 1, 0.36, 1] });
      },
      focus: () => rootRef.current?.focus({ preventScroll: true }),
    }),
    [reduced, scale]
  );

  return (
    <m.section ref={rootRef} tabIndex={-1} aria-labelledby="app-home-hello-title" className="app-home-hello" data-weather-clear style={{ scale } as MotionStyle}>
      <h2 id="app-home-hello-title" className="app-home-hello-greeting">
        {h.greeting}
      </h2>
      <p className="app-home-hello-lead">{h.lead}</p>
      <div className="app-home-hello-ctas">
        <Link prefetch={false} href={path("/work")} transitionTypes={["app-open"]} onClick={() => blip("open")} className="app-home-btn app-home-btn--primary">
          {h.work}
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className="app-home-btn-arrow">
            <path d="M2.5 7h8M7 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <Link prefetch={false} href={path("/contact")} transitionTypes={["app-open"]} onClick={() => blip("open")} className="app-home-btn app-home-btn--ghost">
          {h.contact}
        </Link>
      </div>
    </m.section>
  );
}

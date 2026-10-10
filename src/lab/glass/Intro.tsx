"use client";

import { useEffect } from "react";
import { IntroGate, useIntroFinish } from "@/components/ui/IntroGate";

/**
 * A single drop of glass falls into the night, lands where the name lives,
 * and spreads out into the page. Pure CSS keyframes so it runs from the
 * very first paint (before hydration and before motion's lazy features);
 * nothing here is touchable, so a scripted curve is the right tool.
 * IntroGate skips it on any input, on repeat visits and under reduced motion.
 */
export function GlassIntro() {
  return (
    <IntroGate className="g-drip" maxMs={1600}>
      <Drop />
    </IntroGate>
  );
}

function Drop() {
  const finish = useIntroFinish();
  useEffect(() => {
    // the keyframes started at first paint, not at hydration: finish on
    // their clock so a slow hydrate never stretches the intro
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? performance.now();
    const t = window.setTimeout(finish, Math.max(120, 1450 - (performance.now() - fcp)));
    return () => window.clearTimeout(t);
  }, [finish]);
  return (
    <div className="g-drip-stage">
      <span className="g-drip-ripple" />
      <span className="g-drip-ripple g-drip-ripple--2" />
      <span className="g-drip-drop">
        <span className="g-drip-glint" />
      </span>
    </div>
  );
}

"use client";

import "../miniplayer.css";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
/** True while the tab is hidden (false on the server). */
export function useTabHidden() {
  return useSyncExternalStore(
    subscribe,
    () => document.hidden,
    () => false
  );
}

/** resting heights (cells lit, of 5) when paused or under reduced motion */
const REST = [2, 4, 3, 5, 2];

/**
 * A tiny cava: 5 columns of 3px pixel cells with a cyan peak cell, each
 * column stepping through its own pattern. It moves only while music
 * plays, pauses when the tab is hidden, and holds still under reduced
 * motion. Decorative.
 */
export function PixelEq({ playing, className = "" }: { playing: boolean; className?: string }) {
  const hidden = useTabHidden();
  return (
    <span
      aria-hidden
      className={`os-eq ${className}`}
      data-playing={playing || undefined}
      data-paused={!playing || hidden || undefined}
    >
      {REST.map((rest, i) => (
        <span key={i} className="os-eq-col">
          <span
            className={`os-eq-bar os-eq-bar--${i}`}
            style={{ "--os-eq-rest": `${(5 - rest) * 4}px` } as React.CSSProperties}
          />
        </span>
      ))}
    </span>
  );
}

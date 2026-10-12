"use client";

import { useMemo } from "react";
import { dieCells, diePath, markAt } from "./postmark";
import { useNow } from "./useNow";

/**
 * The letter's postmark: Toulouse, today's date and the time, struck in
 * the corner of the sheet the way the post office would (the same die the
 * envelope carries once it's sent). Decorative: the date is the visitor's
 * now, in Toulouse time. Empty until mounted, so the server HTML matches.
 */
export function Postmark({ className = "" }: { className?: string }) {
  const now = useNow(30_000);
  const die = useMemo(() => (now ? dieCells(markAt(now)) : null), [now]);
  return (
    <span className={className} aria-hidden>
      {die && (
        <svg viewBox={`0 0 ${die.w} ${die.h}`} shapeRendering="crispEdges" focusable="false">
          <path d={diePath(die)} fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

import { rubberband } from "@/lib/motion";

/** Pointer history sample for release velocity. */
export type Sample = { t: number; x: number; y: number };

/** Keeps ~120ms of pointer history: enough for a velocity, never stale. */
export function pushSample(samples: Sample[], s: Sample) {
  samples.push(s);
  while (samples.length > 2 && s.t - samples[0].t > 120) samples.shift();
}

/** px/s over the last ~80ms of pointer history; 0 when the hand had stopped. */
export function releaseVelocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 60) return { vx: 0, vy: 0 };
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = Math.max(8, last.t - first.t);
  return { vx: ((last.x - first.x) / dt) * 1000, vy: ((last.y - first.y) / dt) * 1000 };
}

/** Free inside [min, max], progressive resistance past either end. */
export function band(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim);
  if (v > max) return max + rubberband(v - max, dim);
  return v;
}

/** Above this release speed a gesture counts as a throw (bounce allowed). */
export const FLING = 900;

/** Drags never start on something the user meant to click or type into. */
export const INTERACTIVE =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[contenteditable="true"],[data-no-drag]';

export type Rect = { left: number; top: number; right: number; bottom: number };

export const intersects = (a: Rect, b: Rect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

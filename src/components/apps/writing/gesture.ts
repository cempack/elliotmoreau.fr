/** A timestamped position along one axis (px, ms). */
export type Sample = { t: number; x: number };

/**
 * Release velocity in px/s over the last ~100ms of movement (at least the
 * last two samples), or 0 when the finger had already stopped (no movement
 * for 120ms before letting go).
 */
export function releaseVelocity(samples: Sample[]) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples.length - 2;
  while (first > 0 && last.t - samples[first - 1].t <= 100) first--;
  const a = samples[Math.max(0, first)];
  const dt = (last.t - a.t) / 1000;
  const idle = last.t - samples[samples.length - 2].t;
  return dt > 0 && idle < 120 ? (last.x - a.x) / dt : 0;
}

/** Keep a short rolling window of samples. */
export function pushSample(samples: Sample[], t: number, x: number) {
  samples.push({ t, x });
  if (samples.length > 10) samples.shift();
}

/** Swallow the click a drag would otherwise end in. */
export function swallowNextClick() {
  const swallow = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 80);
}

/**
 * What the sky is showing, shared between the wallpaper and the things
 * that hold the sun (the desktop's sun handle, the sundial). Plain module
 * stores, read with useSyncExternalStore or imperatively, so a drag can
 * relight the city every frame without re-rendering React.
 *
 * - scrub: an instant someone is dragging the sun to (null = follow now)
 * - spot: where the wallpaper last drew the sun, in CSS px, and the view
 *   that maps any sun position to the screen
 */

import { atLocalHour, crossLocal, sunDay, type SkyPhase } from "@/lib/sun";

type Listener = () => void;

function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<Listener>();
  return {
    get: () => value,
    set(v: T) {
      if (Object.is(v, value)) return;
      value = v;
      subs.forEach((f) => f());
    },
    subscribe(f: Listener) {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}

export const sunScrub = store<number | null>(null);

export type SunView = {
  /** art grid width, horizon row, highest sun row, azimuth span, CSS px per art pixel */
  W: number;
  hz: number;
  top: number;
  fov: number;
  cell: number;
};

export type SunSpot = {
  view: SunView;
  /** the sun's centre in CSS px, its radius in CSS px */
  x: number;
  y: number;
  r: number;
  /** the instant drawn */
  ms: number;
};

export const sunSpot = store<SunSpot | null>(null);

/** A body's place on screen in art pixels (shared with ./light). Height is
    eased so a low sun still clears the rooftops for its last hour. */
export function project(view: Pick<SunView, "W" | "hz" | "top" | "fov">, elevation: number, azimuth: number) {
  const k = elevation >= 0 ? Math.pow(elevation / 72, 0.72) : elevation / 72;
  return {
    x: view.W * (0.5 + (azimuth - 180) / view.fov),
    y: view.hz - k * (view.hz - view.top),
  };
}

/** The instant a pinned phase shows today: the middle of its band (night:
    two and a half hours after nightfall). The wallpaper lights it and
    Control Center marks it on the sun's curve. */
export function pinnedMs(phase: SkyPhase, now: Date) {
  const d = sunDay(now);
  const up = crossLocal(6, -1, now) ?? d.noon - 4;
  const down = crossLocal(6, 1, now) ?? d.noon + 4;
  const h =
    phase === "dawn"
      ? ((d.dawn ?? up - 0.7) + up) / 2
      : phase === "day"
        ? (d.noon + down) / 2
        : phase === "dusk"
          ? (down + (d.dusk ?? down + 1.2)) / 2
          : Math.min(23.75, (d.dusk ?? 21) + 2.5);
  return atLocalHour(h, now).getTime();
}

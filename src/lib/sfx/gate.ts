/**
 * The gate: what keeps the sounds from getting annoying, small enough to
 * ship with the page (the recipes load later, on the visitor's first
 * gesture). Pure: give it the clock.
 *
 *  - the same sound twice within its gap is dropped (a double fire, a held key);
 *  - quick runs of small sounds get quieter the faster they come;
 *  - a burst of many different sounds at once is cut short;
 *  - and the ear tires: the more has played in the last few seconds, the
 *    softer the next sound, down to about half, recovering in the quiet.
 */
import type { SoundKind } from "./kinds";

/** the shortest gap before the same sound plays again (seconds); faster repeats are dropped */
const MIN_GAP: Partial<Record<SoundKind, number>> = {
  tick: 0.03,
  tap: 0.05,
  select: 0.06,
  key: 0.022,
  space: 0.03,
  type: 0.03,
  flap: 0.05,
  sleeve: 0.045,
  card: 0.05,
  brick: 0.04,
  hour: 0.08,
  lift: 0.15,
  drop: 0.15,
  spin: 0.35,
  dawn: 0.6,
  dusk: 0.6,
  chime: 0.8,
  ding: 0.3,
  carriage: 0.25,
  stamp: 0.2,
  glass: 0.3,
  power: 0.3,
  disk: 0.3,
  zoom: 0.2,
  shatter: 0.8,
  mend: 0.8,
};
const DEFAULT_GAP = 0.09;
/** at most this many sounds start within a burst window */
const BURST = { window: 0.15, max: 5 };

/** the small, fast ones: quieter the faster they come */
const RUNS = new Set<SoundKind>(["tick", "tap", "key", "space", "type", "flap", "sleeve", "card", "brick", "hour"]);

/** how much each sound tires the ear (a typing run tires it a little; a big moment, a lot) */
const WEIGHT: Partial<Record<SoundKind, number>> = {
  tick: 0.05,
  tap: 0.08,
  key: 0.05,
  space: 0.04,
  type: 0.06,
  flap: 0.06,
  sleeve: 0.06,
  card: 0.06,
  brick: 0.05,
  hour: 0.05,
};
/** seconds for the tiredness to halve */
const RECOVER = 5;
/** how hard tiredness bites, and the floor it never goes under */
const TIRE = { per: 0.07, floor: 0.5 };

export function createGate() {
  const last = new Map<SoundKind, number>();
  const recent: number[] = [];
  let tired = 0;
  let tiredAt = 0;
  return (kind: SoundKind, now: number): number => {
    const prev = last.get(kind);
    if (prev !== undefined && now - prev < (MIN_GAP[kind] ?? DEFAULT_GAP)) return 0;
    while (recent.length && now - recent[0] > BURST.window) recent.shift();
    if (recent.length >= BURST.max) return 0;
    recent.push(now);
    last.set(kind, now);

    tired *= Math.pow(0.5, Math.max(0, now - tiredAt) / RECOVER);
    tiredAt = now;
    const ear = Math.max(TIRE.floor, 1 / (1 + TIRE.per * tired));
    tired += WEIGHT[kind] ?? 0.5;

    if (RUNS.has(kind)) {
      const dt = prev === undefined ? 1 : now - prev;
      return ear * Math.max(0.35, Math.min(1, dt / 0.12));
    }
    return ear;
  };
}

/**
 * Ask iOS (Safari 16.4+) to treat the page's sound as ambient: it mixes
 * with whatever is playing (the music keeps going) and the silent switch
 * silences it, like a game's sound effects rather than a player.
 */
export function ambientAudio() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession && nav.audioSession.type !== "ambient") nav.audioSession.type = "ambient";
  } catch {
    // not supported: the browser's default
  }
}

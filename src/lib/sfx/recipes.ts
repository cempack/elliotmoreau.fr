/**
 * What each sound is made of (the instruments are in sfx/voices.ts).
 *
 * The OS speaks in soft plucks tuned to the startup chord's C major
 * (intro/chime.ts), so every shared sound belongs to one instrument. Each
 * lit object speaks for itself: it sounds like the small real thing it
 * draws, a toy-sized version heard from across a quiet room. Nothing is a
 * sample: every call is played fresh from a seed, so no two keystrokes,
 * flaps or shards are quite the same.
 */
import type { SoundKind, SoundOpts } from "./kinds";
import { BAR, BELL, GLASS, SHARD, bell, breath, click, motor, pluck, rng, thump, type Bus } from "./voices";

/** the startup chord's notes, and a few around them */
const N = {
  F4: 349.23,
  Gs4: 415.3,
  G4: 392,
  A4: 440,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093,
  D7: 2349.32,
  E7: 2637.02,
};

/** each app's three notes as it opens: the same rise, a different colour */
const LAUNCH: Record<string, readonly [number, number, number]> = {
  home: [N.C5, N.E5, N.G5],
  work: [N.G4, N.D5, N.G5],
  writing: [N.A5, N.C6, N.E6],
  atlas: [N.D5, N.A5, N.D6],
  now: [N.E5, N.A5, N.E6],
  contact: [N.G5, N.C6, N.E6],
  admin: [N.C5, N.G5, N.D6],
  terminal: [N.C5, N.D5, N.G5],
};
const LAUNCH_DEFAULT = [N.C5, N.G5, N.C6] as const;

/**
 * The mix: each object's level against the OS's plucks, set on the meter
 * (every sound rendered offline and measured against the others). Small,
 * frequent sounds (a key, a flap) sit well under a pluck; the rare, big
 * ones (a seal, a tube waking) no louder than an app opening.
 */
const MIX: Partial<Record<SoundKind, number>> = {
  key: 0.6,
  enter: 0.6,
  type: 0.36,
  space: 0.42,
  brick: 0.45,
  sleeve: 0.8,
  card: 1.2,
  flap: 1.25,
  fold: 1.7,
  carriage: 0.5,
  seal: 0.42,
  stamp: 0.4,
  pin: 0.8,
  seat: 0.8,
  shutter: 0.85,
  power: 0.35,
  unlock: 0.62,
  drop: 0.4,
  stop: 0.6,
  shatter: 0.6,
  flip: 1.7,
  spin: 1.6,
  zoom: 2,
  disk: 1.5,
  lift: 1.4,
  ding: 0.7,
  chime: 0.8,
};

export type PlayOpts = SoundOpts & {
  /** scales the whole sound (the gate quiets fast repeats and a tired ear) */
  gain?: number;
  /** seeds the variation: the same seed, the same sound */
  seed?: number;
};

/**
 * Play one sound at `at` (the context's clock). Every recipe draws its
 * variation from the seed: a hair of pitch, a different grain of noise, a
 * stroke a little harder or softer.
 */
export function play(b: Bus, kind: SoundKind, at: number, o: PlayOpts = {}) {
  const r = rng(o.seed ?? 0.5);
  const gain = (o.gain ?? 1) * (MIX[kind] ?? 1);
  const amount = Math.max(0, Math.min(1, o.amount ?? 0.5));
  /** a level, scaled, with a little life in it */
  const g = (v: number, life = 0.12) => v * gain * (1 - life / 2 + r() * life);
  /** a pitch, nudged by up to ±cents */
  const f = (v: number, cents = 8) => v * Math.pow(2, ((r() * 2 - 1) * cents) / 1200);
  const off = () => r() * 0.5;

  switch (kind) {
    /* ───────── the OS ───────── */
    case "tap":
      pluck(b, { f: f(N.A6, 12), at, level: g(0.022), decay: 0.045, bright: 0.3 });
      breath(b, { at, dur: 0.012, level: g(0.006), f0: 5200, type: "highpass", offset: off() });
      return;
    case "tick":
      pluck(b, { f: f(N.E7, 14), at, level: g(0.013), decay: 0.022, type: "triangle", cutoff: 6000 });
      return;
    case "select":
      pluck(b, { f: f(N.E6, 10), at, level: g(0.04), decay: 0.16, bright: 0.25, room: 0.25 });
      return;
    case "toggle":
      pluck(b, { f: f(N.G5), at, level: g(0.028), decay: 0.09, bright: 0.2 });
      pluck(b, { f: f(N.C6), at: at + 0.045, level: g(0.03), decay: 0.12, bright: 0.2 });
      return;
    case "on":
      // a little switch, then the light
      click(b, { at, f: 2400, level: g(0.05), dur: 0.006, offset: off() });
      pluck(b, { f: f(N.E6), at: at + 0.006, level: g(0.028), decay: 0.08, bright: 0.2 });
      pluck(b, { f: f(N.A6), at: at + 0.056, level: g(0.03), decay: 0.14, bright: 0.2, room: 0.2 });
      return;
    case "off":
      click(b, { at, f: 1700, level: g(0.045), dur: 0.006, offset: off() });
      pluck(b, { f: f(N.A5), at: at + 0.006, level: g(0.024), decay: 0.08 });
      pluck(b, { f: f(N.E5), at: at + 0.056, level: g(0.022), decay: 0.12 });
      return;
    case "open":
      breath(b, { at, dur: 0.18, level: g(0.014), f0: 700, f1: 2400, q: 0.7, room: 0.3, offset: off() });
      pluck(b, { f: f(N.C5), at: at + 0.01, level: g(0.026), decay: 0.22, bright: 0.15 });
      pluck(b, { f: f(N.G5), at: at + 0.06, level: g(0.028), decay: 0.26, bright: 0.15, room: 0.3 });
      return;
    case "close":
      breath(b, { at, dur: 0.12, level: g(0.01), f0: 2200, f1: 700, q: 0.7, offset: off() });
      pluck(b, { f: f(N.G5), at, level: g(0.022), decay: 0.12 });
      pluck(b, { f: f(N.C5), at: at + 0.045, level: g(0.02), decay: 0.16 });
      return;
    case "launch": {
      const [a, m, top] = (o.variant && LAUNCH[o.variant]) || LAUNCH_DEFAULT;
      breath(b, { at, dur: 0.2, level: g(0.008), f0: 900, f1: 3000, q: 0.8, offset: off() });
      pluck(b, { f: f(a, 4), at, level: g(0.02), decay: 0.18, bright: 0.2 });
      pluck(b, { f: f(m, 4), at: at + 0.035, level: g(0.022), decay: 0.2, bright: 0.15 });
      pluck(b, { f: f(top, 4), at: at + 0.07, level: g(0.026), decay: 0.3, bright: 0.15, room: 0.35 });
      return;
    }
    case "success":
      // the pixel accent: a little triangle arpeggio, rounded off
      pluck(b, { f: f(N.E6, 4), at, level: g(0.026), decay: 0.1, type: "triangle", cutoff: 3200 });
      pluck(b, { f: f(N.G6, 4), at: at + 0.06, level: g(0.026), decay: 0.1, type: "triangle", cutoff: 3200 });
      pluck(b, { f: f(N.C7, 4), at: at + 0.12, level: g(0.03), decay: 0.34, type: "triangle", cutoff: 3600, room: 0.45 });
      return;
    case "copy":
      pluck(b, { f: f(N.A6), at, level: g(0.024), decay: 0.05, bright: 0.3 });
      pluck(b, { f: f(N.E7), at: at + 0.045, level: g(0.022), decay: 0.09, bright: 0.2 });
      return;
    case "send":
      breath(b, { at, dur: 0.34, level: g(0.02), f0: 500, f1: 3600, q: 1.1, room: 0.4, offset: off() });
      pluck(b, { f: f(N.G6, 4), at: at + 0.27, level: g(0.026), decay: 0.3, bright: 0.2, room: 0.5 });
      return;
    case "error":
      // a soft "uh-uh": two low, dull notes, falling a little; never a buzzer
      pluck(b, { f: f(N.Gs4, 4), at, level: g(0.034), decay: 0.14, type: "triangle", cutoff: 1400, glide: 0.94 });
      pluck(b, { f: f(N.F4, 4), at: at + 0.1, level: g(0.03), decay: 0.22, type: "triangle", cutoff: 1200, glide: 0.96 });
      return;
    case "trash":
      breath(b, { at, dur: 0.16, level: g(0.03), f0: 2600, f1: 600, q: 0.5, type: "lowpass", offset: off() });
      pluck(b, { f: f(330), at, level: g(0.02), decay: 0.12, glide: 0.5, cutoff: 1500 });
      return;
    case "snap":
      pluck(b, { f: f(N.C5), at, level: g(0.034), decay: 0.07, glide: 0.5 });
      breath(b, { at, dur: 0.012, level: g(0.01), f0: 4000, type: "highpass", offset: off() });
      return;
    case "page":
      breath(b, { at, dur: 0.1, level: g(0.02), f0: f(2600, 60), f1: 1300, q: 0.8, offset: off() });
      breath(b, { at: at + 0.05, dur: 0.07, level: g(0.012), f0: f(3200, 60), f1: 1800, q: 0.8, offset: off() });
      return;
    case "shutdown":
      pluck(b, { f: N.G5, at, level: g(0.02, 0), decay: 0.55, bright: 0.15, room: 0.4 });
      pluck(b, { f: N.E5, at: at + 0.08, level: g(0.02, 0), decay: 0.65, bright: 0.12, room: 0.4 });
      pluck(b, { f: N.C5, at: at + 0.16, level: g(0.021, 0), decay: 0.8, room: 0.45 });
      pluck(b, { f: N.G4, at: at + 0.24, level: g(0.022, 0), decay: 1.1, room: 0.5 });
      return;
    case "menu":
      // smaller than a panel: one pluck and a breath, up
      breath(b, { at, dur: 0.07, level: g(0.008), f0: 1400, f1: 3400, q: 0.9, offset: off() });
      pluck(b, { f: f(N.D6, 10), at, level: g(0.02), decay: 0.07, bright: 0.25 });
      return;
    case "lift":
      // a light thing leaving the desk: a breath up and a high, small note
      breath(b, { at, dur: 0.06, level: g(0.008), f0: 900, f1: 2600, q: 1, offset: off() });
      pluck(b, { f: f(N.A6, 12), at: at + 0.01, level: g(0.012), decay: 0.05, type: "triangle", cutoff: 5000 });
      return;
    case "drop": {
      // a felt-footed landing: a thud, the tap of an edge; thrown, a little bounce after
      const k = 0.7 + amount * 0.6;
      thump(b, { at, f: f(260, 40), level: g(0.06 * k), decay: 0.06, drop: 0.6, cutoff: 1400 });
      click(b, { at, f: f(1500, 80), q: 1.2, level: g(0.05 * k), dur: 0.01, offset: off() });
      if (amount > 0.6) thump(b, { at: at + 0.09, f: f(280, 40), level: g(0.025), decay: 0.04, drop: 0.7, cutoff: 1400 });
      return;
    }
    case "dawn":
      // light coming up: a breath that opens, and a glass note for the sun
      breath(b, { at, dur: 0.7, level: g(0.01), f0: 300, f1: 2600, q: 0.6, peak: 0.6, room: 0.4, offset: off() });
      bell(b, { at: at + 0.32, f: f(N.E6, 4), level: g(0.012), decay: 1.1, partials: GLASS, room: 0.5, cutoff: 5000 });
      bell(b, { at: at + 0.4, f: f(N.A6, 4), level: g(0.008), decay: 1, partials: GLASS, room: 0.5, cutoff: 5000 });
      return;
    case "dusk":
      // and going down: the breath closing, a low note under it
      breath(b, { at, dur: 0.7, level: g(0.01), f0: 2400, f1: 300, q: 0.6, peak: 0.3, room: 0.4, offset: off() });
      bell(b, { at: at + 0.18, f: f(N.G5, 4), level: g(0.01), decay: 1.1, partials: GLASS, room: 0.5, cutoff: 3000 });
      pluck(b, { f: f(N.C5, 4), at: at + 0.3, level: g(0.016), decay: 0.8, cutoff: 1200, room: 0.4 });
      return;

    /* ───────── the terminal ───────── */
    case "key": {
      // a soft mechanical key: the click of the switch, the keycap bottoming out
      const pitch = 1 + (r() - 0.5) * 0.3;
      click(b, { at, f: 2600 * pitch, q: 1.5, level: g(0.09, 0.4), dur: 0.009, offset: off() });
      thump(b, { at: at + 0.004, f: 300 * pitch, level: g(0.03, 0.4), decay: 0.025, drop: 0.6, cutoff: 1800 });
      click(b, { at: at + 0.035 + r() * 0.01, f: 3400 * pitch, q: 2, level: g(0.025, 0.4), dur: 0.006, offset: off() });
      return;
    }
    case "enter":
      // the big key: deeper, with the rattle of its stabilizer bar
      click(b, { at, f: f(1900, 30), q: 1.3, level: g(0.11), dur: 0.012, offset: off() });
      thump(b, { at: at + 0.004, f: f(210, 30), level: g(0.045), decay: 0.04, drop: 0.55, cutoff: 1500 });
      click(b, { at: at + 0.011, f: f(3000, 30), q: 3, level: g(0.04), dur: 0.007, offset: off() });
      click(b, { at: at + 0.05, f: f(2400, 30), q: 2, level: g(0.03), dur: 0.008, offset: off() });
      return;
    case "complete":
      // the word filling in: two quick steps up
      pluck(b, { f: f(N.C7, 6), at, level: g(0.014), decay: 0.04, type: "triangle", cutoff: 6000 });
      pluck(b, { f: f(N.E7, 6), at: at + 0.035, level: g(0.014), decay: 0.06, type: "triangle", cutoff: 6000 });
      return;
    case "chime":
      // the metro reaching a station: three notes on a bar, falling
      bell(b, { at, f: f(N.E6, 3), level: g(0.016), decay: 0.6, partials: BAR, cutoff: 5000, room: 0.3 });
      bell(b, { at: at + 0.16, f: f(N.C6, 3), level: g(0.016), decay: 0.6, partials: BAR, cutoff: 5000, room: 0.3 });
      bell(b, { at: at + 0.32, f: f(N.G5, 3), level: g(0.018), decay: 1, partials: BAR, cutoff: 5000, room: 0.45 });
      return;

    /* ───────── the typewriter ───────── */
    case "type": {
      // a typebar flying up and striking the platen through the ribbon, then falling back
      const p = 1 + (r() - 0.5) * 0.25;
      click(b, { at, f: 1400 * p, q: 0.9, level: g(0.1, 0.4), dur: 0.016, offset: off() });
      thump(b, { at, f: 180 * p, level: g(0.05, 0.3), decay: 0.045, drop: 0.55, cutoff: 1200 });
      click(b, { at: at + 0.002, f: 4200 * p, q: 3, level: g(0.035, 0.4), dur: 0.005, offset: off() });
      // the escapement letting the carriage step on
      click(b, { at: at + 0.028 + r() * 0.012, f: 2800 * p, q: 4, level: g(0.02, 0.4), dur: 0.005, offset: off() });
      return;
    }
    case "space":
      // no letter: just the carriage stepping on, and the long bar knocking back
      thump(b, { at, f: f(140, 40), level: g(0.04), decay: 0.05, drop: 0.6, cutoff: 900 });
      click(b, { at: at + 0.003, f: f(900, 60), q: 1, level: g(0.05), dur: 0.014, offset: off() });
      click(b, { at: at + 0.02, f: f(2800, 40), q: 4, level: g(0.022), dur: 0.005, offset: off() });
      return;
    case "ding":
      // the margin bell: a small domed bell struck once by the carriage
      click(b, { at, f: 5200, q: 2, level: g(0.03), dur: 0.004, offset: off() });
      bell(b, { at, f: f(N.G6, 3), level: g(0.024), decay: 1.2, partials: BELL, cutoff: 7000, room: 0.4, detune: 4 });
      return;
    case "carriage": {
      // the return lever thrown: the ratchet running, the carriage sliding home, a clunk at the stop
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = at + i * 0.026 * (1 - i * 0.04);
        click(b, { at: t, f: f(3000, 80), q: 4, level: g(0.03 * (1 - i / (n * 1.6)), 0.3), dur: 0.004, offset: off() });
      }
      breath(b, { at: at + 0.02, dur: 0.2, level: g(0.012), f0: 600, f1: 1800, q: 1.4, offset: off() });
      thump(b, { at: at + 0.22, f: f(150, 20), level: g(0.06), decay: 0.07, drop: 0.55, cutoff: 900 });
      click(b, { at: at + 0.22, f: f(1200, 20), q: 1, level: g(0.06), dur: 0.016, offset: off() });
      return;
    }
    case "seal": {
      // warm wax giving under the seal: a soft, damp press, a little crackle as it sets
      thump(b, { at, f: f(150, 30), level: g(0.07), decay: 0.12, drop: 0.6, cutoff: 700 });
      breath(b, { at, dur: 0.16, level: g(0.03), f0: 900, f1: 300, q: 0.7, type: "lowpass", offset: off() });
      for (let i = 0; i < 4; i++) click(b, { at: at + 0.1 + r() * 0.22, f: 3000 + r() * 2500, q: 3, level: g(0.012, 0.6), dur: 0.004, offset: off() });
      return;
    }
    case "fold":
      // paper creased: a quick slide, the snap of the fold
      breath(b, { at, dur: 0.09, level: g(0.02), f0: f(1800, 80), f1: 3800, q: 1.1, offset: off() });
      click(b, { at: at + 0.075, f: f(4400, 80), q: 1.5, level: g(0.022), dur: 0.008, offset: off() });
      return;

    /* ───────── the cassette, the turntables ───────── */
    case "flip":
      // a half turn of the turntable: a soft rush of air, the bearing under it
      breath(b, { at, dur: 0.42, level: g(0.012), f0: 500, f1: 1700, q: 0.8, peak: 0.5, offset: off() });
      motor(b, { at, dur: 0.42, f0: 70, f1: 92, level: g(0.004), type: "triangle", cutoff: 400, rise: 0.4 });
      click(b, { at, f: f(2200, 40), q: 2, level: g(0.03), dur: 0.006, offset: off() });
      return;
    case "seat":
      // the shell settling on its new side: two plastic knocks, the second softer
      click(b, { at, f: f(2400, 50), q: 1.6, level: g(0.06), dur: 0.01, offset: off() });
      thump(b, { at, f: f(420, 30), level: g(0.03), decay: 0.03, drop: 0.7, cutoff: 2400 });
      click(b, { at: at + 0.05, f: f(2700, 50), q: 1.8, level: g(0.025), dur: 0.008, offset: off() });
      return;
    case "brake":
      // a hand on the record: the motor dragged down, a whisper of the groove under the finger
      motor(b, { at, dur: 0.16, f0: 95, f1: 40, level: g(0.012), cutoff: 600, rise: 0.05 });
      breath(b, { at, dur: 0.12, level: g(0.012), f0: 2400, f1: 900, q: 1.4, offset: off() });
      return;
    case "whirl":
      // let go: the platter spinning back up to speed (harder throws, higher)
      motor(b, { at, dur: 0.5, f0: 45, f1: 80 + amount * 50, level: g(0.008), cutoff: 700, rise: 0.4, wobble: 0.01 });
      breath(b, { at, dur: 0.4, level: g(0.005), f0: 1200, f1: 2600, q: 1.2, peak: 0.5, offset: off() });
      return;
    case "sleeve":
      // cardboard flicking past cardboard: a dry brush and the soft knock of the next sleeve
      breath(b, { at, dur: 0.05, level: g(0.03, 0.4), f0: f(1500, 150), f1: 900, q: 1.2, offset: off() });
      thump(b, { at: at + 0.03, f: f(320, 60), level: g(0.025, 0.3), decay: 0.03, drop: 0.7, cutoff: 1600 });
      return;
    case "flap": {
      // a split-flap row turning over: a little flurry of plastic leaves, slowing as it lands
      const n = 3 + Math.floor(r() * 3);
      let t = at;
      for (let i = 0; i < n; i++) {
        click(b, { at: t, f: f(3200, 120), q: 2.4, level: g(0.035 * (1 - i * 0.12), 0.3), dur: 0.006, offset: off() });
        t += 0.022 + i * 0.006 + r() * 0.006;
      }
      thump(b, { at: t - 0.006, f: f(900, 40), level: g(0.012), decay: 0.02, drop: 0.8 });
      return;
    }

    /* ───────── the Projects machine ───────── */
    case "power":
      // a tube waking: the soft thoom of the coil, a breath of static as the picture opens
      thump(b, { at, f: 90, level: g(0.07), decay: 0.28, drop: 0.7, cutoff: 400 });
      click(b, { at, f: 1800, q: 1, level: g(0.04), dur: 0.01, offset: off() });
      breath(b, { at: at + 0.02, dur: 0.3, level: g(0.008), f0: 3000, f1: 6000, type: "highpass", peak: 0.15, offset: off() });
      pluck(b, { f: f(N.C7, 3), at: at + 0.14, level: g(0.004), decay: 0.4, attack: 0.08 });
      return;
    case "disk": {
      // a little drive finding the files: a few seeks, a spindle under them
      motor(b, { at, dur: 0.42, f0: 110, f1: 118, level: g(0.004), type: "triangle", cutoff: 500, rise: 0.25 });
      let t = at + 0.03;
      for (let i = 0; i < 5; i++) {
        click(b, { at: t, f: 1600 + r() * 1400, q: 5, level: g(0.03, 0.5), dur: 0.005, offset: off() });
        t += 0.035 + r() * 0.06;
      }
      return;
    }
    case "zoom":
      // leaning in (amount 1) or back (0): a soft rush of air either way
      breath(b, {
        at,
        dur: 0.32,
        level: g(0.009),
        f0: amount > 0.5 ? 500 : 2200,
        f1: amount > 0.5 ? 2200 : 500,
        q: 0.7,
        peak: 0.5,
        offset: off(),
      });
      return;

    /* ───────── pieces you can turn ───────── */
    case "spin": {
      // a turntable thrown round: the rush of the throw, the bearing whirring under it
      const k = 0.4 + amount * 0.6;
      breath(b, { at, dur: 0.3 + amount * 0.3, level: g(0.012 * k), f0: 500 + amount * 400, f1: 1500 + amount * 1500, q: 0.8, peak: 0.25, offset: off() });
      motor(b, { at, dur: 0.5 + amount * 0.4, f0: 60 + amount * 50, f1: 45, level: g(0.004 * k), type: "triangle", cutoff: 500, rise: 0.15 });
      return;
    }
    case "stop":
      // a turn reaching its end: a small, dull bump
      thump(b, { at, f: f(200, 30), level: g(0.04), decay: 0.05, drop: 0.6, cutoff: 900 });
      return;

    /* ───────── the Blog dome ───────── */
    case "glass":
      // a fingertip on the dome: a wine-glass note and its fifth, ringing out under the sky
      click(b, { at, f: 6000, q: 2, level: g(0.012), dur: 0.003, offset: off() });
      bell(b, { at, f: f(N.C6, 3), level: g(0.016), decay: 1.6, partials: GLASS, room: 0.5, cutoff: 6000, detune: 3 });
      bell(b, { at: at + 0.05, f: f(N.G6, 3), level: g(0.008), decay: 1.2, partials: GLASS, room: 0.5, cutoff: 6000, detune: 3 });
      return;

    case "shutter":
      // the long exposure closing: the first curtain's snap, the second's, a breath of the mirror
      click(b, { at, f: f(2200, 40), q: 1.4, level: g(0.06), dur: 0.01, offset: off() });
      thump(b, { at, f: f(380, 20), level: g(0.025), decay: 0.03, drop: 0.7, cutoff: 2000 });
      breath(b, { at: at + 0.01, dur: 0.05, level: g(0.008), f0: 1800, f1: 900, q: 1, offset: off() });
      click(b, { at: at + 0.085, f: f(2700, 40), q: 1.6, level: g(0.045), dur: 0.008, offset: off() });
      return;

    /* ───────── Atlas ───────── */
    case "pin":
      // a push pin into cork: the tiny snap of the point, a muffled push, a little ring of "here"
      click(b, { at, f: f(4600, 60), q: 3, level: g(0.03), dur: 0.004, offset: off() });
      thump(b, { at: at + 0.004, f: f(520, 40), level: g(0.04), decay: 0.035, drop: 0.7, cutoff: 1800 });
      pluck(b, { f: f(N.E6, 4), at: at + 0.04, level: g(0.012), decay: 0.25, bright: 0.2, room: 0.35 });
      return;
    case "stamp":
      // a rubber stamp: the rock onto the card, the slap of rubber, the card's papery give
      thump(b, { at, f: f(120, 30), level: g(0.08), decay: 0.09, drop: 0.55, cutoff: 700 });
      click(b, { at: at + 0.002, f: f(800, 50), q: 0.8, level: g(0.09), dur: 0.022, offset: off() });
      breath(b, { at: at + 0.01, dur: 0.06, level: g(0.012), f0: 2400, f1: 1400, q: 0.9, offset: off() });
      return;
    case "card":
      // a card turned over: the flick of its edge, the air under it
      click(b, { at, f: f(3600, 80), q: 1.2, level: g(0.03, 0.3), dur: 0.008, offset: off() });
      breath(b, { at: at + 0.005, dur: 0.06, level: g(0.02, 0.3), f0: 4000, f1: 2200, q: 1, offset: off() });
      return;

    /* ───────── the 404 ───────── */
    case "shatter": {
      // the page breaking: a dull crack, then shards of glass, high and scattered, falling quiet
      thump(b, { at, f: 160, level: g(0.05), decay: 0.06, drop: 0.5, cutoff: 900 });
      breath(b, { at, dur: 0.07, level: g(0.02), f0: 3500, type: "highpass", offset: off() });
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = at + 0.012 + Math.pow(r(), 1.6) * 0.32;
        bell(b, { at: t, f: 1900 + r() * 2600, level: g(0.008 * (1 - (t - at) * 1.6)), decay: 0.12 + r() * 0.12, partials: SHARD, cutoff: 7000 });
      }
      return;
    }
    case "mend": {
      // the shards finding each other: tinks drawing closer and rising, closing on a glass chord
      const steps = [N.G5, N.C6, N.E6, N.G6, N.C7];
      steps.forEach((s, i) => {
        const t = at + i * (0.07 - i * 0.008);
        bell(b, { at: t, f: f(s, 6), level: g(0.008 + i * 0.001), decay: 0.12, partials: SHARD, cutoff: 7000 });
      });
      bell(b, { at: at + 0.3, f: f(N.C6, 3), level: g(0.012), decay: 1.4, partials: GLASS, room: 0.5, cutoff: 6000 });
      bell(b, { at: at + 0.31, f: f(N.E6, 3), level: g(0.009), decay: 1.3, partials: GLASS, room: 0.5, cutoff: 6000 });
      bell(b, { at: at + 0.32, f: f(N.G6, 3), level: g(0.007), decay: 1.2, partials: GLASS, room: 0.5, cutoff: 6000 });
      return;
    }

    /* ───────── the Desktop and the room ───────── */
    case "brick":
      // a fired-clay brick knocked with a knuckle: a short, woody tok
      thump(b, { at, f: f(640, 60), level: g(0.04, 0.3), decay: 0.03, drop: 0.85, cutoff: 2400 });
      click(b, { at, f: f(1700, 120), q: 2.4, level: g(0.03, 0.3), dur: 0.007, offset: off() });
      return;
    case "hour":
      // an hour passing as you scrub the day: one soft strike of a small clock
      bell(b, { at, f: f(N.C7, 3), level: g(0.008), decay: 0.3, partials: BAR, cutoff: 6000 });
      click(b, { at, f: 3800, q: 3, level: g(0.012), dur: 0.004, offset: off() });
      return;
    case "inside":
      // through the lit window: the city's hush falling away, the room's warmth coming up
      breath(b, { at, dur: 0.6, level: g(0.012), f0: 2400, f1: 500, q: 0.6, peak: 0.35, room: 0.3, offset: off() });
      pluck(b, { f: f(N.C5, 3), at: at + 0.18, level: g(0.018), decay: 0.6, cutoff: 1800, room: 0.35, attack: 0.03 });
      pluck(b, { f: f(N.E5, 3), at: at + 0.24, level: g(0.014), decay: 0.6, cutoff: 1800, room: 0.35, attack: 0.03 });
      pluck(b, { f: f(N.A5, 3), at: at + 0.3, level: g(0.012), decay: 0.7, cutoff: 2200, room: 0.4, attack: 0.03 });
      return;
    case "outside":
      // and back out: the air of the street opening up again
      breath(b, { at, dur: 0.45, level: g(0.01), f0: 500, f1: 2400, q: 0.6, peak: 0.5, room: 0.3, offset: off() });
      pluck(b, { f: f(N.A5, 3), at, level: g(0.012), decay: 0.3, cutoff: 2200, attack: 0.02 });
      pluck(b, { f: f(N.E5, 3), at: at + 0.06, level: g(0.012), decay: 0.4, cutoff: 1800, attack: 0.02 });
      return;
    case "thing":
      thing(b, o.variant, at, g, f, off);
      return;
    case "unlock":
      // the lock giving: a key turning two wards, the bolt drawn back, a small bright latch
      click(b, { at, f: f(3200, 40), q: 3, level: g(0.04), dur: 0.006, offset: off() });
      click(b, { at: at + 0.07, f: f(2600, 40), q: 3, level: g(0.045), dur: 0.007, offset: off() });
      breath(b, { at: at + 0.09, dur: 0.12, level: g(0.012), f0: 1400, f1: 2600, q: 2, offset: off() });
      thump(b, { at: at + 0.21, f: f(380, 20), level: g(0.04), decay: 0.04, drop: 0.7, cutoff: 2000 });
      click(b, { at: at + 0.21, f: f(4200, 30), q: 2, level: g(0.04), dur: 0.006, offset: off() });
      return;
  }
}

type Lvl = (v: number, life?: number) => number;
type Hz = (v: number, cents?: number) => number;

/** each thing in the room has its own small voice, touched */
function thing(b: Bus, which: string | undefined, at: number, g: Lvl, f: Hz, off: () => number) {
  switch (which) {
    case "laptop":
      // two keys pressed, and the little chime of a laptop waking
      click(b, { at, f: f(2600, 80), q: 1.5, level: g(0.06), dur: 0.008, offset: off() });
      click(b, { at: at + 0.07, f: f(2300, 80), q: 1.5, level: g(0.05), dur: 0.008, offset: off() });
      pluck(b, { f: N.C6, at: at + 0.15, level: g(0.014), decay: 0.4, bright: 0.2, room: 0.35 });
      pluck(b, { f: N.G6, at: at + 0.15, level: g(0.008), decay: 0.35, room: 0.35 });
      return;
    case "turntable":
      // the needle set down: a soft drop, then the crackle of the run-in groove
      thump(b, { at, f: 180, level: g(0.03), decay: 0.05, drop: 0.6, cutoff: 900 });
      breath(b, { at, dur: 0.4, level: g(0.004), f0: 2200, f1: 1800, q: 0.5, peak: 0.2, offset: off() });
      for (let i = 0; i < 6; i++) click(b, { at: at + 0.04 + i * 0.05 + off() * 0.04, f: 2500 + off() * 5000, q: 3, level: g(0.02, 0.8), dur: 0.003, offset: off() });
      return;
    case "shelf":
      // a book drawn half out: cloth on wood, the soft knock of its spine
      breath(b, { at, dur: 0.2, level: g(0.016), f0: 500, f1: 1200, q: 1.1, type: "bandpass", peak: 0.4, offset: off() });
      thump(b, { at: at + 0.18, f: f(240, 30), level: g(0.035), decay: 0.05, drop: 0.7, cutoff: 1400 });
      return;
    case "board":
      // a pin pulled from the cork: a small, dry pop
      click(b, { at, f: f(900, 40), q: 1, level: g(0.06), dur: 0.012, offset: off() });
      pluck(b, { f: f(N.G6, 4), at: at + 0.02, level: g(0.01), decay: 0.12, bright: 0.2 });
      return;
    case "tray":
      // the letter lifted off the tray: paper, and the rustle of the sheet under it
      breath(b, { at, dur: 0.14, level: g(0.02), f0: 2200, f1: 3600, q: 1.1, offset: off() });
      breath(b, { at: at + 0.08, dur: 0.1, level: g(0.01), f0: 3000, f1: 1800, q: 1.1, offset: off() });
      return;
    case "window":
      // a knuckle on the pane: glass, and the latch
      bell(b, { at, f: f(N.D6, 4), level: g(0.01), decay: 0.6, partials: GLASS, cutoff: 5000, room: 0.4 });
      click(b, { at: at + 0.12, f: f(3000, 40), q: 3, level: g(0.03), dur: 0.006, offset: off() });
      return;
    default:
      pluck(b, { f: f(N.E6, 10), at, level: g(0.03), decay: 0.16, bright: 0.25, room: 0.25 });
  }
}

/** how long each sound rings (for offline rendering and tests) */
export const LENGTH: Record<SoundKind, number> = {
  tap: 0.08,
  tick: 0.06,
  select: 0.3,
  toggle: 0.25,
  on: 0.3,
  off: 0.25,
  open: 0.45,
  close: 0.3,
  launch: 0.5,
  success: 0.6,
  copy: 0.2,
  send: 0.75,
  error: 0.4,
  trash: 0.25,
  snap: 0.12,
  page: 0.2,
  shutdown: 1.6,
  menu: 0.12,
  lift: 0.1,
  drop: 0.2,
  dawn: 1.5,
  dusk: 1.3,
  key: 0.08,
  enter: 0.1,
  complete: 0.12,
  chime: 1.4,
  type: 0.08,
  space: 0.08,
  ding: 1.3,
  carriage: 0.35,
  seal: 0.4,
  fold: 0.12,
  flip: 0.45,
  seat: 0.1,
  brake: 0.2,
  whirl: 0.55,
  sleeve: 0.08,
  flap: 0.2,
  power: 0.6,
  disk: 0.45,
  zoom: 0.35,
  spin: 0.95,
  stop: 0.08,
  glass: 1.7,
  shutter: 0.12,
  pin: 0.33,
  stamp: 0.12,
  card: 0.08,
  shatter: 0.4,
  mend: 1.8,
  brick: 0.05,
  hour: 0.33,
  inside: 1.05,
  outside: 0.5,
  thing: 0.65,
  unlock: 0.3,
};

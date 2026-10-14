/**
 * The intro's sound, on the picture's own timeline (T). The flight from
 * space: deep space hums low under a few far stars, Toulouse turning to
 * face you catches a glint, the plunge is wind rising into the cloud,
 * inside it the wind goes muffled and a warmer chord opens with the city,
 * over the river it settles to air with two drops of light, and the
 * Desktop lands on the startup chord (chime.ts, played by the Gate). The
 * boot's text instead: its progress segments tick like a drive seeking.
 *
 * Only ever loaded where the browser lets the page sound on its own (a
 * click would skip the intro, so it never waits for one). Everything is
 * scheduled up front on any context, so the clip renders offline too.
 */
import { BELL, GLASS, bell, click, makeBus, panned, pluck, rng, type Bus } from "@/lib/sfx/voices";
import { T } from "./timeline";

const HZ = { C2: 65.41, G2: 98, C3: 130.81, G3: 196, B3: 246.94, E4: 329.63, E5: 659.25, G5: 783.99, E6: 1318.51, G6: 1567.98, C7: 2093 };
const s = (ms: number) => ms / 1000;

/** a long grain of noise: the bus's own loops too soon for wind (the loop would be heard) */
function grain(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const r = rng(0.37);
  for (let i = 0; i < data.length; i++) data[i] = r() * 1.8 - 0.9;
  return buf;
}

/** air: noise through a filter whose level and colour follow `keys` ([seconds, level, hz]) */
function air(b: Bus, buf: AudioBuffer, t0: number, keys: [number, number, number][], type: BiquadFilterType, q: number) {
  const { ctx } = b;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const env = ctx.createGain();
  env.gain.value = 0;
  keys.forEach(([at, level, hz], i) => {
    const when = t0 + at;
    if (i === 0) {
      env.gain.setValueAtTime(level, when);
      f.frequency.setValueAtTime(hz, when);
    } else {
      env.gain.linearRampToValueAtTime(level, when);
      f.frequency.exponentialRampToValueAtTime(hz, when);
    }
  });
  src.connect(f);
  f.connect(env);
  env.connect(b.out);
  src.start(t0 + keys[0][0]);
  src.stop(t0 + keys[keys.length - 1][0] + 0.05);
}

type Pad = { at: number; rise: number; hold: number; fall: number; level: number; cutoff: number; open?: number; room?: number };

/** a pad: each note a sine and a hair-detuned triangle, under one low-pass that can open as it swells */
function pad(b: Bus, t0: number, notes: number[], p: Pad) {
  const { ctx } = b;
  const at = t0 + p.at;
  const end = at + p.rise + p.hold + p.fall;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(p.cutoff, at);
  if (p.open) lp.frequency.exponentialRampToValueAtTime(p.open, at + p.rise);
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(p.level, at + p.rise);
  env.gain.setValueAtTime(p.level, at + p.rise + p.hold);
  env.gain.linearRampToValueAtTime(0, end);
  lp.connect(env);
  env.connect(b.out);
  if (p.room) {
    const g = ctx.createGain();
    g.gain.value = p.room;
    env.connect(g);
    g.connect(b.room);
  }
  notes.forEach((hz, i) => {
    for (const [type, cents, level] of [["sine", 0, 1], ["triangle", i % 2 ? 6 : -6, 0.45]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = level / notes.length;
      o.connect(g);
      g.connect(lp);
      o.start(at);
      o.stop(end + 0.05);
    }
  });
}

/** Seconds the flight's sound runs past its start (the chord's tail is the Gate's). */
export const FLIGHT_LENGTH = 11.45;

/**
 * The flight, from `t0` (the flight's own start, in context time). One-shot
 * notes already behind `now` are left out: a score that loads late joins
 * the flight where it is, mid-swell, rather than playing its past at once.
 */
export function flight(b: Bus, t0: number, now = -Infinity) {
  const ahead = (at: number) => t0 + at > now - 0.03;
  const wind = grain(b.ctx, 2.7);
  const turned = s(T.turned);
  const plunge = s(T.plunge);
  const city = s(T.city);
  const glide = s(T.glide);
  const hand = s(T.hand);

  // space: a low hum that comes up with the stars and is gone into the fall
  pad(b, t0, [HZ.C2, HZ.G2, HZ.C3], { at: 0, rise: 1.8, hold: turned - 1.8, fall: 2.4, level: 0.012, cutoff: 380, open: 520 });
  // a few far stars, here and there
  for (const [at, hz, pan] of [[0.7, HZ.G6, -0.5], [1.5, HZ.C7, 0.45], [2.4, HZ.E6, -0.15]] as const) {
    if (ahead(at)) bell(panned(b, pan), { at: t0 + at, f: hz, level: 0.009, decay: 1.4, partials: GLASS, room: 0.6, cutoff: 5200 });
  }
  // Toulouse turns to face you: a glint
  if (ahead(turned - 0.06)) {
    bell(b, { at: t0 + turned - 0.06, f: HZ.G5, level: 0.012, decay: 1.8, partials: BELL, room: 0.45 });
    bell(panned(b, 0.2), { at: t0 + turned, f: HZ.G5 * 2, level: 0.005, decay: 1.2, partials: GLASS, room: 0.5 });
  }

  // the plunge: wind rising into the cloud, muffled inside it, settling to air over the river
  air(b, wind, t0, [
    [plunge - 0.1, 0, 320],
    [plunge + 1.2, 0.015, 700],
    [city - 0.1, 0.05, 1700],
    [city + 0.4, 0.025, 720],
    [s(T.reveal), 0.014, 520],
    [glide + 0.2, 0.009, 560],
    [hand + 0.4, 0.006, 640],
    [FLIGHT_LENGTH - 0.45, 0, 640],
  ], "bandpass", 0.8);
  // and its body, low, only through the thick of it
  air(b, wind, t0 + 0.9, [
    [plunge - 0.1, 0, 180],
    [city - 0.2, 0.035, 380],
    [city + 0.7, 0.009, 240],
    [s(T.reveal) + 0.2, 0, 220],
  ], "lowpass", 0.5);

  // the city: a warmer chord opening out of the cloud, holding over the river, giving way to the startup chord
  pad(b, t0, [HZ.C3, HZ.G3, HZ.B3, HZ.E4], { at: city + 0.15, rise: 1.7, hold: hand - city - 1.6, fall: 1.4, level: 0.012, cutoff: 650, open: 1700, room: 0.25 });
  // two drops of light on the river (E, G: the chord lands on C)
  for (const [at, hz] of [[glide + 0.3, HZ.E5], [glide + 0.78, HZ.G5]] as const) {
    if (ahead(at)) pluck(b, { at: t0 + at, f: hz, level: 0.012, decay: 0.9, type: "sine", attack: 0.012, room: 0.45, cutoff: 2600 });
  }
}

/** The boot's progress segments (`segments`, ms after `t0`): soft, uneven ticks, a drive seeking. */
export function boot(b: Bus, t0: number, segments: readonly number[], now = -Infinity) {
  const r = rng(0.61);
  let last = -1;
  for (const ms of segments) {
    const at = t0 + s(ms);
    const near = ms - last < 90;
    last = ms;
    const f = 2400 + r() * 1400;
    const level = (near ? 0.006 : 0.01) * (0.8 + r() * 0.4);
    if (at < now - 0.01) continue;
    click(b, { at, f, level, q: 3, dur: 0.007, offset: r() });
    if (!near) click(b, { at: at + 0.011, f: f * 0.62, level: level * 0.45, q: 2.5, dur: 0.009, offset: r() });
  }
}

/** The live score: the bus behind a fader, so a skip can pull it all down in one move. */
export function score(ctx: AudioContext) {
  const fader = ctx.createGain();
  fader.connect(ctx.destination);
  const b = makeBus(ctx, fader);
  /** a performance.now()-clock time, in this context's time */
  const at = (perfMs: number) => ctx.currentTime + (perfMs - performance.now()) / 1000;
  let started = false;
  let closing = false;
  return {
    /** the flight, from its start (a performance.timeOrigin-based ms clock, as the flight keeps it) */
    flight(startMs: number) {
      if (started || closing) return;
      started = true;
      flight(b, at(startMs - performance.timeOrigin), ctx.currentTime);
    },
    /** the boot's ticks, from when its keyframes started (performance.now() clock) */
    boot(startMs: number, segments: readonly number[]) {
      if (started || closing) return;
      started = true;
      boot(b, at(startMs), segments, ctx.currentTime);
    },
    /** pull it down over `seconds`, then let the context go */
    fade(seconds: number) {
      if (closing) return;
      closing = true;
      fader.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
      window.setTimeout(() => void ctx.close().catch(() => {}), seconds * 1000 + 200);
    },
  };
}

export type Score = ReturnType<typeof score>;

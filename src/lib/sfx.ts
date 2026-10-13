/**
 * emOS's sounds, synthesized on the spot (no files). Soft plucks tuned to
 * the startup chord's C major (intro/chime.ts), so every sound belongs to
 * the same instrument; a breath of filtered noise where something moves
 * (a sheet, a letter leaving, a page turning); one triangle arpeggio, the
 * pixel accent, for things that worked. All of it through one gentle bus:
 * a low-pass that takes the edge off, a compressor so a burst never gets
 * louder than one sound, and a small room for the bigger moments.
 *
 * Recipes take any BaseAudioContext, so they can be rendered offline too.
 * Who may play, and how often, is the gate's call (createGate, below);
 * lib/sound.tsx owns the context and the mute.
 */

export type SoundKind =
  /** the softest touch: a tab, a segmented choice, a small button */
  | "tap"
  /** a detent: scrubbing, a board flipping, a counter */
  | "tick"
  /** picking one thing among several */
  | "select"
  /** a neutral switch between options */
  | "toggle"
  /** a switch turned on, and off */
  | "on"
  | "off"
  /** a panel, sheet or menu coming up, and going away */
  | "open"
  | "close"
  /** an app opening */
  | "launch"
  /** something worked: saved, subscribed, unlocked */
  | "success"
  /** copied to the clipboard */
  | "copy"
  /** a letter leaving */
  | "send"
  /** it didn't work */
  | "error"
  /** deleted */
  | "trash"
  /** a window widening or narrowing into place */
  | "snap"
  /** a page turning: a post opening or closing */
  | "page"
  /** emOS turning off: the startup chord, falling */
  | "shutdown";

export type Bus = { ctx: BaseAudioContext; out: AudioNode; room: AudioNode; noise: AudioBuffer };

/** Build the bus into `dest` (the speakers by default). */
export function makeBus(ctx: BaseAudioContext, dest: AudioNode = ctx.destination): Bus {
  const out = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 7000;
  tone.Q.value = 0.3;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.knee.value = 14;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.14;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  out.connect(tone);
  tone.connect(comp);
  comp.connect(master);
  master.connect(dest);

  // the room: one soft, darkening echo
  const room = ctx.createGain();
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.11;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2800;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.26;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  room.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  damp.connect(wet);
  wet.connect(out);

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
  const data = noise.getChannelData(0);
  // a fixed sequence (not Math.random): the same breath every time, and pure
  let s = 0x2f6b;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (s / 0x3fffffff - 1) * 0.9;
  }
  return { ctx, out, room, noise };
}

/** the startup chord's notes, and a few around them */
const N = {
  F4: 349.23,
  Gs4: 415.3,
  G4: 392,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093,
  E7: 2637.02,
};

type Pluck = {
  f: number;
  at: number;
  level: number;
  decay: number;
  type?: OscillatorType;
  /** a quick second partial (the octave) for a bit of shine */
  bright?: number;
  /** send to the room */
  room?: number;
  /** pitch at the end, as a ratio (a fall below 1) */
  glide?: number;
  /** a low-pass for duller voices */
  cutoff?: number;
};

function pluck(b: Bus, p: Pluck) {
  const { ctx } = b;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, p.at);
  env.gain.exponentialRampToValueAtTime(p.level, p.at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, p.at + p.decay);
  let tail: AudioNode = env;
  if (p.cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.cutoff;
    lp.Q.value = 0.4;
    env.connect(lp);
    tail = lp;
  }
  tail.connect(b.out);
  if (p.room) {
    const send = ctx.createGain();
    send.gain.value = p.room;
    tail.connect(send);
    send.connect(b.room);
  }
  const osc = ctx.createOscillator();
  osc.type = p.type ?? "sine";
  osc.frequency.setValueAtTime(p.f, p.at);
  if (p.glide) osc.frequency.exponentialRampToValueAtTime(p.f * p.glide, p.at + p.decay * 0.8);
  osc.connect(env);
  osc.start(p.at);
  osc.stop(p.at + p.decay + 0.03);
  if (p.bright) {
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.frequency.setValueAtTime(p.f * 2, p.at);
    o2.detune.value = 3;
    g2.gain.setValueAtTime(p.bright, p.at);
    g2.gain.exponentialRampToValueAtTime(0.0001, p.at + Math.min(0.06, p.decay));
    o2.connect(g2);
    g2.connect(env);
    o2.start(p.at);
    o2.stop(p.at + Math.min(0.06, p.decay) + 0.03);
  }
}

type Breath = { at: number; dur: number; level: number; f0: number; f1?: number; q?: number; type?: BiquadFilterType; room?: number; offset?: number };

function breath(b: Bus, n: Breath) {
  const { ctx } = b;
  const src = ctx.createBufferSource();
  src.buffer = b.noise;
  const f = ctx.createBiquadFilter();
  f.type = n.type ?? "bandpass";
  f.Q.value = n.q ?? 0.9;
  f.frequency.setValueAtTime(n.f0, n.at);
  if (n.f1) f.frequency.exponentialRampToValueAtTime(n.f1, n.at + n.dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, n.at);
  env.gain.exponentialRampToValueAtTime(n.level, n.at + Math.min(0.03, n.dur * 0.35));
  env.gain.exponentialRampToValueAtTime(0.0001, n.at + n.dur);
  src.connect(f);
  f.connect(env);
  env.connect(b.out);
  if (n.room) {
    const send = ctx.createGain();
    send.gain.value = n.room;
    env.connect(send);
    send.connect(b.room);
  }
  src.start(n.at, (n.offset ?? 0) % 0.4);
  src.stop(n.at + n.dur + 0.02);
}

/**
 * Play one sound at `at` (the context's clock). `gain` scales it (the gate
 * quiets fast repeats), `pitch` nudges it (a hair of variation, so a run of
 * ticks never sounds like a machine), `offset` picks where in the noise a
 * breath starts.
 */
export function play(b: Bus, kind: SoundKind, at: number, { gain = 1, pitch = 1, offset = 0 } = {}) {
  const g = (v: number) => v * gain;
  const f = (v: number) => v * pitch;
  switch (kind) {
    case "tap":
      pluck(b, { f: f(N.A6), at, level: g(0.022), decay: 0.045, bright: 0.3 });
      breath(b, { at, dur: 0.012, level: g(0.006), f0: 5200, type: "highpass", offset });
      return;
    case "tick":
      pluck(b, { f: f(N.E7), at, level: g(0.013), decay: 0.022, type: "triangle", cutoff: 6000 });
      return;
    case "select":
      pluck(b, { f: f(N.E6), at, level: g(0.04), decay: 0.16, bright: 0.25, room: 0.25 });
      return;
    case "toggle":
      pluck(b, { f: f(N.G5), at, level: g(0.028), decay: 0.09, bright: 0.2 });
      pluck(b, { f: f(N.C6), at: at + 0.045, level: g(0.03), decay: 0.12, bright: 0.2 });
      return;
    case "on":
      pluck(b, { f: f(N.E6), at, level: g(0.028), decay: 0.08, bright: 0.2 });
      pluck(b, { f: f(N.A6), at: at + 0.05, level: g(0.03), decay: 0.14, bright: 0.2, room: 0.2 });
      return;
    case "off":
      pluck(b, { f: f(N.A5), at, level: g(0.024), decay: 0.08 });
      pluck(b, { f: f(N.E5), at: at + 0.05, level: g(0.022), decay: 0.12 });
      return;
    case "open":
      breath(b, { at, dur: 0.18, level: g(0.014), f0: 700, f1: 2400, q: 0.7, room: 0.3, offset });
      pluck(b, { f: f(N.C5), at: at + 0.01, level: g(0.026), decay: 0.22, bright: 0.15 });
      pluck(b, { f: f(N.G5), at: at + 0.06, level: g(0.028), decay: 0.26, bright: 0.15, room: 0.3 });
      return;
    case "close":
      breath(b, { at, dur: 0.12, level: g(0.01), f0: 2200, f1: 700, q: 0.7, offset });
      pluck(b, { f: f(N.G5), at, level: g(0.022), decay: 0.12 });
      pluck(b, { f: f(N.C5), at: at + 0.045, level: g(0.02), decay: 0.16 });
      return;
    case "launch":
      breath(b, { at, dur: 0.2, level: g(0.008), f0: 900, f1: 3000, q: 0.8, offset });
      pluck(b, { f: f(N.C5), at, level: g(0.02), decay: 0.18, bright: 0.2 });
      pluck(b, { f: f(N.G5), at: at + 0.035, level: g(0.022), decay: 0.2, bright: 0.15 });
      pluck(b, { f: f(N.C6), at: at + 0.07, level: g(0.026), decay: 0.3, bright: 0.15, room: 0.35 });
      return;
    case "success":
      // the pixel accent: a little triangle arpeggio, rounded off
      pluck(b, { f: f(N.E6), at, level: g(0.026), decay: 0.1, type: "triangle", cutoff: 3200 });
      pluck(b, { f: f(N.G6), at: at + 0.06, level: g(0.026), decay: 0.1, type: "triangle", cutoff: 3200 });
      pluck(b, { f: f(N.C7), at: at + 0.12, level: g(0.03), decay: 0.34, type: "triangle", cutoff: 3600, room: 0.45 });
      return;
    case "copy":
      pluck(b, { f: f(N.A6), at, level: g(0.024), decay: 0.05, bright: 0.3 });
      pluck(b, { f: f(N.E7), at: at + 0.045, level: g(0.022), decay: 0.09, bright: 0.2 });
      return;
    case "send":
      breath(b, { at, dur: 0.34, level: g(0.02), f0: 500, f1: 3600, q: 1.1, room: 0.4, offset });
      pluck(b, { f: f(N.G6), at: at + 0.27, level: g(0.026), decay: 0.3, bright: 0.2, room: 0.5 });
      return;
    case "error":
      // a soft "uh-uh": two low, dull notes, falling a little; never a buzzer
      pluck(b, { f: f(N.Gs4), at, level: g(0.034), decay: 0.14, type: "triangle", cutoff: 1400, glide: 0.94 });
      pluck(b, { f: f(N.F4), at: at + 0.1, level: g(0.03), decay: 0.22, type: "triangle", cutoff: 1200, glide: 0.96 });
      return;
    case "trash":
      breath(b, { at, dur: 0.16, level: g(0.03), f0: 2600, f1: 600, q: 0.5, type: "lowpass", offset });
      pluck(b, { f: f(330), at, level: g(0.02), decay: 0.12, glide: 0.5, cutoff: 1500 });
      return;
    case "snap":
      pluck(b, { f: f(N.C5), at, level: g(0.034), decay: 0.07, glide: 0.5 });
      breath(b, { at, dur: 0.012, level: g(0.01), f0: 4000, type: "highpass", offset });
      return;
    case "page":
      breath(b, { at, dur: 0.1, level: g(0.02), f0: 2600, f1: 1300, q: 0.8, offset });
      breath(b, { at: at + 0.05, dur: 0.07, level: g(0.012), f0: 3200, f1: 1800, q: 0.8, offset: offset + 0.2 });
      return;
    case "shutdown":
      pluck(b, { f: f(N.G5), at, level: g(0.02), decay: 0.55, bright: 0.15, room: 0.4 });
      pluck(b, { f: f(N.E5), at: at + 0.08, level: g(0.02), decay: 0.65, bright: 0.12, room: 0.4 });
      pluck(b, { f: f(N.C5), at: at + 0.16, level: g(0.021), decay: 0.8, room: 0.45 });
      pluck(b, { f: f(N.G4), at: at + 0.24, level: g(0.022), decay: 1.1, room: 0.5 });
      return;
  }
}

/** how long each sound plays (for offline rendering and tests) */
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
};

/** the shortest gap before the same sound plays again (seconds); faster repeats are dropped */
const MIN_GAP: Partial<Record<SoundKind, number>> = { tick: 0.03, tap: 0.05, select: 0.06 };
const DEFAULT_GAP = 0.09;
/** at most this many sounds start within a burst window */
const BURST = { window: 0.15, max: 5 };

/**
 * The gate: what keeps the sounds from getting annoying. The same sound
 * twice within its gap is dropped (a double fire, a held key); quick runs
 * of ticks and taps get quieter the faster they come; and a burst of many
 * different sounds at once is cut short. Returns the gain to play at, or
 * 0 to stay quiet. Pure: give it the clock.
 */
export function createGate() {
  const last = new Map<SoundKind, number>();
  const recent: number[] = [];
  return (kind: SoundKind, now: number): number => {
    const prev = last.get(kind);
    if (prev !== undefined && now - prev < (MIN_GAP[kind] ?? DEFAULT_GAP)) return 0;
    while (recent.length && now - recent[0] > BURST.window) recent.shift();
    if (recent.length >= BURST.max) return 0;
    recent.push(now);
    last.set(kind, now);
    if (kind === "tick" || kind === "tap") {
      const dt = prev === undefined ? 1 : now - prev;
      return Math.max(0.35, Math.min(1, dt / 0.12));
    }
    return 1;
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

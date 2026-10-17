/**
 * The instruments every recipe (sfx/recipes.ts) is played on: a few small
 * physical voices, synthesized on the spot, each a sketch of something
 * real rather than a beep. A plucked tone (the OS's own voice), a breath of
 * filtered noise (paper, air, a sheet sliding), a click (two hard things
 * meeting), a thump (the body behind a click), a bell (struck metal or
 * glass: partials that don't line up), and a motor (a fan, a tape drive
 * spinning up or down).
 *
 * All of it goes through one gentle bus: a low-pass that takes the edge
 * off, a compressor so a burst never gets louder than one sound, and a
 * small room for the bigger moments. Works on any BaseAudioContext, so the
 * same sounds render offline (the demo, the tests).
 *
 * Every envelope starts at 0 before its first scheduled value: a source can
 * begin a frame ahead of it, and a high-pass would let that edge through as
 * a loud click.
 */

export type Bus = { ctx: BaseAudioContext; out: AudioNode; room: AudioNode; noise: AudioBuffer };

/** Build the bus into `dest` (the speakers by default). */
export function makeBus(ctx: BaseAudioContext, dest: AudioNode = ctx.destination): Bus {
  const out = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 7000;
  tone.Q.value = 0.3;
  // a hair of low cut: laptop speakers can't play below it anyway, and it keeps thumps from booming on headphones
  const floor = ctx.createBiquadFilter();
  floor.type = "highpass";
  floor.frequency.value = 70;
  floor.Q.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.knee.value = 14;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.14;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  out.connect(tone);
  tone.connect(floor);
  floor.connect(comp);
  comp.connect(master);
  master.connect(dest);

  // the room: one soft, darkening echo, spread a little wider than the dry sound
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
  // a fixed sequence (not Math.random): the same grain every time, and pure
  let s = 0x2f6b;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (s / 0x3fffffff - 1) * 0.9;
  }
  return { ctx, out, room, noise };
}

/** the same bus, heard from a little to the left or right (-1…1) */
export function panned(b: Bus, pan: number): Bus {
  if (!pan || !b.ctx.createStereoPanner) return b;
  const p = b.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(b.out);
  return { ...b, out: p };
}

/** a small seeded random: the same seed, the same variation (offline renders and tests stay exact) */
export function rng(seed: number) {
  let s = (Math.floor(seed * 0x7fffffff) ^ 0x5bd1e995) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

function send(b: Bus, from: AudioNode, amount?: number) {
  if (!amount) return;
  const g = b.ctx.createGain();
  g.gain.value = amount;
  from.connect(g);
  g.connect(b.room);
}

export type Pluck = {
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
  /** attack, for softer onsets (seconds) */
  attack?: number;
};

/** a plucked tone: the OS's own voice */
export function pluck(b: Bus, p: Pluck) {
  const { ctx } = b;
  const env = ctx.createGain();
  env.gain.value = 0;
  const atk = p.attack ?? 0.005;
  env.gain.setValueAtTime(0.0001, p.at);
  env.gain.exponentialRampToValueAtTime(p.level, p.at + atk);
  env.gain.exponentialRampToValueAtTime(0.0001, p.at + Math.max(atk + 0.01, p.decay));
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
  send(b, tail, p.room);
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

export type Breath = {
  at: number;
  dur: number;
  level: number;
  f0: number;
  f1?: number;
  q?: number;
  type?: BiquadFilterType;
  room?: number;
  offset?: number;
  /** where the swell peaks, as a share of the length (0.35 of 30 ms by default: a quick onset) */
  peak?: number;
};

/** a breath of filtered noise: paper, air, something sliding */
export function breath(b: Bus, n: Breath) {
  const { ctx } = b;
  const src = ctx.createBufferSource();
  src.buffer = b.noise;
  const f = ctx.createBiquadFilter();
  f.type = n.type ?? "bandpass";
  f.Q.value = n.q ?? 0.9;
  f.frequency.setValueAtTime(n.f0, n.at);
  if (n.f1) f.frequency.exponentialRampToValueAtTime(n.f1, n.at + n.dur);
  const env = ctx.createGain();
  env.gain.value = 0;
  const rise = n.peak != null ? n.dur * n.peak : Math.min(0.03, n.dur * 0.35);
  env.gain.setValueAtTime(0.0001, n.at);
  env.gain.exponentialRampToValueAtTime(n.level, n.at + Math.max(0.002, rise));
  env.gain.exponentialRampToValueAtTime(0.0001, n.at + n.dur);
  src.connect(f);
  f.connect(env);
  env.connect(b.out);
  send(b, env, n.room);
  const len = b.noise.duration;
  // long breaths loop the grain; short ones start somewhere in it
  if (n.dur + 0.05 > len - 0.2) src.loop = true;
  src.start(n.at, ((n.offset ?? 0) % 0.4 + 0.4) % 0.4);
  src.stop(n.at + n.dur + 0.02);
}

export type Click = { at: number; f: number; level: number; q?: number; dur?: number; offset?: number; room?: number };

/** a click: a few milliseconds of tuned noise, two hard things meeting */
export function click(b: Bus, c: Click) {
  const { ctx } = b;
  const dur = c.dur ?? 0.012;
  const src = ctx.createBufferSource();
  src.buffer = b.noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = c.f;
  f.Q.value = c.q ?? 2.2;
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, c.at);
  env.gain.exponentialRampToValueAtTime(c.level, c.at + 0.0008);
  env.gain.exponentialRampToValueAtTime(0.0001, c.at + dur);
  src.connect(f);
  f.connect(env);
  env.connect(b.out);
  send(b, env, c.room);
  src.start(c.at, ((c.offset ?? 0) % 0.5 + 0.5) % 0.5);
  src.stop(c.at + dur + 0.01);
}

export type Thump = { at: number; f: number; level: number; decay: number; drop?: number; cutoff?: number; room?: number; type?: OscillatorType };

/** a thump: a tone whose pitch falls at once, the body behind a click (a key bottoming out, a stamp landing) */
export function thump(b: Bus, t: Thump) {
  const { ctx } = b;
  const osc = ctx.createOscillator();
  osc.type = t.type ?? "sine";
  osc.frequency.setValueAtTime(t.f, t.at);
  osc.frequency.exponentialRampToValueAtTime(t.f * (t.drop ?? 0.5), t.at + Math.min(0.05, t.decay * 0.6));
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0.0001, t.at);
  env.gain.exponentialRampToValueAtTime(t.level, t.at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, t.at + t.decay);
  osc.connect(env);
  let tail: AudioNode = env;
  if (t.cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = t.cutoff;
    env.connect(lp);
    tail = lp;
  }
  tail.connect(b.out);
  send(b, tail, t.room);
  osc.start(t.at);
  osc.stop(t.at + t.decay + 0.02);
}

/** partials of a struck body, as [ratio to the fundamental, level, decay ratio] */
export type Partials = readonly (readonly [number, number, number])[];

/** a small handbell / a typewriter's margin bell: bright, quick to fade */
export const BELL: Partials = [
  [1, 1, 1],
  [2.76, 0.42, 0.55],
  [5.4, 0.2, 0.32],
  [8.93, 0.08, 0.2],
];
/** a wine glass: nearly harmonic, long, pure */
export const GLASS: Partials = [
  [1, 1, 1],
  [2.32, 0.28, 0.7],
  [4.25, 0.1, 0.45],
  [6.63, 0.04, 0.3],
];
/** a little metal bar: a glockenspiel key, a seat-belt sign chime */
export const BAR: Partials = [
  [1, 1, 1],
  [3.99, 0.3, 0.4],
  [10.65, 0.06, 0.15],
];
/** a shard of glass: thin, high and quick */
export const SHARD: Partials = [
  [1, 1, 1],
  [1.59, 0.5, 0.6],
  [2.14, 0.3, 0.45],
  [2.98, 0.18, 0.3],
];

export type Bell = { at: number; f: number; level: number; decay: number; partials?: Partials; room?: number; cutoff?: number; detune?: number };

/** a struck bell, glass or bar: partials that don't line up, each fading at its own pace */
export function bell(b: Bus, p: Bell) {
  const { ctx } = b;
  const sum = ctx.createGain();
  let tail: AudioNode = sum;
  if (p.cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.cutoff;
    lp.Q.value = 0.3;
    sum.connect(lp);
    tail = lp;
  }
  tail.connect(b.out);
  send(b, tail, p.room);
  for (const [ratio, amp, dk] of p.partials ?? BELL) {
    const f = p.f * ratio;
    if (f > 12000) continue;
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    if (p.detune) osc.detune.value = p.detune * (ratio > 1 ? 1 : -1);
    const env = ctx.createGain();
    env.gain.value = 0;
    const d = Math.max(0.03, p.decay * dk);
    env.gain.setValueAtTime(0.0001, p.at);
    env.gain.exponentialRampToValueAtTime(p.level * amp, p.at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, p.at + d);
    osc.connect(env);
    env.connect(sum);
    osc.start(p.at);
    osc.stop(p.at + d + 0.02);
  }
}

export type Motor = {
  at: number;
  dur: number;
  f0: number;
  f1: number;
  level: number;
  type?: OscillatorType;
  cutoff?: number;
  /** a slow wobble, as a ratio of the pitch (wow and flutter) */
  wobble?: number;
  /** share of the length spent fading in */
  rise?: number;
  room?: number;
};

/** a motor, a fan, a drive: a buzzy tone sliding up as it spins up, or down as it stops */
export function motor(b: Bus, m: Motor) {
  const { ctx } = b;
  const osc = ctx.createOscillator();
  osc.type = m.type ?? "sawtooth";
  osc.frequency.setValueAtTime(m.f0, m.at);
  osc.frequency.exponentialRampToValueAtTime(m.f1, m.at + m.dur);
  if (m.wobble) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 7;
    depth.gain.value = ((m.f0 + m.f1) / 2) * m.wobble;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(m.at);
    lfo.stop(m.at + m.dur + 0.02);
  }
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = m.cutoff ?? 900;
  lp.Q.value = 0.7;
  const env = ctx.createGain();
  env.gain.value = 0;
  const rise = m.dur * (m.rise ?? 0.3);
  env.gain.setValueAtTime(0.0001, m.at);
  env.gain.exponentialRampToValueAtTime(m.level, m.at + Math.max(0.005, rise));
  env.gain.exponentialRampToValueAtTime(0.0001, m.at + m.dur);
  osc.connect(lp);
  lp.connect(env);
  env.connect(b.out);
  send(b, env, m.room);
  osc.start(m.at);
  osc.stop(m.at + m.dur + 0.02);
}

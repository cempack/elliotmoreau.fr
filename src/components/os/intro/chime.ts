/**
 * The emOS startup chord: a soft Cmaj9 that blooms open, synthesized on
 * the spot (no assets). Bell-ish voices (sine + a quiet octave triangle)
 * are strummed 45ms apart through a low-pass that opens as they ring,
 * with a short echo for air. Peaks well under the UI blips' loudness.
 *
 * Called from inside a user gesture (or with `onlyIfAllowed`, wherever the
 * browser still lets the page play sound). A touch `pointerdown` isn't
 * an activation event, so a context born suspended waits for the release
 * (pointerup / touchend / click) to resume, then plays.
 */
import { ambientAudio } from "@/lib/sfx/gate";

const NOTES = [261.63, 329.63, 392.0, 493.88, 587.33];
const ROOT = 130.81;

/** The chord itself, scheduled at `t0` into `dest` (any context: the arrival's clip renders it offline). */
export function chord(ctx: BaseAudioContext, dest: AudioNode, t0: number) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.085, t0 + 0.05);
  master.gain.setTargetAtTime(0.0001, t0 + 0.9, 0.42);
  master.connect(dest);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 0.5;
  tone.frequency.setValueAtTime(700, t0);
  tone.frequency.exponentialRampToValueAtTime(3800, t0 + 0.45);
  tone.connect(master);

  // a little room: one echo tap with soft feedback
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.21;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.26;
  const wet = ctx.createGain();
  wet.gain.value = 0.2;
  tone.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  const voice = (freq: number, at: number, level: number, decay: number) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(level, at + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    env.connect(tone);

    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.value = freq;
    body.connect(env);

    const shine = ctx.createOscillator();
    const shineGain = ctx.createGain();
    shine.type = "triangle";
    shine.frequency.value = freq * 2;
    shine.detune.value = 4;
    shineGain.gain.value = 0.18;
    shine.connect(shineGain);
    shineGain.connect(env);

    for (const o of [body, shine]) {
      o.start(at);
      o.stop(at + decay + 0.05);
    }
  };

  voice(ROOT, t0, 0.42, 2.2);
  NOTES.forEach((f, i) => voice(f, t0 + 0.02 + i * 0.045, 0.3 - i * 0.03, 1.9 - i * 0.12));
}

/**
 * A context that may sound without a gesture, or null: the browser decides
 * (a first visit usually can't, a page the visitor clicked their way back
 * to, or a site they come to often, usually can). Never waits for a click:
 * in the intro, a click is a skip.
 */
export async function openAudio(): Promise<AudioContext | null> {
  const AC =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ambientAudio();
    ctx = new AC();
  } catch {
    return null;
  }
  if (ctx.state !== "running") {
    // some engines start suspended even where they'd allow it: one try, briefly
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => window.setTimeout(r, 400))]);
  }
  if (ctx.state === "running") return ctx;
  void ctx.close().catch(() => {});
  return null;
}

export function playStartupChord({ onlyIfAllowed = false }: { onlyIfAllowed?: boolean } = {}) {
  const AC =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  let ctx: AudioContext;
  try {
    // on iPhone: mixes with the music already playing, and the silent switch silences it
    ambientAudio();
    ctx = new AC();
  } catch {
    return;
  }

  const play = () => {
    chord(ctx, ctx.destination, ctx.currentTime + 0.03);
    window.setTimeout(() => void ctx.close().catch(() => {}), 3600);
  };

  if (ctx.state === "running") {
    play();
    return;
  }
  // outside a gesture (a boot after Restart reloaded the page): now or never, never on a later click
  if (onlyIfAllowed) {
    void ctx.close().catch(() => {});
    return;
  }

  // born suspended (touch pointerdown): resume on the release gesture
  const events = ["pointerup", "touchend", "click", "keydown"] as const;
  let settled = false;
  const resume = () => {
    if (settled) return;
    settled = true;
    events.forEach((e) => window.removeEventListener(e, resume, true));
    ctx
      .resume()
      .then(play)
      .catch(() => void ctx.close().catch(() => {}));
  };
  events.forEach((e) => window.addEventListener(e, resume, { capture: true, once: true }));
  // nobody let go in time: drop it rather than chime late
  window.setTimeout(() => {
    if (settled) return;
    settled = true;
    events.forEach((e) => window.removeEventListener(e, resume, true));
    void ctx.close().catch(() => {});
  }, 1200);
}

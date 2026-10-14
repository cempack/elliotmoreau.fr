/**
 * emOS's sounds (lib/sfx/): the gate that keeps them from getting
 * annoying, and the recipes themselves, played into a stand-in audio graph
 * that records what each one schedules.
 *
 *   npx tsx --conditions=react-server --test scripts/test/sound.test.ts
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGate } from "@/lib/sfx/gate";
import { LENGTH, play } from "@/lib/sfx/recipes";
import { makeBus, panned } from "@/lib/sfx/voices";
import type { SoundKind } from "@/lib/sfx/kinds";

describe("sound gate", () => {
  test("the same sound twice in a row is dropped, then allowed again", () => {
    const gate = createGate();
    assert.ok(gate("open", 1) > 0.9);
    assert.equal(gate("open", 1.05), 0);
    assert.ok(gate("open", 1.2) > 0);
  });

  test("different sounds at once both play", () => {
    const gate = createGate();
    assert.ok(gate("close", 2) > 0.9);
    assert.ok(gate("launch", 2.001) > 0.9);
  });

  test("fast ticks get quieter, never silent, and a pause brings them back", () => {
    const gate = createGate();
    assert.ok(gate("tick", 0) > 0.95);
    const fast = gate("tick", 0.04);
    assert.ok(fast > 0 && fast < 1, `quieter: ${fast}`);
    assert.ok(gate("tick", 0.08) >= 0.3);
    assert.ok(gate("tick", 1) > 0.9);
  });

  test("ticks faster than their gap are dropped", () => {
    const gate = createGate();
    gate("tick", 0);
    assert.equal(gate("tick", 0.01), 0);
  });

  test("a burst of many sounds is cut short", () => {
    const gate = createGate();
    const kinds = ["tap", "select", "toggle", "open", "copy", "snap", "page"] as const;
    const played = kinds.map((k, i) => gate(k, 5 + i * 0.01)).filter((g) => g > 0).length;
    assert.equal(played, 5);
  });

  test("the ear tires: a long run of typing gets softer, never below half, and recovers in the quiet", () => {
    const gate = createGate();
    let g = 1;
    for (let i = 0; i < 400; i++) g = gate(i % 2 ? "type" : "space", i * 0.12);
    assert.ok(g < 0.85, `softer after a long run: ${g}`);
    assert.ok(g >= 0.5, `never below half: ${g}`);
    assert.ok(gate("type", 400 * 0.12 + 30) > 0.95, "rested");
  });

  test("a big moment tires the ear more than a key", () => {
    const keys = createGate();
    const big = createGate();
    for (let i = 0; i < 6; i++) {
      keys("key", i * 0.5);
      big(i % 2 ? "seal" : "glass", i * 0.5);
    }
    assert.ok(big("open", 3.1) < keys("open", 3.1));
  });
});

/* ── a stand-in audio graph: enough of Web Audio to run the recipes and see what they schedule ── */

class Param {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime(v: number) {
    assert.ok(v > 0, "an exponential ramp needs a target above zero");
  }
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
}
class Node {
  connect() {}
}
class Gain extends Node {
  gain = new Param();
}
class Source extends Node {
  stops: number[];
  starts: number[];
  constructor(log: { starts: number[]; stops: number[] }) {
    super();
    this.starts = log.starts;
    this.stops = log.stops;
  }
  start(at = 0) {
    assert.ok(Number.isFinite(at));
    this.starts.push(at);
  }
  stop(at = 0) {
    assert.ok(Number.isFinite(at));
    this.stops.push(at);
  }
}
class Osc extends Source {
  type = "sine";
  frequency = new Param();
  detune = new Param();
}
class Buffer extends Source {
  buffer: unknown = null;
  loop = false;
}

function fakeContext() {
  const log = { starts: [] as number[], stops: [] as number[] };
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    destination: new Node(),
    createGain: () => new Gain(),
    createBiquadFilter: () => Object.assign(new Node(), { type: "lowpass", frequency: new Param(), Q: new Param() }),
    createDynamicsCompressor: () => Object.assign(new Node(), { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }),
    createDelay: () => Object.assign(new Node(), { delayTime: new Param() }),
    createStereoPanner: () => Object.assign(new Node(), { pan: new Param() }),
    createBuffer: (_c: number, n: number) => {
      const data = new Float32Array(n);
      return { duration: n / 8000, getChannelData: () => data };
    },
    createOscillator: () => new Osc(log),
    createBufferSource: () => new Buffer(log),
  };
  return { ctx: ctx as unknown as BaseAudioContext, log };
}

describe("the sounds", () => {
  const kinds = Object.keys(LENGTH) as SoundKind[];

  test("every sound plays, and is over within its length", () => {
    for (const kind of kinds) {
      for (const variant of [undefined, "laptop", "turntable", "shelf", "board", "tray", "window", "work", "writing"]) {
        for (const amount of [0, 0.5, 1]) {
          const { ctx, log } = fakeContext();
          const bus = panned(makeBus(ctx), 0.3);
          play(bus, kind, 1, { seed: 0.42, amount, variant });
          assert.ok(log.starts.length > 0, `${kind} makes a sound`);
          assert.ok(Math.min(...log.starts) >= 1, `${kind} never starts early`);
          const end = Math.max(...log.stops) - 1;
          assert.ok(end <= LENGTH[kind] + 0.05, `${kind} (${variant ?? "-"}, ${amount}) rings ${end.toFixed(3)}s, longer than its ${LENGTH[kind]}s`);
        }
      }
    }
  });

  test("nothing is long: the longest sound is under two seconds", () => {
    for (const [k, v] of Object.entries(LENGTH)) assert.ok(v > 0 && v < 2, k);
  });

  test("the same seed is the same sound; another seed, a slightly different one", () => {
    const run = (seed: number) => {
      const { ctx, log } = fakeContext();
      play(makeBus(ctx), "flap", 0, { seed });
      return log.starts.join(",");
    };
    assert.equal(run(0.3), run(0.3));
    assert.notEqual(run(0.3), run(0.8));
  });
});

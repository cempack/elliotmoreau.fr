/**
 * The sound gate (lib/sfx.ts): what keeps the UI sounds from getting
 * annoying.
 *
 *   npx tsx --conditions=react-server --test scripts/test/sound.test.ts
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createGate, LENGTH } from "@/lib/sfx";

describe("sound gate", () => {
  test("the same sound twice in a row is dropped, then allowed again", () => {
    const gate = createGate();
    assert.equal(gate("open", 1), 1);
    assert.equal(gate("open", 1.05), 0);
    assert.equal(gate("open", 1.2), 1);
  });

  test("different sounds at once both play", () => {
    const gate = createGate();
    assert.equal(gate("close", 2), 1);
    assert.equal(gate("launch", 2.001), 1);
  });

  test("fast ticks get quieter, never silent, and a pause brings them back", () => {
    const gate = createGate();
    assert.equal(gate("tick", 0), 1);
    const fast = gate("tick", 0.04);
    assert.ok(fast > 0 && fast < 1, `quieter: ${fast}`);
    assert.ok(gate("tick", 0.08) >= 0.35);
    assert.equal(gate("tick", 1), 1);
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

  test("every sound has a length", () => {
    for (const [k, v] of Object.entries(LENGTH)) assert.ok(v > 0 && v < 2, k);
  });
});

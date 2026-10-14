/**
 * The music panel's cassette: tape is conserved between the packs, a still
 * tape costs nothing (no next frame), a playing one wakes only as often as
 * its hubs visibly turn, and turning it over lands on side B and tells the
 * panel so.
 *
 *   npx tsx --test scripts/test/cassette.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCassette, reels, type Side } from "../../src/components/os/menubar/cassette/scene";
import { makeRaster } from "../../src/lib/pixel3d";

const label = (title: string) => ({ art: (n: number) => new Uint32Array(n * n).fill(0xff406080), title, sub: "M83" });

test("the packs hold the same tape between them, whatever has played", () => {
  const area = (f: number) => {
    const { left, right } = reels(f);
    return left * left + right * right;
  };
  for (const f of [0, 0.25, 0.5, 0.9, 1]) assert.ok(Math.abs(area(f) - area(0)) < 1e-6);
  assert.ok(reels(0).left > reels(0).right);
  assert.ok(reels(1).right > reels(1).left);
});

test("a still tape asks for no more frames; a playing one wakes a few times a second", () => {
  const R = makeRaster(118, 82);
  const sc = makeCassette(false);
  sc.setLabels(label("Midnight City"), label("On repeat"));
  sc.setClock({ pos: 240000, total: 240000, run: false }, 0);
  assert.equal(sc.frame(R, 0, 0), Infinity);
  assert.ok(R.c.some((c) => c !== 0), "it paints something");
  sc.setClock({ pos: 1000, total: 240000, run: true }, 1);
  const wait = sc.frame(R, 1, 0);
  assert.ok(wait >= 0.08 && wait <= 0.2, `wakes every ${wait}s`);
});

test("turning it over lands on side B and says so", () => {
  const R = makeRaster(118, 82);
  const seen: Side[] = [];
  const settled: Side[] = [];
  const sc = makeCassette(false, { side: (s) => seen.push(s), settle: (s) => settled.push(s) });
  sc.setLabels(label("Her"), label("On repeat"));
  sc.flip();
  let t = 0;
  for (let i = 0; i < 300 && sc.frame(R, t, 1 / 30) !== Infinity; i++) t += 1 / 30;
  assert.equal(sc.side(), "B");
  assert.deepEqual(seen, ["B"]);
  assert.deepEqual(settled, ["B"]);
  // and the switch back, without motion, is immediate
  const still = makeCassette(true);
  still.show("B");
  still.frame(R, 0, 0);
  assert.equal(still.side(), "B");
});

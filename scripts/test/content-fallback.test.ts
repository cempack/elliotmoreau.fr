/**
 * When the database can't be opened, reads serve the seed (pages keep
 * working) and writes fail loudly.
 *
 *   npx tsx --conditions=react-server --test scripts/test/content-fallback.test.ts
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// a "directory" that is a file: the database can never be created under it
const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "emos-fallback-")), "not-a-dir");
fs.writeFileSync(blocker, "");
process.env.DATABASE_PATH = path.join(blocker, "emos.db");

let c: typeof import("@/server/content");
let seed: typeof import("@/server/content/seed");

before(async () => {
  c = await import("@/server/content");
  seed = await import("@/server/content/seed");
});

test("reads fall back to the seed, logging once", () => {
  const logged: unknown[][] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    assert.deepEqual(c.getPlaces(), seed.seedPlaces());
    assert.deepEqual(c.getStatus(), seed.seedStatus());
    assert.deepEqual(c.getNowContent(), seed.seedNow());
    assert.deepEqual(c.getLive(), seed.seedLive());
    assert.equal(c.currentAway(), null);
    assert.equal(c.getSiteContent().places.length, 10);
  } finally {
    console.error = orig;
  }
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /database unavailable/);
});

test("writes throw instead of pretending", () => {
  assert.throws(() => c.setStatus({ replyDays: 2 }));
  assert.throws(() => c.deletePlace("japan"));
});

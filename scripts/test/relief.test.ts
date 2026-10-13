/**
 * The Atlas relief picks the land a place stands on: its own landmass or
 * island, with the smaller pieces of the same country that belong with it.
 *
 *   npx tsx --conditions=react-server --test scripts/test/relief.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

let relief: typeof import("@/server/relief");
const load = async () => (relief ??= await import("@/server/relief"));

const box = (land: NonNullable<ReturnType<typeof relief.landOf>>) => ({
  x0: Math.min(...land.polys.map((p) => p.x0)),
  x1: Math.max(...land.polys.map((p) => p.x1)),
  y0: Math.min(...land.polys.map((p) => p.y0)),
  y1: Math.max(...land.polys.map((p) => p.y1)),
});

test("France from Toulouse brings Corsica, not French Guiana", async () => {
  const { landOf } = await load();
  const land = landOf("FR", 43.6047, 1.4442)!;
  const b = box(land);
  assert.ok(b.x1 > 9.4, "Corsica's east coast is in");
  assert.ok(b.y0 > 41 && b.x0 > -6, "nothing overseas");
});

test("Northern Ireland comes without Great Britain or its isles", async () => {
  const { landOf } = await load();
  const b = box(landOf("GB", 54.7877, -6.4923)!);
  assert.ok(b.x1 < -5.3, `east edge ${b.x1}`);
  assert.ok(b.y1 < 55.5, `north edge ${b.y1}`);
});

test("the Canaries come as the islands", async () => {
  const { landOf } = await load();
  const land = landOf("ES", 28.2916, -16.6291)!;
  const b = box(land);
  assert.ok(land.polys.length >= 6, `${land.polys.length} islands`);
  assert.ok(b.x0 < -17.8 && b.x1 > -13.6, "El Hierro to Lanzarote");
  assert.ok(b.y1 < 30, "not mainland Spain");
});

test("a point at sea takes the nearest land; an unknown country has none", async () => {
  const { landOf } = await load();
  assert.ok(landOf("JP", 34, 136.5));
  assert.equal(landOf("ZZ", 0, 0), null);
});

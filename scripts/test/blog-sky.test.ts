/**
 * The Blog's skies: the sky over Toulouse lines up with the site's own sun,
 * the Pole Star stands at Toulouse's latitude, a daytime post's exposure
 * opens at sunset, and a picture paints with its foot dithered away.
 *
 *   npx tsx --test scripts/test/blog-sky.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Exposure, Sky, exposureStart, faceOf, skyAt } from "../../src/components/apps/writing/sky/render";
import { POLARIS } from "../../src/components/apps/writing/sky/catalog";
import { TOULOUSE, sunAt } from "../../src/lib/sun";

const R = Math.PI / 180;
const at = (iso: string) => Date.parse(iso);

test("the sun is where the site's own sun says it is", () => {
  for (const iso of ["2026-10-07T23:41:00+02:00", "2026-08-14T10:40:00+02:00", "2026-09-13T20:14:00+02:00", "2026-01-02T08:30:00+01:00"]) {
    const ms = at(iso);
    const ours = skyAt(ms);
    const site = sunAt(ms);
    assert.ok(Math.abs(ours.sunAlt - site.elevation) < 1, `${iso}: ${ours.sunAlt} vs ${site.elevation}`);
    const az = ((Math.atan2(ours.sunH[0], ours.sunH[1]) / R) + 360) % 360;
    const d = Math.abs(((az - site.azimuth + 540) % 360) - 180);
    assert.ok(d < 1.5, `${iso}: azimuth ${az} vs ${site.azimuth}`);
  }
});

test("the Pole Star stands at Toulouse's latitude, due north", () => {
  const sky = skyAt(at("2026-10-07T23:41:00+02:00"));
  const [ra, dec] = POLARIS;
  const e = [Math.cos(dec * R) * Math.cos(ra * R), Math.cos(dec * R) * Math.sin(ra * R), Math.sin(dec * R)];
  const M = sky.M;
  const h = [0, 1, 2].map((r) => M[r * 3] * e[0] + M[r * 3 + 1] * e[1] + M[r * 3 + 2] * e[2]);
  const alt = Math.asin(h[2]) / R;
  assert.ok(Math.abs(alt - TOULOUSE.lat) < 1, `Polaris at ${alt}°`);
  assert.ok(Math.abs(Math.atan2(h[0], h[1]) / R) < 2);
});

test("a daytime post's exposure opens at that evening's sunset; a night post's at its own minute", () => {
  const day = at("2026-08-14T10:40:00+02:00");
  const start = exposureStart(day);
  assert.ok(skyAt(start).sunAlt <= -0.8);
  assert.ok(skyAt(start - 5 * 60000).sunAlt > -0.8);
  const hours = (start - day) / 3600000;
  assert.ok(hours > 9 && hours < 11, `opens ${hours} h later`);
  const night = at("2026-10-07T23:41:00+02:00");
  assert.equal(exposureStart(night), night);
});

test("a picture paints, faces the same way every time, and its foot dithers into the glass", () => {
  const ms = at("2026-10-07T23:41:00+02:00");
  const face = faceOf("ricing-a-laptop", ms);
  assert.equal(face, faceOf("ricing-a-laptop", ms));
  const sky = new Sky({ fov: { h: 55 }, bottom: -2.5, moonR: 6, sunR: 3.5, stamp: true, offset: 14, fade: 12 });
  sky.size(200, 80);
  sky.set(ms, face);
  const out = new Uint32Array(200 * 80);
  sky.paint(out);
  const row = (y: number) => out.subarray(y * 200, (y + 1) * 200);
  // the sky is painted, opaque, up top
  assert.ok(row(2).every((px) => px >>> 24 === 255));
  // the last row is mostly glass
  assert.ok(row(79).filter((px) => px === 0).length > 150);
  // the amber stamp sits above the foot, on the right
  const amber = 0xff6bb8ff;
  assert.ok(out.slice(60 * 200, 68 * 200).some((px, i) => px === amber && i % 200 > 140));
});

test("the long exposure draws trails as the reading goes on", () => {
  const ms = at("2026-10-07T23:41:00+02:00");
  const sky = new Sky({ fov: { v: 30 }, bottom: -3, moonR: 4, sunR: 3, north: true });
  sky.size(70, 88);
  sky.set(ms, 0);
  const expo = new Exposure(sky);
  sky.trail = expo;
  expo.reset(ms, 7);
  const out = new Uint32Array(70 * 88);
  const bare = new Uint32Array(70 * 88);
  /** cells the trails changed, against the same sky without them */
  const traced = () => {
    sky.trail = null;
    sky.paint(bare);
    sky.trail = expo;
    sky.paint(out);
    return out.filter((px, i) => px !== bare[i]).length;
  };
  expo.advance(0);
  sky.ms = expo.at(0);
  assert.equal(traced(), 0);
  expo.advance(240);
  sky.ms = expo.at(240);
  // 7 minutes of reading is 4 h 40 of sky: long arcs round the pole
  assert.ok(traced() > 400, `${traced()} cells traced`);
  // going back takes the exposure back
  expo.advance(10);
  assert.equal(expo.step, 10);
});

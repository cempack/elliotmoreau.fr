/**
 * The Blog's skies: the sky over Toulouse lines up with the site's own sun,
 * the Pole Star stands at Toulouse's latitude, a daytime post's exposure
 * opens at sunset, a post's dome paints with its sky inside the glass and
 * its date on the plinth, and reading draws trails on the band and the dome.
 *
 *   npx tsx --test scripts/test/blog-sky.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Dome, Exposure, Sky, exposureStart, faceOf, skyAt } from "../../src/components/apps/writing/sky/render";
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

test("a dome paints: the sky on the back of the glass, the town in front, the date on the plinth", () => {
  const ms = at("2026-10-07T23:41:00+02:00");
  const face = faceOf("ricing-a-laptop", ms);
  assert.equal(face, faceOf("ricing-a-laptop", ms));
  const W = 220;
  const H = 110;
  const dome = new Dome({ stamp: true });
  dome.size(W, H);
  dome.set(ms, face);
  const out = new Uint32Array(W * H);
  dome.paint(out);
  // it stands on the card: the corners are clear
  assert.equal(out[0], 0);
  assert.equal(out[W * H - 1], 0);
  // the back of the glass shows a good stretch of sky, and the town stands in front of some of it
  const sky = dome.mask.reduce((n, m) => n + (m ? 0 : 1), 0);
  assert.ok(sky > 1500, `${sky} cells of sky`);
  assert.ok(sky < dome.scale * dome.scale * Math.PI * 0.5, "the town hides part of it");
  // the amber date on the plinth, under the middle
  const amber = 0xff6bb8ff;
  let stamp = 0;
  for (let y = Math.round(H * 0.6); y < H; y++) for (let x = Math.round(W * 0.3); x < W * 0.7; x++) if (out[y * W + x] === amber) stamp++;
  assert.ok(stamp > 30, `${stamp} amber cells`);
  // spinning it shows another part of the sky
  const before = out.slice();
  dome.turn(40);
  dome.paint(out);
  assert.ok(out.some((px, i) => px !== before[i]));
});

test("the long exposure draws trails as the reading goes on, on the band and on the dome", () => {
  const ms = at("2026-10-07T23:41:00+02:00");
  const band = new Sky({ fov: 30, bottom: -3, moonR: 4, sunR: 3 });
  band.size(70, 88);
  band.ms = ms;
  const dome = new Dome({ north: true, table: false, pitch: 0.22 });
  dome.size(70, 56);
  dome.set(ms, 0);
  for (const film of [band, dome]) {
    const { W, H } = film;
    const expo = new Exposure(film);
    film.trail = expo;
    expo.reset(ms, 7);
    const out = new Uint32Array(W * H);
    const bare = new Uint32Array(W * H);
    /** cells the trails changed, against the same sky without them */
    const traced = () => {
      film.trail = null;
      film.paint(bare);
      film.trail = expo;
      film.paint(out);
      return out.filter((px, i) => px !== bare[i]).length;
    };
    expo.advance(0);
    film.ms = expo.at(0);
    assert.equal(traced(), 0);
    expo.advance(240);
    film.ms = expo.at(240);
    // 7 minutes of reading is 4 h 40 of sky: long arcs round the pole
    assert.ok(traced() > (film === band ? 400 : 150), `${traced()} cells traced`);
    // going back takes the exposure back
    expo.advance(10);
    assert.equal(expo.step, 10);
  }
});

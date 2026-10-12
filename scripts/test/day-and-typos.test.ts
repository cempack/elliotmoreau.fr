/**
 * Typo forgiveness (one letter off a real path), places' time zones, and
 * Elliot's day (the battery and Away).
 *
 *   npx tsx --conditions=react-server --test scripts/test/day-and-typos.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest } from "../../src/components/apps/notfound/suggest";
import { elliotsDay } from "../../src/lib/day";
import { tzForPlace } from "../../src/lib/tz";
import type { Status } from "../../src/lib/content";

const posts = [{ slug: "ricing-a-laptop", title: "Ricing a laptop", url: "https://blog.elliotmoreau.fr/ricing-a-laptop/" }];

test("one letter off a real path is a certain typo", () => {
  const s = suggest("wrting", { posts, repos: [] });
  assert.equal(s?.kind, "app");
  assert.equal(s?.app, "writing");
  assert.equal(s?.certain, true);
  assert.equal(suggest("wrok")?.certain, true);
  assert.equal(suggest("atlass")?.certain, true);
});

test("aliases and far words still suggest, but never go by themselves", () => {
  assert.equal(suggest("blgo")?.app, "writing");
  assert.equal(suggest("blgo")?.certain, false);
  assert.equal(suggest("projects")?.app, "work");
  assert.equal(suggest("projects")?.certain, false);
  assert.equal(suggest("wrting/deeper")?.certain, false);
});

test("a post one letter off its real path goes to the post on the site", () => {
  const s = suggest("writing/ricng-a-laptop", { posts, repos: [] });
  assert.equal(s?.kind, "post");
  assert.equal(s?.kind === "post" && s.href, "/writing/ricing-a-laptop");
  assert.equal(s?.certain, true);
  assert.equal(suggest("blog/ricng-a-laptop", { posts, repos: [] })?.certain, false);
});

test("places get their real time zone", () => {
  assert.equal(tzForPlace({ iso: "JP", lat: 35.7, lon: 139.7 }), "Asia/Tokyo");
  assert.equal(tzForPlace({ iso: "ES", lat: 28.1, lon: -15.4 }), "Atlantic/Canary");
  assert.equal(tzForPlace({ iso: "ES", lat: 40.4, lon: -3.7 }), "Europe/Madrid");
  assert.equal(tzForPlace({ iso: "CA", lat: 49.3, lon: -123.1 }), "America/Vancouver");
  assert.equal(tzForPlace({ iso: "CA", lat: 45.5, lon: -73.6 }), "America/Toronto");
  assert.equal(tzForPlace({ iso: "US", lat: 40.7, lon: -74 }), "America/New_York");
  assert.equal(tzForPlace({ iso: "XX", lat: 0, lon: 135 }), "Etc/GMT-9");
});

const status: Status = { away: null, workHours: { start: "09:00", end: "18:30", days: [1, 2, 3, 4, 5], tz: "Europe/Paris" }, replyDays: 3 };
// Monday 12 October 2026, CEST (UTC+2)
const at = (hhmm: string, day = 12) => new Date(`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00+02:00`);

test("Elliot's day follows Toulouse time and the working hours", () => {
  assert.equal(elliotsDay(status, { at: at("02:14") }).phase, "asleep");
  assert.equal(elliotsDay(status, { at: at("02:14") }).charging, true);
  assert.equal(elliotsDay(status, { at: at("08:10") }).phase, "morning");
  assert.equal(elliotsDay(status, { at: at("08:10") }).level, 1);
  const desk = elliotsDay(status, { at: at("14:00"), playing: true });
  assert.equal(desk.phase, "desk");
  assert.equal(desk.bolt, true);
  assert.ok(desk.level < 1 && desk.level > 0.35);
  assert.equal(elliotsDay(status, { at: at("21:00") }).phase, "evening");
  // Saturday
  assert.equal(elliotsDay(status, { at: at("14:00", 17) }).phase, "weekend");
  assert.equal(elliotsDay(status, { at: at("14:00") }).time, "14:00");
});

test("away shows the city and its own time", () => {
  const d = elliotsDay(status, {
    at: at("08:51"),
    away: { placeId: "japan", place: { id: "japan", iso: "JP", lat: 35.7, lon: 139.7 } as never },
    awayName: "Japan",
  });
  assert.equal(d.phase, "away");
  assert.deepEqual(d.away, { city: "Japan", time: "15:51" });
});

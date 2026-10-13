/**
 * The visitor stats as the admin dashboard reads them: page views into
 * visits (half an hour without a page ends one), bounces and visit length,
 * first and last pages, the weekday-by-hour grid, the live feed, and the
 * filters (a column, or the visits that began at a source).
 *
 *   npx tsx --conditions=react-server --test scripts/test/stats.test.ts
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emos-stats-"));
Object.assign(process.env, {
  DATABASE_PATH: path.join(dir, "test.db"),
  SITE_URL: "https://elliotmoreau.fr",
  SESSION_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
});

type Stats = typeof import("../../src/server/stats");
type Db = typeof import("../../src/server/db");
let stats: Stats;
let db: Db["db"];

// Tuesday 13 Oct 2026, 14:00 in Toulouse (UTC+2)
const NOW = Date.parse("2026-10-13T12:00:00Z");
const MIN = 60_000;

type Row = { at: number; vid: string; path: string; ref?: string; country?: string; device?: string; entry?: boolean };
function insert(rows: Row[]) {
  const st = db().prepare(`INSERT INTO hits (at, day, vid, path, lang, ref, country, device, browser, os, entry) VALUES (?, ?, ?, ?, 'en', ?, ?, ?, 'Firefox', 'Linux', ?)`);
  for (const r of rows) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(r.at);
    st.run(r.at, day, r.vid, r.path, r.ref ?? "", r.country ?? "FR", r.device ?? "desktop", r.entry ? 1 : 0);
  }
}

before(async () => {
  stats = await import("../../src/server/stats");
  db = (await import("../../src/server/db")).db;
  insert([
    // a: two visits today (an hour apart): three pages, then one
    { at: NOW - 120 * MIN, vid: "a", path: "/", ref: "github.com", entry: true },
    { at: NOW - 118 * MIN, vid: "a", path: "/work" },
    { at: NOW - 110 * MIN, vid: "a", path: "/blog/x" },
    { at: NOW - 40 * MIN, vid: "a", path: "/now", entry: true },
    // b: one page from the US, on a phone, a minute ago
    { at: NOW - 1 * MIN, vid: "b", path: "/blog/x", country: "US", device: "phone", entry: true },
    // c: yesterday, two pages from a search
    { at: NOW - 26 * 60 * MIN, vid: "c", path: "/", ref: "google.com", entry: true },
    { at: NOW - 26 * 60 * MIN + 5 * MIN, vid: "c", path: "/atlas" },
  ]);
});

test("page views become visits: half an hour without a page ends one", () => {
  const s = stats.getStats(1, {}, NOW);
  assert.equal(s.totals.visitors, 2);
  assert.equal(s.totals.views, 5);
  assert.equal(s.totals.visits, 3);
  // a's second visit and b's are single pages
  assert.equal(s.totals.bounces, 2);
  assert.equal(s.totals.duration, 10 * MIN);
  // yesterday, for the comparison
  assert.deepEqual([s.previous.visitors, s.previous.views, s.previous.visits, s.previous.bounces], [1, 2, 1, 0]);
});

test("first and last pages of each visit", () => {
  const s = stats.getStats(1, {}, NOW);
  const e = Object.fromEntries(s.entries.map((r) => [r.key, r.visitors]));
  const x = Object.fromEntries(s.exits.map((r) => [r.key, r.visitors]));
  assert.deepEqual(e, { "/": 1, "/now": 1, "/blog/x": 1 });
  assert.deepEqual(x, { "/blog/x": 2, "/now": 1 });
});

test("the hours of today, and the weekday-by-hour grid (Toulouse time)", () => {
  const s = stats.getStats(1, {}, NOW);
  assert.equal(s.hours?.length, 24);
  // a's first visit began at 12:00, its second at 13:20, b's at 13:59
  assert.equal(s.hours?.[12].visits, 1);
  assert.equal(s.hours?.[13].visits, 2);
  assert.equal(s.previousHours?.[12].visits, 1);
  // Tuesday is row 1
  assert.equal(s.week[1 * 24 + 13], 2);
  assert.equal(s.week[1 * 24 + 12], 1);
});

test("a week's days come with the week before, the same length", () => {
  const s = stats.getStats(7, {}, NOW);
  assert.equal(s.days.length, 7);
  assert.equal(s.previousDays.length, 7);
  assert.equal(s.days[6].day, "2026-10-13");
  assert.equal(s.days[5].views, 2);
  assert.equal(s.totals.visitors, 3);
});

test("narrowed to a column: only those page views", () => {
  const s = stats.getStats(1, { country: "US" }, NOW);
  assert.equal(s.totals.visitors, 1);
  assert.equal(s.totals.views, 1);
  assert.deepEqual(s.pages.map((r) => r.key), ["/blog/x"]);
  assert.equal(s.recent.length, 1);
});

test("narrowed to a source: every page of the visits that began there", () => {
  const s = stats.getStats(7, { ref: "google.com" }, NOW);
  assert.equal(s.totals.visitors, 1);
  assert.equal(s.totals.views, 2);
  assert.deepEqual(s.pages.map((r) => r.key).sort(), ["/", "/atlas"]);
});

test("right now: the last five minutes, and the last half hour's pages with where their visit came from", () => {
  const s = stats.getStats(1, {}, NOW);
  assert.equal(s.live, 1);
  assert.deepEqual(
    s.recent.map((r) => r.path),
    ["/blog/x"]
  );
  const later = stats.getStats(1, {}, NOW - 39 * MIN);
  // a's /now page, 1 minute before that moment, its visit came straight in
  assert.equal(later.recent[0].path, "/now");
  assert.equal(later.recent[0].ref, "");
});

test("sources: where visits began", () => {
  const s = stats.getStats(7, {}, NOW);
  const r = Object.fromEntries(s.referrers.map((x) => [x.key, x.visitors]));
  assert.equal(r["github.com"], 1);
  assert.equal(r["google.com"], 1);
});

test("a filter from the panel keeps known dimensions and short strings only", () => {
  assert.deepEqual(stats.parseFilter({ country: "FR", nope: "x", path: 3, ref: "a".repeat(200) }), { country: "FR" });
  assert.deepEqual(stats.parseFilter("country=FR"), {});
});

test("the old /writing pages count as the Blog's", async () => {
  insert([{ at: NOW - 3 * MIN, vid: "d", path: "/writing/old-post", entry: true }]);
  const { statsMigrations } = await import("../../src/server/stats/schema");
  db().exec(statsMigrations.find((m) => m.id === "stats-002")!.up as string);
  const s = stats.getStats(1, {}, NOW);
  assert.ok(s.pages.some((r) => r.key === "/blog/old-post"));
  assert.ok(!s.pages.some((r) => r.key.startsWith("/writing")));
});

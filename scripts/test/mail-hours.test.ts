/**
 * "When it'll be read": the estimate from working hours, reply days and
 * away dates, in Toulouse time (including across the October DST change).
 *
 *   npx tsx --conditions=react-server --test scripts/test/mail-hours.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATUS, readEstimate, zonedInstant, type MailStatus } from "../../src/components/apps/contact/hours";

const at = (iso: string) => new Date(iso);
const S = DEFAULT_STATUS;
const away = (a: MailStatus["away"]): MailStatus => ({ ...S, away: a });

test("early on a working day: read from 09:00 today", () => {
  // Monday 12 Oct 2026, 07:25 in Toulouse (UTC+2)
  const e = readEstimate(at("2026-10-12T05:25:00Z"), S);
  assert.equal(e.state, "later");
  assert.equal(e.dayOffset, 0);
  assert.equal(e.readAt?.toISOString(), "2026-10-12T07:00:00.000Z");
  assert.equal(e.replyBy?.toISOString(), "2026-10-15T07:00:00.000Z");
});

test("during working hours: at his desk, read now", () => {
  const now = at("2026-10-12T12:00:00Z");
  const e = readEstimate(now, S);
  assert.equal(e.state, "desk");
  assert.equal(e.readAt?.getTime(), now.getTime());
  assert.equal(Math.round(e.nowHour * 60), 14 * 60);
});

test("after hours: tomorrow from 09:00", () => {
  const e = readEstimate(at("2026-10-12T17:00:00Z"), S); // 19:00 Toulouse
  assert.equal(e.state, "next");
  assert.equal(e.dayOffset, 1);
  assert.equal(e.readAt?.toISOString(), "2026-10-13T07:00:00.000Z");
});

test("18:15 is still the working day; 18:30 is not", () => {
  assert.equal(readEstimate(at("2026-10-12T16:15:00Z"), S).state, "desk");
  assert.equal(readEstimate(at("2026-10-12T16:30:00Z"), S).state, "next");
});

test("Friday evening and the weekend: Monday", () => {
  const fri = readEstimate(at("2026-10-16T18:00:00Z"), S);
  assert.equal(fri.state, "next");
  assert.equal(fri.dayOffset, 3);
  assert.equal(fri.readAt?.toISOString(), "2026-10-19T07:00:00.000Z");
  const sat = readEstimate(at("2026-10-17T08:00:00Z"), S);
  assert.ok(sat.cells.every((c) => c === 0), "no working hours on a Saturday");
  assert.equal(sat.readAt?.toISOString(), "2026-10-19T07:00:00.000Z");
});

test("the strip: 09:00 to 18:30, the last hour half lit", () => {
  const e = readEstimate(at("2026-10-12T10:00:00Z"), S);
  assert.deepEqual(e.cells.slice(8, 20), [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0]);
  assert.equal(e.cells.reduce((a, b) => a + b, 0), 9.5);
});

test("away until a date: read the next working day after it", () => {
  const e = readEstimate(at("2026-10-12T10:00:00Z"), away({ city: "Lisbon", to: "2026-10-20" }));
  assert.equal(e.state, "away");
  assert.equal(e.awayUntil, "2026-10-20");
  assert.equal(e.readAt?.toISOString(), "2026-10-21T07:00:00.000Z");
  assert.ok(e.cells.every((c) => c === 0), "no working hours while away");
});

test("away from a later date doesn't count yet; away in the past is over", () => {
  assert.equal(readEstimate(at("2026-10-12T10:00:00Z"), away({ from: "2026-10-20", to: "2026-10-25" })).state, "desk");
  assert.equal(readEstimate(at("2026-10-12T10:00:00Z"), away({ to: "2026-10-01" })).state, "desk");
});

test("away with no end date: no promise", () => {
  const e = readEstimate(at("2026-10-12T10:00:00Z"), away({ city: "Tokyo" }));
  assert.equal(e.state, "awayOpen");
  assert.equal(e.readAt, null);
  assert.equal(e.replyBy, null);
});

test("across the end of summer time (25 Oct 2026): 09:00 is 08:00 UTC again", () => {
  const e = readEstimate(at("2026-10-24T12:00:00Z"), S); // Saturday
  assert.equal(e.readAt?.toISOString(), "2026-10-26T08:00:00.000Z");
  assert.equal(zonedInstant(2026, 10, 25, 3 * 60, "Europe/Paris").toISOString(), "2026-10-25T02:00:00.000Z");
});

test("other hours, days and a one-day reply", () => {
  const s: MailStatus = { away: null, workHours: { start: "10:00", end: "16:00", days: [2, 4], tz: "Europe/Paris" }, replyDays: 1 };
  const e = readEstimate(at("2026-10-12T10:00:00Z"), s); // Monday
  assert.equal(e.state, "next");
  assert.equal(e.readAt?.toISOString(), "2026-10-13T08:00:00.000Z"); // Tuesday 10:00
  assert.equal(e.replyBy?.toISOString(), "2026-10-14T08:00:00.000Z");
});

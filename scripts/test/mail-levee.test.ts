/**
 * La levée: what Elliot's letterbox prints (the collection plate, the
 * window tab, the forwarding slip), in Toulouse time, UTC+2 in October.
 *
 *   npx tsx --conditions=react-server --test scripts/test/mail-levee.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATUS } from "../../src/components/apps/contact/hours";
import { boxLabel, daysLong, daysPlate, fitCaps, leveeView, readSentence, toCaps } from "../../src/components/apps/contact/levee";
import type { CurrentAway, PlaceRow } from "../../src/lib/content";

const at = (iso: string) => new Date(iso);
const S = DEFAULT_STATUS;
const japan: PlaceRow = {
  id: "japan",
  name: { en: "Japan", fr: "Japon" },
  region: { en: "Asia", fr: "Asie" },
  lat: 36.2,
  lon: 138.25,
  status: "want",
  home: false,
  iso: "JP",
  continent: "asia",
  sort: 1,
};
const tab = (v: ReturnType<typeof leveeView>) => [v.tab.word, v.tab.digits];

test("the plate is the working hours", () => {
  assert.deepEqual(leveeView(at("2026-10-12T10:00:00Z"), S, null).plate, ["LEVEES", "LUN-VEN", "09:00-18:30"]);
  const early = { ...S, workHours: { ...S.workHours, start: "9:00" } };
  assert.equal(leveeView(at("2026-10-12T10:00:00Z"), early, null).plate[2], "09:00-18:30");
});

test("the tab: the next collection, as the post prints it", () => {
  // Monday 12 Oct 2026
  assert.deepEqual(tab(leveeView(at("2026-10-12T05:25:00Z"), S, null)), ["AUJOURD'HUI", "09:00"]); // 07:25
  assert.deepEqual(tab(leveeView(at("2026-10-12T10:00:00Z"), S, null)), ["JUSQU'A", "18:30"]); // 12:00
  assert.deepEqual(tab(leveeView(at("2026-10-12T16:13:00Z"), S, null)), ["JUSQU'A", "18:30"]); // 18:13, still at his desk
  assert.deepEqual(tab(leveeView(at("2026-10-12T16:45:00Z"), S, null)), ["DEMAIN", "09:00"]); // 18:45
  // Friday 16 Oct, 19:00: Monday
  assert.deepEqual(tab(leveeView(at("2026-10-16T17:00:00Z"), S, null)), ["LUNDI", "09:00"]);
  const v = leveeView(at("2026-10-12T16:45:00Z"), S, null);
  assert.equal(v.slip, null);
  assert.equal(v.tab.key, "next|DEMAIN|09:00");
});

test("away until a date: the first collection after it, and a forwarding slip", () => {
  const away: CurrentAway = { placeId: "japan", to: "2026-10-20", place: japan };
  const v = leveeView(at("2026-10-12T16:13:00Z"), { ...S, away }, away);
  assert.equal(v.est.state, "away");
  assert.deepEqual(tab(v), ["MER 21.10", "09:00"]);
  assert.deepEqual(v.slip, { place: "JAPON", until: "JUSQU'AU 20.10" });
});

test("away with no end date: no collection to print", () => {
  const away: CurrentAway = { placeId: "japan", place: japan };
  const v = leveeView(at("2026-10-12T16:13:00Z"), { ...S, away }, away);
  assert.deepEqual(tab(v), ["", "--:--"]);
  assert.deepEqual(v.slip, { place: "JAPON", until: null });
  const city = leveeView(at("2026-10-12T16:13:00Z"), S, { city: "Nouvelle-Zélande" });
  assert.equal(city.slip?.place, "NOUVELLE-ZELANDE");
});

test("a trip dated on an Atlas place counts while status.away is null", () => {
  const trip: CurrentAway = { placeId: "japan", from: "2026-10-10", to: "2026-10-20", place: japan };
  const v = leveeView(at("2026-10-12T10:00:00Z"), S, trip);
  assert.equal(v.est.state, "away");
  assert.deepEqual(tab(v), ["MER 21.10", "09:00"]);
  assert.equal(v.slip?.until, "JUSQU'AU 20.10");
  const w = { desk: "", later: "", next: "", away: "Away until {date}: likely read {day} from {time}.", awayOpen: "", local: "{time} your time", tomorrow: "tomorrow", onDay: "on {day}" };
  assert.equal(
    readSentence(v.est, { lang: "en", tz: "Europe/Paris", mine: "America/New_York", w }),
    "Away until 20 October: likely read on Wednesday from 09:00 (03:00 your time)."
  );
});

test("daysPlate: runs joined, singles apart", () => {
  assert.equal(daysPlate([1, 2, 3, 4, 5], 46), "LUN-VEN");
  assert.equal(daysPlate([1, 2, 3, 5], 46), "LUN-MER VEN");
  assert.equal(daysPlate([1, 3, 5], 46), "LUN MER VEN");
  assert.equal(daysPlate([5, 4, 3, 2, 1, 7, 6], 46), "LUN-DIM");
  assert.equal(daysPlate([1, 3, 5, 7], 46), "LU ME VE DI");
});

test("caps: accents folded, cut where it reads", () => {
  assert.equal(toCaps("Nouvelle-Zélande"), "NOUVELLE-ZELANDE");
  assert.equal(toCaps("Œland & co"), "OELAND CO");
  assert.equal(fitCaps("NOUVELLE-ZELANDE", 40), "NOUVELLE");
  assert.equal(fitCaps("JAPON", 30), "JAPON");
  assert.equal(fitCaps("ABCDEFGHIJ", 15), "ABCD");
});

test("the label says it in words", () => {
  const b = { label: "Elliot’s letterbox in Toulouse, collected {days} from {start} to {end}.", labelAway: "Forwarded to {place} until {date}.", labelAwayOpen: "Forwarded to {place} for now.", range: "{a} to {b}", inBox: "" };
  const v = leveeView(at("2026-10-12T10:00:00Z"), S, null);
  assert.equal(boxLabel(v, { lang: "en", b, away: null, hours: S.workHours }), "Elliot’s letterbox in Toulouse, collected Monday to Friday from 09:00 to 18:30.");
  assert.equal(daysLong([1, 2, 3, 4, 5], "fr", { range: "du {a} au {b}" }), "du lundi au vendredi");
  assert.equal(daysLong([1, 3], "en", b), "Monday and Wednesday");
  const away: CurrentAway = { placeId: "japan", to: "2026-10-20", place: japan };
  const va = leveeView(at("2026-10-12T10:00:00Z"), { ...S, away }, away);
  assert.equal(boxLabel(va, { lang: "en", b, away, hours: S.workHours }), "Forwarded to Japan until 20 October.");
});

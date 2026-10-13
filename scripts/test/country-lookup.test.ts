/**
 * The Travels editor's country lookup finds what's typed, in either
 * language, with or without accents, by code or by another name, and a
 * pick fills the place in the way the hand-made places are written.
 *
 *   npx tsx --test scripts/test/country-lookup.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES } from "../../src/components/apps/admin/countries";
import { findCountries, fromCountry, placeFor } from "../../src/components/apps/admin/findCountry";
import { CONTINENTS, type PlaceRow } from "../../src/lib/content";

const first = (q: string, lang: "en" | "fr" = "en") => findCountries(q, lang)[0]?.[0];

test("every country is well formed", () => {
  assert.equal(COUNTRIES.length, 250);
  assert.equal(new Set(COUNTRIES.map((c) => c[0])).size, 250);
  for (const [iso, en, fr, lat, lon, continent] of COUNTRIES) {
    assert.match(iso, /^[A-Z]{2}$/);
    assert.ok(en && fr, iso);
    assert.ok(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180, iso);
    assert.ok((CONTINENTS as readonly string[]).includes(continent), iso);
  }
});

test("names in either language, accents optional", () => {
  assert.equal(first("japan"), "JP");
  assert.equal(first("japon", "fr"), "JP");
  assert.equal(first("etats"), "US");
  assert.equal(first("États-Unis", "fr"), "US");
  assert.equal(first("norvege"), "NO");
  assert.equal(first("cote d'ivoire"), "CI");
  assert.equal(first("côte d’ivoire"), "CI");
});

test("codes and other names", () => {
  assert.equal(first("jp"), "JP");
  assert.equal(first("USA"), "US");
  assert.equal(first("uk"), "GB");
  assert.deepEqual(findCountries("korea", "en").slice(0, 2).map((c) => c[0]).sort(), ["KP", "KR"]);
});

test("a whole name beats a longer one it starts", () => {
  assert.equal(first("ireland"), "IE");
  assert.equal(first("niger"), "NE");
  assert.equal(first("guinea"), "GN");
  assert.equal(first("guin"), "GN");
  assert.equal(first("guin", "fr"), "GN");
  assert.equal(first("allemagne"), "DE");
});

test("nothing typed, nothing found; at most eight", () => {
  assert.deepEqual(findCountries("  ", "en"), []);
  assert.deepEqual(findCountries("zzzz", "en"), []);
  assert.ok(findCountries("a", "en").length <= 8);
});

test("a pick fills the place as the hand-made ones read", () => {
  const ru = COUNTRIES.find((c) => c[0] === "RU")!;
  assert.deepEqual(fromCountry(ru), {
    name: { en: "Russia", fr: "Russie" },
    region: { en: "europe", fr: "europe" },
    lat: 60,
    lon: 100,
    iso: "RU",
    continent: "europe",
  });
  const br = COUNTRIES.find((c) => c[0] === "BR")!;
  assert.deepEqual(fromCountry(br).region, { en: "south america", fr: "amérique du sud" });
  const mx = COUNTRIES.find((c) => c[0] === "MX")!;
  assert.equal(fromCountry(mx).continent, "north-america");
});

test("a country already on the Atlas is found, by slug or by name", () => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const place = (id: string, en: string, fr: string) => ({ id, name: { en, fr } }) as PlaceRow;
  const us = COUNTRIES.find((c) => c[0] === "US")!;
  const ie = COUNTRIES.find((c) => c[0] === "IE")!;
  assert.equal(placeFor(us, [place("usa", "United States", "États-Unis")], slug)?.id, "usa");
  assert.equal(placeFor(ie, [place("ireland", "Eire", "Eire")], slug)?.id, "ireland");
  assert.equal(placeFor(ie, [place("northern-ireland", "Northern Ireland", "Irlande du Nord")], slug), undefined);
});

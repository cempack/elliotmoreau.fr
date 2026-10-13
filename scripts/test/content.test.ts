/**
 * Content API: seed, validation, home rules, Away by dates, reorder.
 *
 *   npx tsx --conditions=react-server --test scripts/test/content.test.ts
 *
 * Runs against a fresh SQLite file in the OS temp dir (DATABASE_PATH is set
 * before the modules load, since env.ts reads it once).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PlaceRow } from "@/lib/content";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emos-content-"));
process.env.DATABASE_PATH = path.join(dir, "emos.db");

let c: typeof import("@/server/content");
let core: typeof import("@/server/db");
let seed: typeof import("@/server/content/seed");
let schema: typeof import("@/server/content/schema");

before(async () => {
  core = await import("@/server/db");
  c = await import("@/server/content");
  seed = await import("@/server/content/seed");
  schema = await import("@/server/content/schema");
});

after(() => {
  core.db().close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const place = (over: Partial<PlaceRow> = {}): PlaceRow => ({
  id: "iceland",
  name: { en: "Iceland", fr: "Islande" },
  region: { en: "europe", fr: "europe" },
  lat: 64.9631,
  lon: -19.0208,
  status: "want",
  home: false,
  iso: "IS",
  continent: "europe",
  sort: 20,
  ...over,
});

/** asserts a ContentError naming `field` */
function rejects(fn: () => unknown, field: string) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof c.ContentError, `expected ContentError, got ${String(err)}`);
    assert.equal(err.field, field);
    return true;
  });
}

const ids = () => c.getPlaces().map((p) => p.id);
const homes = () => c.getPlaces().filter((p) => p.home);

describe("seed", () => {
  test("an empty database is filled from the seed files", () => {
    assert.deepEqual(c.getPlaces(), seed.seedPlaces());
    assert.equal(c.getPlaces().length, 10);
    assert.deepEqual(c.getStatus(), seed.seedStatus());
    assert.deepEqual(c.getNowContent(), seed.seedNow());
    assert.deepEqual(c.getLive(), seed.seedLive());
  });

  test("seed order is home, been, want and keeps FACTS and notes", () => {
    const ps = c.getPlaces();
    assert.equal(ps[0].id, "france");
    assert.equal(ps[0].home, true);
    assert.deepEqual(
      ps.map((p) => p.status),
      ["been", "been", "been", "been", "been", "been", "want", "want", "want", "want"]
    );
    const ni = ps.find((p) => p.id === "northern-ireland")!;
    assert.equal(ni.iso, "GB");
    assert.equal(ni.continent, "europe");
    assert.equal(ps.find((p) => p.id === "canaries")!.iso, "ES");
    assert.equal(ps.find((p) => p.id === "japan")!.note?.fr, "En tête de liste : les trains, la cuisine, les villes.");
  });

  test("seeding again changes nothing", () => {
    const before = c.getPlaces();
    schema.contentSeed(core.db());
    schema.contentSeed(core.db());
    assert.deepEqual(c.getPlaces(), before);
  });

  test("reads return copies: mutating one doesn't touch the next", () => {
    const now = c.getNowContent();
    now.setup.length = 0;
    assert.ok(c.getNowContent().setup.length > 0);
    const s = seed.seedPlaces();
    s[0].name.en = "changed";
    assert.equal(seed.seedPlaces()[0].name.en, "France");
  });
});

describe("upsertPlace", () => {
  test("adds a place in its group, and updates it in place", () => {
    c.upsertPlace(place());
    assert.equal(ids().at(-1), "iceland");
    c.upsertPlace(place({ status: "been", sort: 99, note: { en: "Hot springs.", fr: "Des sources chaudes." }, visited: "2025" }));
    const got = c.getPlaces().find((p) => p.id === "iceland")!;
    assert.equal(got.status, "been");
    assert.equal(got.visited, "2025");
    assert.deepEqual(got.note, { en: "Hot springs.", fr: "Des sources chaudes." });
    // last of the been group, before the first want
    assert.equal(ids().indexOf("iceland"), ids().indexOf("japan") - 1);
  });

  test("trims text, uppercases the ISO code and drops unknown fields", () => {
    c.upsertPlace({ ...place({ id: "faroe", name: { en: "  Faroe Islands ", fr: "Îles Féroé" }, iso: "fo" }), extra: "x" } as PlaceRow);
    const got = c.getPlaces().find((p) => p.id === "faroe")!;
    assert.equal(got.name.en, "Faroe Islands");
    assert.equal(got.iso, "FO");
    assert.equal("extra" in got, false);
    c.deletePlace("faroe");
  });

  test("rejects bad input, naming the field", () => {
    rejects(() => c.upsertPlace(place({ id: "Not A Slug" })), "id");
    rejects(() => c.upsertPlace(place({ id: "" })), "id");
    rejects(() => c.upsertPlace(place({ lat: 91 })), "lat");
    rejects(() => c.upsertPlace(place({ lon: Number.NaN })), "lon");
    rejects(() => c.upsertPlace(place({ name: { en: "", fr: "Islande" } })), "name.en");
    rejects(() => c.upsertPlace(place({ name: { en: "Ice\nland", fr: "Islande" } })), "name.en");
    rejects(() => c.upsertPlace(place({ iso: "ISL" })), "iso");
    rejects(() => c.upsertPlace(place({ continent: "atlantis" as PlaceRow["continent"] })), "continent");
    rejects(() => c.upsertPlace(place({ status: "maybe" as PlaceRow["status"] })), "status");
    rejects(() => c.upsertPlace(place({ home: true, status: "want" })), "status");
    rejects(() => c.upsertPlace(place({ tripFrom: "2026-11-01" })), "tripTo");
    rejects(() => c.upsertPlace(place({ tripFrom: "2026-11-10", tripTo: "2026-11-01" })), "tripTo");
    rejects(() => c.upsertPlace(place({ tripFrom: "2026-02-30", tripTo: "2026-03-02" })), "tripFrom");
    rejects(() => c.upsertPlace(place({ sort: 1.5 })), "sort");
    rejects(() => c.upsertPlace(null as unknown as PlaceRow), "place");
    // nothing half-written
    assert.equal(c.getPlaces().find((p) => p.id === "iceland")!.lat, 64.9631);
  });

  test("a new home takes the flag from the old one; home can't be un-homed", () => {
    rejects(() => c.upsertPlace({ ...c.getPlaces()[0], home: false }), "home");
    const spain = c.getPlaces().find((p) => p.id === "spain")!;
    c.upsertPlace({ ...spain, home: true });
    assert.deepEqual(homes().map((p) => p.id), ["spain"]);
    assert.equal(ids()[0], "spain");
    const france = c.getPlaces().find((p) => p.id === "france")!;
    c.upsertPlace({ ...france, home: true });
    assert.deepEqual(homes().map((p) => p.id), ["france"]);
  });
});

describe("deletePlace", () => {
  test("refuses to delete home", () => {
    rejects(() => c.deletePlace("france"), "home");
    assert.ok(ids().includes("france"));
  });

  test("deletes another place; an unknown id is a no-op", () => {
    c.deletePlace("iceland");
    assert.equal(ids().includes("iceland"), false);
    c.deletePlace("nowhere");
    assert.equal(ids().length, 10);
  });

  test("an away pointing at it keeps its city, or ends", () => {
    c.upsertPlace(place());
    c.setStatus({ away: { placeId: "iceland", city: "Reykjavík" } });
    c.deletePlace("iceland");
    assert.deepEqual(c.getStatus().away, { city: "Reykjavík" });
    c.upsertPlace(place());
    c.setStatus({ away: { placeId: "iceland" } });
    c.deletePlace("iceland");
    assert.equal(c.getStatus().away, null);
  });
});

describe("currentAway", () => {
  const at = (iso: string) => new Date(iso);

  test("nobody's away by default", () => {
    assert.equal(c.currentAway(at("2026-10-12T12:00:00Z")), null);
  });

  test("a place whose trip dates include today", () => {
    const japan = c.getPlaces().find((p) => p.id === "japan")!;
    c.upsertPlace({ ...japan, tripFrom: "2026-11-02", tripTo: "2026-11-16" });
    assert.equal(c.currentAway(at("2026-11-01T12:00:00Z")), null);
    const a = c.currentAway(at("2026-11-02T08:00:00Z"));
    assert.equal(a?.placeId, "japan");
    assert.equal(a?.place?.name.en, "Japan");
    assert.equal(a?.from, "2026-11-02");
    assert.equal(c.currentAway(at("2026-11-16T20:00:00Z"))?.placeId, "japan");
    // 23:30 UTC on the 16th is already the 17th in Toulouse: back home
    assert.equal(c.currentAway(at("2026-11-16T23:30:00Z")), null);
  });

  test("overlapping trips: the latest start wins; home's own dates never count", () => {
    const norway = c.getPlaces().find((p) => p.id === "norway")!;
    c.upsertPlace({ ...norway, tripFrom: "2026-11-10", tripTo: "2026-11-12" });
    assert.equal(c.currentAway(at("2026-11-11T12:00:00Z"))?.placeId, "norway");
    const france = c.getPlaces().find((p) => p.id === "france")!;
    c.upsertPlace({ ...france, tripFrom: "2026-12-01", tripTo: "2026-12-05" });
    assert.equal(c.currentAway(at("2026-12-02T12:00:00Z")), null);
  });

  test("a hand-set away wins while its dates hold, then trips count again", () => {
    c.setStatus({ away: { city: "Lisbon", tz: "Europe/Lisbon", from: "2026-11-05", to: "2026-11-08" } });
    assert.equal(c.currentAway(at("2026-11-06T12:00:00Z"))?.city, "Lisbon");
    assert.equal(c.currentAway(at("2026-11-06T12:00:00Z"))?.place, undefined);
    assert.equal(c.currentAway(at("2026-11-09T12:00:00Z"))?.placeId, "japan");
    c.setStatus({ away: { placeId: "canada" } });
    const a = c.currentAway(at("2027-01-01T12:00:00Z"));
    assert.equal(a?.place?.id, "canada");
    c.setStatus({ away: null });
    assert.equal(c.currentAway(at("2027-01-01T12:00:00Z")), null);
  });

  test("getSiteContent resolves it for the render", () => {
    assert.equal(c.getSiteContent(at("2026-11-03T12:00:00Z")).away?.placeId, "japan");
    assert.equal(c.getSiteContent(at("2027-03-01T12:00:00Z")).away, null);
  });
});

describe("reorderPlaces", () => {
  test("listed ids first, in order; the rest keep their order after", () => {
    c.reorderPlaces(["norway", "japan"]);
    const want = c.getPlaces().filter((p) => p.status === "want").map((p) => p.id);
    assert.deepEqual(want, ["norway", "japan", "usa", "south-africa"]);
    c.reorderPlaces(["spain", "canada"]);
    const been = c.getPlaces().filter((p) => p.status === "been" && !p.home).map((p) => p.id);
    assert.deepEqual(been, ["spain", "canada", "ireland", "northern-ireland", "canaries"]);
    // home stays first whatever its sort
    assert.equal(ids()[0], "france");
  });

  test("rejects unknown and repeated ids, changing nothing", () => {
    const before = ids();
    rejects(() => c.reorderPlaces(["japan", "atlantis"]), "ids");
    rejects(() => c.reorderPlaces(["japan", "japan"]), "ids");
    rejects(() => c.reorderPlaces("japan" as unknown as string[]), "ids");
    assert.deepEqual(ids(), before);
  });
});

describe("status, now and live", () => {
  test("setStatus merges and validates", () => {
    c.setStatus({ replyDays: 2 });
    assert.equal(c.getStatus().replyDays, 2);
    c.setStatus({ workHours: { start: "08:30", end: "17:00", days: [5, 1, 2], tz: "Europe/Paris" } });
    assert.deepEqual(c.getStatus().workHours.days, [1, 2, 5]);
    assert.equal(c.getStatus().replyDays, 2);
    rejects(() => c.setStatus({ replyDays: 31 }), "replyDays");
    rejects(() => c.setStatus({ replyDays: 1.5 }), "replyDays");
    rejects(() => c.setStatus({ workHours: { start: "18:00", end: "09:00", days: [1], tz: "Europe/Paris" } }), "workHours.end");
    rejects(() => c.setStatus({ workHours: { start: "9:00", end: "18:00", days: [1], tz: "Europe/Paris" } }), "workHours.start");
    rejects(() => c.setStatus({ workHours: { start: "09:00", end: "18:00", days: [], tz: "Europe/Paris" } }), "workHours.days");
    rejects(() => c.setStatus({ workHours: { start: "09:00", end: "18:00", days: [8], tz: "Europe/Paris" } }), "workHours.days[0]");
    rejects(() => c.setStatus({ workHours: { start: "09:00", end: "18:00", days: [1], tz: "Mars/Olympus" } }), "workHours.tz");
    rejects(() => c.setStatus({ away: { placeId: "atlantis" } }), "away.placeId");
    rejects(() => c.setStatus({ away: {} }), "away");
    rejects(() => c.setStatus({ away: { city: "Oslo", from: "2026-01-10", to: "2026-01-01" } }), "away.to");
    assert.equal(c.getStatus().replyDays, 2);
  });

  test("setNowContent round-trips and validates", () => {
    const now = c.getNowContent();
    c.setNowContent({ ...now, updated: "2026-10-12", reading: [{ title: "Dune", author: "Frank Herbert", status: "reading" }] });
    assert.equal(c.getNowContent().updated, "2026-10-12");
    assert.equal(c.getNowContent().reading[0].title, "Dune");
    rejects(() => c.setNowContent({ ...now, updated: "12/10/2026" }), "updated");
    rejects(() => c.setNowContent({ ...now, focus: { ...now.focus, url: "javascript:alert(1)" } }), "focus.url");
    rejects(
      () => c.setNowContent({ ...now, reading: [{ title: "X", author: "Y", status: "skimming" as "reading" }] }),
      "reading[0].status"
    );
    rejects(() => c.setNowContent({ ...now, setup: [{ key: { en: "OS", fr: "" }, value: "Arch" }] }), "setup[0].key.fr");
  });

  test("setLive merges, clears and validates", () => {
    c.setLive({ hiddenRepos: ["dotfiles", "Dotfiles", "scratch"], showSpotify: false });
    assert.deepEqual(c.getLive().hiddenRepos, ["dotfiles", "scratch"]);
    assert.equal(c.getLive().featuredRepo, "omarchy-dos-moos-theme");
    c.setLive({ featuredRepo: "", pinnedPost: "hello-world" });
    assert.equal(c.getLive().featuredRepo, undefined);
    assert.equal(c.getLive().pinnedPost, "hello-world");
    assert.equal(c.getLive().showSpotify, false);
    rejects(() => c.setLive({ featuredRepo: "../etc/passwd" }), "featuredRepo");
    rejects(() => c.setLive({ pinnedPost: "Hello World" }), "pinnedPost");
    rejects(() => c.setLive({ showSpotify: "yes" as unknown as boolean }), "showSpotify");
  });

  test("a stored document that no longer validates reads as its seed", () => {
    core.db().prepare(`UPDATE kv SET value = ? WHERE key = 'status'`).run(JSON.stringify({ replyDays: "soon" }));
    assert.deepEqual(c.getStatus(), seed.seedStatus());
    // and the next valid write repairs it
    c.setStatus({ replyDays: 4 });
    assert.equal(c.getStatus().replyDays, 4);
  });
});

describe("projects", () => {
  test("seeded from the hand-written notes, with no order", () => {
    const p = c.getProjects();
    assert.equal(p.notes.euclide?.kind, "app");
    assert.deepEqual(p.order, []);
  });

  test("notes and order round-trip, keys and order lowercased, duplicates dropped", () => {
    c.setProjects({
      notes: { Euclide: { kind: "lab", title: "  Euclide  ", plain: { en: "A desk.", fr: "Un bureau." } } },
      order: ["CAI-Monitoring", "euclide", "cai-monitoring"],
    });
    const p = c.getProjects();
    assert.deepEqual(p.notes.euclide, { kind: "lab", title: "Euclide", plain: { en: "A desk.", fr: "Un bureau." } });
    assert.deepEqual(p.order, ["cai-monitoring", "euclide"]);
    assert.equal(c.getSiteContent().projects.order[0], "cai-monitoring");
  });

  test("an empty title or sentence means not set", () => {
    c.setProjects({ notes: { omapods: { kind: "desktop", title: "", plain: { en: "", fr: "" } } }, order: [] });
    assert.deepEqual(c.getProjects().notes.omapods, { kind: "desktop" });
  });

  test("an unknown shelf or a bad repo name is refused", () => {
    rejects(() => c.setProjects({ notes: { euclide: { kind: "boat" as never } }, order: [] }), "notes.euclide.kind");
    rejects(() => c.setProjects({ notes: {}, order: ["not a repo"] }), "order[0]");
  });
});

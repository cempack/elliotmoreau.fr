import type Database from "better-sqlite3";
import type { Continent, PlaceRow } from "@/lib/content";

/** How a place is stored: one column per language, 0/1 for home, NULL for unset. */
export type PlaceDbRow = {
  id: string;
  name_en: string;
  name_fr: string;
  region_en: string;
  region_fr: string;
  lat: number;
  lon: number;
  status: "been" | "want";
  home: 0 | 1;
  iso: string;
  continent: Continent;
  note_en: string | null;
  note_fr: string | null;
  visited: string | null;
  trip_from: string | null;
  trip_to: string | null;
  sort: number;
  updated_at: string;
};

/** Home, then been, then want; each by sort, then insertion order. */
export const PLACE_ORDER = `ORDER BY home DESC, CASE status WHEN 'been' THEN 0 ELSE 1 END, sort, rowid`;

export function fromDb(r: PlaceDbRow): PlaceRow {
  const p: PlaceRow = {
    id: r.id,
    name: { en: r.name_en, fr: r.name_fr },
    region: { en: r.region_en, fr: r.region_fr },
    lat: r.lat,
    lon: r.lon,
    status: r.status,
    home: r.home === 1,
    iso: r.iso,
    continent: r.continent,
    sort: r.sort,
  };
  if (r.note_en != null || r.note_fr != null) p.note = { en: r.note_en ?? "", fr: r.note_fr ?? "" };
  if (r.visited) p.visited = r.visited;
  if (r.trip_from && r.trip_to) {
    p.tripFrom = r.trip_from;
    p.tripTo = r.trip_to;
  }
  return p;
}

/** Insert or replace one (already validated) place. */
export function writePlace(d: Database.Database, p: PlaceRow, at: string) {
  d.prepare(
    `INSERT INTO places (id, name_en, name_fr, region_en, region_fr, lat, lon, status, home, iso, continent,
                         note_en, note_fr, visited, trip_from, trip_to, sort, updated_at)
     VALUES (@id, @name_en, @name_fr, @region_en, @region_fr, @lat, @lon, @status, @home, @iso, @continent,
             @note_en, @note_fr, @visited, @trip_from, @trip_to, @sort, @updated_at)
     ON CONFLICT (id) DO UPDATE SET
       name_en = excluded.name_en, name_fr = excluded.name_fr,
       region_en = excluded.region_en, region_fr = excluded.region_fr,
       lat = excluded.lat, lon = excluded.lon, status = excluded.status, home = excluded.home,
       iso = excluded.iso, continent = excluded.continent,
       note_en = excluded.note_en, note_fr = excluded.note_fr, visited = excluded.visited,
       trip_from = excluded.trip_from, trip_to = excluded.trip_to,
       sort = excluded.sort, updated_at = excluded.updated_at`
  ).run({
    id: p.id,
    name_en: p.name.en,
    name_fr: p.name.fr,
    region_en: p.region.en,
    region_fr: p.region.fr,
    lat: p.lat,
    lon: p.lon,
    status: p.status,
    home: p.home ? 1 : 0,
    iso: p.iso,
    continent: p.continent,
    note_en: p.note?.en ?? null,
    note_fr: p.note?.fr ?? null,
    visited: p.visited ?? null,
    trip_from: p.tripFrom ?? null,
    trip_to: p.tripTo ?? null,
    sort: p.sort,
    updated_at: at,
  });
}

/** Store one key of the kv table (JSON). */
export function writeKv(d: Database.Database, key: string, value: unknown, at: string, onlyIfMissing = false) {
  d.prepare(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO ${onlyIfMissing ? "NOTHING" : "UPDATE SET value = excluded.value, updated_at = excluded.updated_at"}`
  ).run(key, JSON.stringify(value), at);
}

export function readKv(d: Database.Database, key: string): unknown {
  const row = d.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : undefined;
}

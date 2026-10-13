import type { Migration, Seed } from "../db/types";
import { writeKv, writePlace } from "./rows";
import { seedLive, seedNow, seedPlaces, seedProjects, seedStatus } from "./seed";

/**
 * Content tables, owned by the content module.
 *
 * places: the Atlas, one row per place. Exactly one home (a partial unique
 *   index allows a single home = 1; the API keeps one set). Trip dates are
 *   inclusive calendar days and drive "Away".
 * kv: small JSON documents edited as a whole: `status` (away, working
 *   hours, reply days), `now` (the /now page), `live` (overrides on the
 *   live data: featured and hidden repos, pinned post, Spotify) and
 *   `projects` (each repo's plain-words note, and their order).
 */
export const contentMigrations: Migration[] = [
  {
    id: "content-001",
    up: `
      CREATE TABLE places (
        id         TEXT PRIMARY KEY,
        name_en    TEXT NOT NULL,
        name_fr    TEXT NOT NULL,
        region_en  TEXT NOT NULL,
        region_fr  TEXT NOT NULL,
        lat        REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
        lon        REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
        status     TEXT NOT NULL CHECK (status IN ('been', 'want')),
        home       INTEGER NOT NULL DEFAULT 0 CHECK (home IN (0, 1)),
        iso        TEXT NOT NULL CHECK (length(iso) = 2),
        continent  TEXT NOT NULL CHECK (continent IN ('europe', 'north-america', 'south-america', 'asia', 'africa', 'oceania', 'antarctica')),
        note_en    TEXT,
        note_fr    TEXT,
        visited    TEXT,
        trip_from  TEXT,
        trip_to    TEXT,
        sort       INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX places_one_home ON places (home) WHERE home = 1;
      CREATE INDEX places_trips ON places (trip_from, trip_to) WHERE trip_from IS NOT NULL;

      CREATE TABLE kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL CHECK (json_valid(value)),
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
];

/**
 * First boot: the places from src/lib/places.ts (only into an empty table)
 * and each kv document that doesn't exist yet. Safe to run on every open.
 */
export const contentSeed: Seed = (d) => {
  d.transaction(() => {
    const at = new Date().toISOString();
    const { n } = d.prepare(`SELECT COUNT(*) AS n FROM places`).get() as { n: number };
    if (n === 0) for (const p of seedPlaces()) writePlace(d, p, at);
    writeKv(d, "status", seedStatus(), at, true);
    writeKv(d, "now", seedNow(), at, true);
    writeKv(d, "live", seedLive(), at, true);
    writeKv(d, "projects", seedProjects(), at, true);
  })();
};

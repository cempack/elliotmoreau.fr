import type { Migration } from "../db/types";

/**
 * hits: one row per page view (see ./index). `day` is the calendar day in
 * Toulouse; `vid` the visitor of that day (an HMAC under a key that changes
 * daily, never an IP); `ref` the referring site's host on the first page of
 * a visit; `country` from the browser's time zone.
 */
export const statsMigrations: Migration[] = [
  {
    id: "stats-001",
    up: `
      CREATE TABLE hits (
        id      INTEGER PRIMARY KEY,
        at      INTEGER NOT NULL,
        day     TEXT NOT NULL,
        vid     TEXT NOT NULL,
        path    TEXT NOT NULL,
        lang    TEXT NOT NULL,
        ref     TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        device  TEXT NOT NULL DEFAULT '',
        browser TEXT NOT NULL DEFAULT '',
        os      TEXT NOT NULL DEFAULT '',
        entry   INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE INDEX hits_day ON hits (day);
      CREATE INDEX hits_at ON hits (at);
      CREATE INDEX hits_vid ON hits (vid, id);
    `,
  },
];


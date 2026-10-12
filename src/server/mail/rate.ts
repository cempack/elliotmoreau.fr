import "server-only";
import { db, tx } from "../db";
import { DAY } from "./config";

export type Limit = { key: string; max: number; windowMs: number };

/**
 * Fixed-window counters. Checks every limit first and counts the attempt
 * against all of them only if none is full, in one transaction, so two
 * requests at once can't both slip under a limit.
 */
export function takeRate(limits: Limit[], now = Date.now()): boolean {
  return tx((d) => {
    const get = d.prepare(`SELECT count, window_start FROM mail_rate WHERE key = ?`);
    for (const l of limits) {
      const start = Math.floor(now / l.windowMs) * l.windowMs;
      const row = get.get(l.key) as { count: number; window_start: number } | undefined;
      if (row && row.window_start === start && row.count >= l.max) return false;
    }
    const bump = d.prepare(
      `INSERT INTO mail_rate (key, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN mail_rate.window_start = excluded.window_start THEN mail_rate.count + 1 ELSE 1 END,
         window_start = excluded.window_start`
    );
    for (const l of limits) bump.run(l.key, Math.floor(now / l.windowMs) * l.windowMs);
    return true;
  });
}

/** forget windows that ended more than a day ago */
export function pruneRates(now = Date.now()) {
  db().prepare(`DELETE FROM mail_rate WHERE window_start < ?`).run(now - 2 * DAY);
}

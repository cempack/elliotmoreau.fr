import "server-only";
import { revalidatePath } from "next/cache";
import { db, nowIso, tx, type DB } from "../db";
import {
  dateIn,
  resolveAway,
  type Away,
  type CurrentAway,
  type LiveOverrides,
  type NowContent,
  type CopyContent,
  type PlaceRow,
  type ProjectsContent,
  type Status,
} from "@/lib/content";
import { ContentError } from "./errors";
import { PLACE_ORDER, fromDb, readKv, writeKv, writePlace, type PlaceDbRow } from "./rows";
import { seedLive, seedNow, seedPlaces, seedProjects, seedStatus } from "./seed";
import { validateAway, validateCopy, validateLive, validateNow, validatePlace, validateProjects, validateStatus, validateWorkHours } from "./validate";

/**
 * The site's editable content: places (the Atlas), status (away, working
 * hours, reply days), the /now page and the live-data overrides, kept in
 * SQLite and edited from the admin panel.
 *
 * Synchronous (better-sqlite3), typed, validated on write. Reads never
 * break a page: when the database can't be opened (or during `next build`,
 * which never touches it because Railway mounts the volume only at run
 * time) they log once and return the seed, and a stored document that no
 * longer validates falls back to its seed the same way. Writes throw: a
 * ContentError for bad input, the database error otherwise.
 *
 * After a write, call revalidateContent() so every page re-renders from
 * the database on its next visit.
 */

export { ContentError } from "./errors";
export type {
  Away,
  Book,
  CopyContent,
  Continent,
  CurrentAway,
  Draft,
  L10n,
  Learning,
  LiveOverrides,
  NowContent,
  PlaceRow,
  ProjectKind,
  ProjectNote,
  ProjectsContent,
  SetupRow,
  Status,
  WorkHours,
} from "@/lib/content";

/* ───────────────────────────── reading, safely ───────────────────────────── */

const g = globalThis as unknown as { __emosContentWarned?: Set<string> };
const warned = (g.__emosContentWarned ??= new Set());

function warnOnce(key: string, message: string, err?: unknown) {
  if (warned.has(key)) return;
  warned.add(key);
  console.error(`[content] ${message}`, err instanceof Error ? err.message : (err ?? ""));
}

/** The build prerenders from the seed: no volume, and parallel workers. */
const building = () => process.env.NEXT_PHASE === "phase-production-build";

function read<T>(what: (d: DB) => T, seed: () => T): T {
  if (building()) return seed();
  let d: DB;
  try {
    d = db();
  } catch (err) {
    warnOnce("open", "database unavailable, showing the seed content:", err);
    return seed();
  }
  try {
    return what(d);
  } catch (err) {
    warnOnce("read", "reading the database failed, showing the seed content:", err);
    return seed();
  }
}

/** One kv document, validated; its seed if missing or no longer valid. */
function doc<T>(d: DB, key: string, validate: (v: unknown) => T, seed: () => T): T {
  const raw = readKv(d, key);
  if (raw === undefined) return seed();
  try {
    return validate(raw);
  } catch (err) {
    warnOnce(`doc:${key}`, `stored "${key}" is invalid, showing its seed:`, err);
    return seed();
  }
}

const placesFrom = (d: DB) => (d.prepare(`SELECT * FROM places ${PLACE_ORDER}`).all() as PlaceDbRow[]).map(fromDb);
// status merges over its seed so a field added later reads its default (all
// its fields are required; a cleared away is stored as null). live must not:
// a cleared featuredRepo would come back from the seed; its validator
// defaults the required fields itself.
const statusFrom = (d: DB) => doc(d, "status", (v) => validateStatus({ ...seedStatus(), ...(v as object) }), seedStatus);
const nowFrom = (d: DB) => doc(d, "now", validateNow, seedNow);
const liveFrom = (d: DB) => doc(d, "live", validateLive, seedLive);
const projectsFrom = (d: DB) => doc(d, "projects", validateProjects, seedProjects);
const noCopy = (): CopyContent => ({ en: {}, fr: {} });
// an edit whose original was renamed since is dropped, not the whole document
const copyFrom = (d: DB) => doc(d, "copy", (v) => validateCopy(prune(v)), noCopy);

/** keep only edits whose path still exists and still validates on its own */
function prune(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const out: Record<string, Record<string, unknown>> = { en: {}, fr: {} };
  for (const lang of ["en", "fr"] as const) {
    const edits = (v as Record<string, unknown>)[lang];
    if (!edits || typeof edits !== "object") continue;
    for (const [k, x] of Object.entries(edits)) {
      try {
        validateCopy({ [lang]: { [k]: x } });
        out[lang][k] = x;
      } catch {
        // gone or no longer fits its original: read as written
      }
    }
  }
  return out;
}

/* ───────────────────────────── places ───────────────────────────── */

/** Every place: home first, then been, then want, each by `sort`. */
export function getPlaces(): PlaceRow[] {
  return read(placesFrom, seedPlaces);
}

/**
 * Add or replace a place (by id). Validates every field; a new home moves
 * the home flag from the old one, and the home place can't be un-homed
 * (pick another home instead), so there is always exactly one.
 */
export function upsertPlace(p: PlaceRow): void {
  const place = validatePlace(p);
  tx((d) => {
    const at = nowIso();
    const current = d.prepare(`SELECT home FROM places WHERE id = ?`).get(place.id) as { home: 0 | 1 } | undefined;
    if (current?.home === 1 && !place.home) throw new ContentError("This is home. Make another place home instead.", "home");
    if (place.home) d.prepare(`UPDATE places SET home = 0, updated_at = ? WHERE home = 1 AND id <> ?`).run(at, place.id);
    writePlace(d, place, at);
  });
}

/** Remove a place (unknown ids are a no-op). Home can't be deleted. */
export function deletePlace(id: string): void {
  tx((d) => {
    const row = d.prepare(`SELECT home FROM places WHERE id = ?`).get(id) as { home: 0 | 1 } | undefined;
    if (!row) return;
    if (row.home === 1) throw new ContentError("Home can't be deleted. Make another place home first.", "home");
    d.prepare(`DELETE FROM places WHERE id = ?`).run(id);
    // an away that pointed at it keeps its city, or ends
    const status = statusFrom(d);
    if (status.away?.placeId === id) {
      const away: Away = { ...status.away };
      delete away.placeId;
      writeKv(d, "status", { ...status, away: away.city ? away : null }, nowIso());
    }
  });
}

/**
 * Set the order: `ids` first, in that order; places not listed keep their
 * relative order after them. (Home, been and want stay grouped on the site.)
 */
export function reorderPlaces(ids: string[]): void {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new ContentError("Expected a list of place ids.", "ids");
  if (new Set(ids).size !== ids.length) throw new ContentError("Each place once.", "ids");
  tx((d) => {
    const all = (d.prepare(`SELECT id FROM places ORDER BY sort, rowid`).all() as { id: string }[]).map((r) => r.id);
    const known = new Set(all);
    const unknown = ids.find((id) => !known.has(id));
    if (unknown) throw new ContentError(`Unknown place: ${unknown}`, "ids");
    const listed = new Set(ids);
    const order = [...ids, ...all.filter((id) => !listed.has(id))];
    const set = d.prepare(`UPDATE places SET sort = ?, updated_at = ? WHERE id = ?`);
    const at = nowIso();
    order.forEach((id, i) => set.run(i, at, id));
  });
}

/* ───────────────────────────── status ───────────────────────────── */

export function getStatus(): Status {
  return read(statusFrom, seedStatus);
}

/**
 * Change part of the status. A key left out (or undefined) keeps its value;
 * `away: null` means home. An away's place must exist.
 */
export function setStatus(patch: Partial<Status>): void {
  if (!patch || typeof patch !== "object") throw new ContentError("Expected an object.", "status");
  tx((d) => {
    const next: Status = { ...statusFrom(d) };
    if (patch.away !== undefined) next.away = validateAway(patch.away);
    if (patch.workHours !== undefined) next.workHours = validateWorkHours(patch.workHours);
    if (patch.replyDays !== undefined) next.replyDays = patch.replyDays;
    const status = validateStatus(next);
    if (status.away?.placeId && !d.prepare(`SELECT 1 FROM places WHERE id = ?`).get(status.away.placeId))
      throw new ContentError("Unknown place.", "away.placeId");
    writeKv(d, "status", status, nowIso());
  });
}

/**
 * Who is away right now: the hand-set away while its dates (if any)
 * include today, or a place whose trip dates include today. "Today" is the
 * calendar day in the working-hours time zone (Toulouse).
 */
export function currentAway(at: Date = new Date()): CurrentAway | null {
  const { status, places } = read(
    (d) => ({ status: statusFrom(d), places: placesFrom(d) }),
    () => ({ status: seedStatus(), places: seedPlaces() })
  );
  return resolveAway(status, places, dateIn(status.workHours.tz, at));
}

/* ───────────────────────────── /now ───────────────────────────── */

export function getNowContent(): NowContent {
  return read(nowFrom, seedNow);
}

/** Replace the whole /now content (validated; `updated` is stored as given). */
export function setNowContent(next: NowContent): void {
  const now = validateNow(next);
  tx((d) => writeKv(d, "now", now, nowIso()));
}

/* ───────────────────────────── live overrides ───────────────────────────── */

export function getLive(): LiveOverrides {
  return read(liveFrom, seedLive);
}

/**
 * Change part of the live overrides. A key left out (or undefined) keeps
 * its value; `featuredRepo: ""` or `pinnedPost: ""` clears it.
 */
export function setLive(patch: Partial<LiveOverrides>): void {
  if (!patch || typeof patch !== "object") throw new ContentError("Expected an object.", "live");
  tx((d) => {
    const next: Record<string, unknown> = { ...liveFrom(d) };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) next[k] = v;
    writeKv(d, "live", validateLive(next), nowIso());
  });
}

/* ───────────────────────────── projects ───────────────────────────── */

export function getProjects(): ProjectsContent {
  return read(projectsFrom, seedProjects);
}

/** Replace the projects document: every note, and the order (validated). */
export function setProjects(next: ProjectsContent): void {
  const projects = validateProjects(next);
  tx((d) => writeKv(d, "projects", projects, nowIso()));
}

/* ───────────────────────────── the site's words ───────────────────────────── */

/** The edited words (Texts), per language; empty when nothing was edited. */
export function getCopy(): CopyContent {
  return read(copyFrom, noCopy);
}

/** Replace every edit (validated: an empty edit, or one equal to the original, is dropped). */
export function setCopy(next: CopyContent): void {
  const copy = validateCopy(next);
  tx((d) => writeKv(d, "copy", copy, nowIso()));
}

/* ───────────────────────────── everything, for a render ───────────────────────────── */

export type SiteContent = {
  places: PlaceRow[];
  status: Status;
  now: NowContent;
  live: LiveOverrides;
  /** each repo's note and their order (applied to the repos on the server) */
  projects: ProjectsContent;
  /** resolved for this render (see currentAway) */
  away: CurrentAway | null;
};

/** All the content a page needs, in one read (the shell's SiteData). */
export function getSiteContent(at: Date = new Date()): SiteContent {
  const c = read(
    (d) => ({ places: placesFrom(d), status: statusFrom(d), now: nowFrom(d), live: liveFrom(d), projects: projectsFrom(d) }),
    () => ({ places: seedPlaces(), status: seedStatus(), now: seedNow(), live: seedLive(), projects: seedProjects() })
  );
  return { ...c, away: resolveAway(c.status, c.places, dateIn(c.status.workHours.tz, at)) };
}

/* ───────────────────────────── refresh ───────────────────────────── */

/**
 * Mark every page stale so its next visit renders from the database (the
 * root layout carries the content to every page). Call from a Route
 * Handler or Server Function after a write.
 */
export function revalidateContent(): void {
  revalidatePath("/", "layout");
}

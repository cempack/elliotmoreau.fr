import {
  CONTINENTS,
  type Away,
  type Book,
  type Continent,
  type Draft,
  type L10n,
  type Learning,
  type LiveOverrides,
  type NowContent,
  type PlaceRow,
  type SetupRow,
  type Status,
  type WorkHours,
} from "@/lib/content";
import { ContentError } from "./errors";

/**
 * Every content write goes through these: they accept `unknown` (whatever a
 * form or a JSON body sent), check it field by field and return a clean
 * value built only from known fields, or throw a ContentError naming the
 * field. Text is trimmed, single-line and length-capped; dates are real
 * calendar days; time zones are ones the runtime knows.
 */

type Obj = Record<string, unknown>;

const fail = (field: string, message: string): never => {
  throw new ContentError(message, field);
};

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function obj(v: unknown, field: string): Obj {
  return isObj(v) ? v : fail(field, "Expected an object.");
}

function list(v: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(v)) return fail(field, "Expected a list.");
  if (v.length > max) fail(field, `At most ${max} items.`);
  return v;
}

const CONTROL = /[\u0000-\u001f\u007f]/;

/** Trimmed single-line text; "" allowed only when not required. */
function text(v: unknown, field: string, max: number, required = true): string {
  if (typeof v !== "string") return fail(field, "Expected text.");
  const s = v.trim();
  if (required && !s) fail(field, "Can't be empty.");
  if (s.length > max) fail(field, `At most ${max} characters.`);
  if (CONTROL.test(s)) fail(field, "No line breaks or control characters.");
  return s;
}

/** Optional text: undefined, null and "" all mean "not set". */
function optText(v: unknown, field: string, max: number): string | undefined {
  if (v == null) return undefined;
  return text(v, field, max, false) || undefined;
}

function l10n(v: unknown, field: string, max: number): L10n {
  const o = obj(v, field);
  return { en: text(o.en, `${field}.en`, max), fr: text(o.fr, `${field}.fr`, max) };
}

/** Optional L10n: absent, or both languages empty, means "not set". */
function optL10n(v: unknown, field: string, max: number): L10n | undefined {
  if (v == null) return undefined;
  const o = obj(v, field);
  const en = text(o.en ?? "", `${field}.en`, max, false);
  const fr = text(o.fr ?? "", `${field}.fr`, max, false);
  return en || fr ? { en, fr } : undefined;
}

function bool(v: unknown, field: string): boolean {
  return typeof v === "boolean" ? v : fail(field, "Expected true or false.");
}

function num(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fail(field, "Expected a number.");
  if (v < min || v > max) fail(field, `Must be between ${min} and ${max}.`);
  return v;
}

function int(v: unknown, field: string, min: number, max: number): number {
  const n = num(v, field, min, max);
  return Number.isInteger(n) ? n : fail(field, "Expected a whole number.");
}

function oneOf<T extends string>(v: unknown, field: string, options: readonly T[]): T {
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : fail(field, `One of: ${options.join(", ")}.`);
}

/** A real calendar day, "YYYY-MM-DD". */
export function isoDay(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(field, "Expected a date like 2026-10-12.");
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) fail(field, "Not a real date.");
  return v;
}

const optDay = (v: unknown, field: string) => (v == null || v === "" ? undefined : isoDay(v, field));

/** An IANA time zone the runtime knows ("Europe/Paris"). */
export function timeZone(v: unknown, field: string): string {
  const s = text(v, field, 64);
  try {
    new Intl.DateTimeFormat("en", { timeZone: s });
  } catch {
    fail(field, "Unknown time zone (use one like Europe/Paris).");
  }
  return s;
}

function hhmm(v: unknown, field: string): string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fail(field, "Expected a time like 09:00.");
}

function url(v: unknown, field: string, required: boolean): string | undefined {
  const s = required ? text(v, field, 300, false) : optText(v, field, 300);
  if (!s) return required ? "" : undefined;
  let ok = false;
  try {
    ok = /^https?:$/.test(new URL(s).protocol);
  } catch {}
  return ok ? s : fail(field, "Expected a link starting with https://.");
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

function dates(from: unknown, to: unknown, fromField: string, toField: string) {
  const f = optDay(from, fromField);
  const t = optDay(to, toField);
  if (f && t && f > t) fail(toField, "The end date is before the start date.");
  return [f, t] as const;
}

/* ───────────────────────────── places ───────────────────────────── */

export function validatePlace(input: unknown): PlaceRow {
  const o = obj(input, "place");
  const id = text(o.id, "id", 48);
  if (!SLUG.test(id)) fail("id", "Use lowercase letters, digits and dashes (e.g. new-zealand).");
  const status = oneOf(o.status, "status", ["been", "want"] as const);
  const home = bool(o.home ?? false, "home");
  if (home && status !== "been") fail("status", "Home has to be a place you've been.");
  const iso = text(o.iso, "iso", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) fail("iso", "Expected a two-letter country code (e.g. JP).");
  const [tripFrom, tripTo] = dates(o.tripFrom, o.tripTo, "tripFrom", "tripTo");
  if (Boolean(tripFrom) !== Boolean(tripTo)) fail(tripFrom ? "tripTo" : "tripFrom", "A trip needs both dates.");
  const place: PlaceRow = {
    id,
    name: l10n(o.name, "name", 60),
    region: l10n(o.region, "region", 40),
    lat: num(o.lat, "lat", -90, 90),
    lon: num(o.lon, "lon", -180, 180),
    status,
    home,
    iso,
    continent: oneOf<Continent>(o.continent, "continent", CONTINENTS),
    sort: int(o.sort ?? 0, "sort", -1_000_000, 1_000_000),
  };
  const note = optL10n(o.note, "note", 280);
  const visited = optText(o.visited, "visited", 40);
  if (note) place.note = note;
  if (visited) place.visited = visited;
  if (tripFrom && tripTo) {
    place.tripFrom = tripFrom;
    place.tripTo = tripTo;
  }
  return place;
}

/* ───────────────────────────── status ───────────────────────────── */

export function validateAway(input: unknown): Away | null {
  if (input == null) return null;
  const o = obj(input, "away");
  const away: Away = {};
  const placeId = optText(o.placeId, "away.placeId", 48);
  const city = optText(o.city, "away.city", 80);
  if (placeId && !SLUG.test(placeId)) fail("away.placeId", "Unknown place.");
  if (!placeId && !city) fail("away", "Pick a place or type a city.");
  if (placeId) away.placeId = placeId;
  if (city) away.city = city;
  if (o.tz != null && o.tz !== "") away.tz = timeZone(o.tz, "away.tz");
  const [from, to] = dates(o.from, o.to, "away.from", "away.to");
  if (from) away.from = from;
  if (to) away.to = to;
  return away;
}

export function validateWorkHours(input: unknown): WorkHours {
  const o = obj(input, "workHours");
  const start = hhmm(o.start, "workHours.start");
  const end = hhmm(o.end, "workHours.end");
  if (start >= end) fail("workHours.end", "The day has to end after it starts.");
  const days = list(o.days, "workHours.days", 7).map((d, i) => int(d, `workHours.days[${i}]`, 1, 7));
  if (!days.length) fail("workHours.days", "Pick at least one day.");
  if (new Set(days).size !== days.length) fail("workHours.days", "Each day once.");
  return { start, end, days: [...days].sort((a, b) => a - b), tz: timeZone(o.tz, "workHours.tz") };
}

export function validateStatus(input: unknown): Status {
  const o = obj(input, "status");
  return {
    away: validateAway(o.away),
    workHours: validateWorkHours(o.workHours),
    replyDays: int(o.replyDays, "replyDays", 0, 30),
  };
}

/* ───────────────────────────── /now ───────────────────────────── */

function book(v: unknown, f: string): Book {
  const o = obj(v, f);
  const b: Book = {
    title: text(o.title, `${f}.title`, 120),
    author: text(o.author, `${f}.author`, 80),
    status: oneOf(o.status, `${f}.status`, ["reading", "rereading", "next", "finished"] as const),
  };
  const note = optL10n(o.note, `${f}.note`, 200);
  const link = url(o.url, `${f}.url`, false);
  if (note) b.note = note;
  if (link) b.url = link;
  return b;
}

function learning(v: unknown, f: string): Learning {
  const o = obj(v, f);
  const l: Learning = { label: l10n(o.label, `${f}.label`, 80) };
  const note = optL10n(o.note, `${f}.note`, 200);
  if (note) l.note = note;
  return l;
}

function draft(v: unknown, f: string): Draft {
  const o = obj(v, f);
  const d: Draft = { title: l10n(o.title, `${f}.title`, 120) };
  const note = optL10n(o.note, `${f}.note`, 200);
  if (note) d.note = note;
  return d;
}

function setupRow(v: unknown, f: string): SetupRow {
  const o = obj(v, f);
  const row: SetupRow = {
    key: l10n(o.key, `${f}.key`, 24),
    value: typeof o.value === "string" ? text(o.value, `${f}.value`, 80) : l10n(o.value, `${f}.value`, 80),
  };
  if (o.todo != null && bool(o.todo, `${f}.todo`)) row.todo = true;
  return row;
}

export function validateNow(input: unknown): NowContent {
  const o = obj(input, "now");
  const focus = obj(o.focus, "focus");
  return {
    updated: isoDay(o.updated, "updated"),
    intro: l10n(o.intro, "intro", 400),
    focus: {
      name: text(focus.name, "focus.name", 40),
      doing: l10n(focus.doing, "focus.doing", 120),
      title: l10n(focus.title, "focus.title", 160),
      body: l10n(focus.body, "focus.body", 400),
      url: url(focus.url ?? "", "focus.url", true) ?? "",
    },
    reading: list(o.reading ?? [], "reading", 20).map((b, i) => book(b, `reading[${i}]`)),
    learning: list(o.learning ?? [], "learning", 20).map((l, i) => learning(l, `learning[${i}]`)),
    drafting: list(o.drafting ?? [], "drafting", 20).map((d, i) => draft(d, `drafting[${i}]`)),
    setup: list(o.setup ?? [], "setup", 40).map((r, i) => setupRow(r, `setup[${i}]`)),
  };
}

/* ───────────────────────────── live overrides ───────────────────────────── */

function repo(v: unknown, field: string): string {
  const s = text(v, field, 100);
  return REPO.test(s) ? s : fail(field, "Not a repository name.");
}

export function validateLive(input: unknown): LiveOverrides {
  const o = obj(input, "live");
  const seen = new Set<string>();
  const hiddenRepos: string[] = [];
  list(o.hiddenRepos ?? [], "hiddenRepos", 200).forEach((r, i) => {
    const name = repo(r, `hiddenRepos[${i}]`);
    if (seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    hiddenRepos.push(name);
  });
  const live: LiveOverrides = { hiddenRepos, showSpotify: bool(o.showSpotify ?? true, "showSpotify") };
  const featured = optText(o.featuredRepo, "featuredRepo", 100);
  if (featured) live.featuredRepo = repo(featured, "featuredRepo");
  const pinned = optText(o.pinnedPost, "pinnedPost", 191);
  if (pinned) live.pinnedPost = SLUG.test(pinned) ? pinned : fail("pinnedPost", "Not a post slug.");
  return live;
}

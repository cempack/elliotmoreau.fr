/**
 * The shape of the site's editable content (places, status, /now, live
 * overrides) and the pure helpers both sides need. No server imports: the
 * client reads these types through SiteData, the server module
 * (src/server/content) stores and validates them, and the admin edits them.
 */

export type L10n = { en: string; fr: string };

/** Pick the current language from an L10n (or pass a plain string through). */
export const loc = (v: string | L10n, lang: "en" | "fr") => (typeof v === "string" ? v : v[lang]);

/** "43.60°N 1.44°E" (language-neutral; the Atlas has its own localized one). */
export function fmtCoords(lat: number, lon: number) {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${la} ${lo}`;
}

/* ───────────────────────────── places ───────────────────────────── */

export const CONTINENTS = ["europe", "north-america", "south-america", "asia", "africa", "oceania", "antarctica"] as const;
export type Continent = (typeof CONTINENTS)[number];
export type PlaceStatus = "been" | "want";

export type PlaceRow = {
  /** slug, also the Atlas URL hash (/atlas#japan) */
  id: string;
  name: L10n;
  region: L10n;
  lat: number;
  lon: number;
  status: PlaceStatus;
  /** exactly one place is home (and home has been visited) */
  home: boolean;
  /** ISO 3166-1 alpha-2 of the country it belongs to (the Canaries are ES) */
  iso: string;
  continent: Continent;
  /** the place card's line */
  note?: L10n;
  /** when it was visited, as written ("2019", "summer 2022") */
  visited?: string;
  /** a planned or current trip, inclusive YYYY-MM-DD dates */
  tripFrom?: string;
  tripTo?: string;
  sort: number;
};

/** Display order everywhere: home, then been, then want; each by `sort`. */
export function orderPlaces(places: readonly PlaceRow[]): PlaceRow[] {
  const rank = (p: PlaceRow) => (p.home ? 0 : p.status === "been" ? 1 : 2);
  return places
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.p.sort - b.p.sort || a.i - b.i)
    .map(({ p }) => p);
}

/** The home place (the first place if the data has none, so nothing breaks). */
export function homeOf(places: readonly PlaceRow[]): PlaceRow | undefined {
  return places.find((p) => p.home) ?? places[0];
}

/* ───────────────────────────── status ───────────────────────────── */

export type WorkHours = {
  /** "09:00", local to `tz` */
  start: string;
  end: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday */
  days: number[];
  /** IANA time zone, e.g. "Europe/Paris" */
  tz: string;
};

/** Travelling: a place from the Atlas or a free city, optionally dated. */
export type Away = { placeId?: string; city?: string; tz?: string; from?: string; to?: string };

export type Status = {
  /** set by hand; null when home (trips with dates count on their own) */
  away: Away | null;
  workHours: WorkHours;
  /** how many days a reply usually takes */
  replyDays: number;
};

export type CurrentAway = Away & { place?: PlaceRow };

/** "2026-10-12" for `at` in time zone `tz` (falls back to UTC on a bad zone). */
export function dateIn(tz: string, at: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

const within = (day: string, from?: string, to?: string) => (!from || from <= day) && (!to || day <= to);

/**
 * Who is away on `day` (YYYY-MM-DD): the hand-set away while its dates
 * (if any) include the day, otherwise a place whose trip dates include it
 * (the latest-starting one if trips overlap). Home never counts as away.
 */
export function resolveAway(status: Status, places: readonly PlaceRow[], day: string): CurrentAway | null {
  const a = status.away;
  if (a && within(day, a.from, a.to)) {
    const place = a.placeId ? places.find((p) => p.id === a.placeId) : undefined;
    return place ? { ...a, place } : { ...a };
  }
  let best: PlaceRow | undefined;
  for (const p of places) {
    if (p.home || !p.tripFrom || !p.tripTo || !within(day, p.tripFrom, p.tripTo)) continue;
    if (!best || p.tripFrom > (best.tripFrom ?? "")) best = p;
  }
  return best ? { placeId: best.id, from: best.tripFrom, to: best.tripTo, place: best } : null;
}

/* ───────────────────────────── /now ───────────────────────────── */

export type Book = {
  title: string;
  author: string;
  status: "reading" | "rereading" | "next" | "finished";
  /** one short line: why, or what you're getting out of it */
  note?: L10n;
  url?: string;
};

export type Learning = { label: L10n; note?: L10n };

export type Draft = { title: L10n; note?: L10n };

export type SetupRow = {
  /** fastfetch-style key, shown as-is (short, technical) */
  key: L10n;
  value: string | L10n;
  /** unconfirmed: kept as a placeholder, never shown on the page */
  todo?: boolean;
};

export type NowContent = {
  /** YYYY-MM-DD, shown as "Last updated" */
  updated: string;
  /** one or two sentences under the headline */
  intro: L10n;
  /** the one thing most of the time goes into */
  focus: {
    name: string;
    /** completes the headline; keep {name} where the name goes */
    doing: L10n;
    title: L10n;
    body: L10n;
    url: string;
  };
  reading: Book[];
  learning: Learning[];
  drafting: Draft[];
  setup: SetupRow[];
};

/* ───────────────────────────── live overrides ───────────────────────────── */

export type LiveOverrides = {
  /** the repo Projects features (hero, middle of the sticker lid) */
  featuredRepo?: string;
  /** repos left out of every list */
  hiddenRepos: string[];
  /** the post Writing opens on (instead of the latest) */
  pinnedPost?: string;
  /** false hides the music everywhere */
  showSpotify: boolean;
};

/** What pages receive: hidden repos are filtered out on the server, and
    their names never reach the browser. */
export type PublicLive = Omit<LiveOverrides, "hiddenRepos">;

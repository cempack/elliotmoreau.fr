import type { Continent, L10n, PlaceRow } from "@/lib/content";
import { COUNTRIES, type Country } from "./countries";

/**
 * The Travels editor's country lookup: what's typed, in either language,
 * with or without accents ("etats", "Ireland", "USA", "jp"), against every
 * country, best first; and the fields a pick fills in.
 */

/** the region line the Atlas shows, as the hand-made places spell it */
export const REGIONS: Record<Continent, L10n> = {
  europe: { en: "europe", fr: "europe" },
  "north-america": { en: "north america", fr: "amérique du nord" },
  "south-america": { en: "south america", fr: "amérique du sud" },
  asia: { en: "asia", fr: "asie" },
  africa: { en: "africa", fr: "afrique" },
  oceania: { en: "oceania", fr: "océanie" },
  antarctica: { en: "antarctica", fr: "antarctique" },
};

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .trim();

type Entry = { c: Country; names: string[]; alt: string[] };
let index: Entry[] | null = null;
const entries = () =>
  (index ??= COUNTRIES.map((c) => ({ c, names: [fold(c[1]), fold(c[2])], alt: c[6] ? c[6].split("|").map(fold) : [] })));

/** a word inside the name starts with it: "korea" finds South Korea */
const wordStart = (name: string, q: string) => name.split(/[\s\-'(]+/).some((w) => w.startsWith(q));

/**
 * 0 is the best match; null, no match. A name matches a little better in
 * the language on screen than in the other (+0.5): in English "guin" lists
 * Guinea before Equatorial Guinea, found by its French name.
 */
function rank(e: Entry, q: string, code: string, li: 0 | 1): number | null {
  const named = (test: (n: string) => boolean) => (test(e.names[li]) ? 0 : test(e.names[1 - li]) ? 0.5 : null);
  let m: number | null;
  if (code && e.c[0] === code) return 0;
  if ((m = named((n) => n === q)) !== null) return 1 + m;
  // an abbreviation typed in full ("uk", "usa") says more than the start of a name (Ukraine)
  if (e.alt.some((a) => a === q)) return 2;
  if ((m = named((n) => n.startsWith(q))) !== null) return 3 + m;
  if ((m = named((n) => wordStart(n, q))) !== null) return 4 + m;
  if (e.alt.some((a) => a.startsWith(q) || wordStart(a, q))) return 5;
  if (q.length >= 3 && (m = named((n) => n.includes(q))) !== null) return 6 + m;
  return null;
}

/** the best few countries for what's typed, named in `lang` order */
export function findCountries(query: string, lang: "en" | "fr", limit = 8): Country[] {
  const q = fold(query);
  if (!q) return [];
  const code = /^[a-z]{2}$/.test(q) ? q.toUpperCase() : "";
  const name = (c: Country) => (lang === "fr" ? c[2] : c[1]);
  return entries()
    .map((e) => ({ c: e.c, r: rank(e, q, code, lang === "fr" ? 1 : 0) }))
    .filter((m): m is { c: Country; r: number } => m.r !== null)
    .sort((a, b) => a.r - b.r || name(a.c).localeCompare(name(b.c), lang))
    .slice(0, limit)
    .map((m) => m.c);
}

/** the fields a country fills in; the rest of the place (status, note, dates) stays as it is */
export function fromCountry(c: Country): Pick<PlaceRow, "name" | "region" | "lat" | "lon" | "iso" | "continent"> {
  const [iso, en, fr, lat, lon, continent] = c;
  return { name: { en, fr }, region: REGIONS[continent], lat, lon, iso, continent };
}

/** the place already on the Atlas for this country, if there is one (by slug or by name) */
export function placeFor(c: Country, places: readonly PlaceRow[], slug: (s: string) => string): PlaceRow | undefined {
  const id = slug(c[1]);
  const en = fold(c[1]);
  const fr = fold(c[2]);
  return places.find((p) => p.id === id || fold(p.name.en) === en || fold(p.name.fr) === fr);
}

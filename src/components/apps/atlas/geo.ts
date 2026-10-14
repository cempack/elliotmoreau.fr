import { homeOf, orderPlaces, type PlaceRow } from "@/lib/content";

/* ───────────────────────────── the places ─────────────────────────────
   The Atlas draws whatever the database holds (usePlaces), so everything
   here is a function of that list. Each place carries the country it
   belongs to (the Canaries are Spain, Northern Ireland is the UK) and its
   continent, so the stats count countries and continents honestly. */

/** ISO code for the stamp (falls back to the id's first letters). */
export const isoOf = (p: PlaceRow) => p.iso || p.id.slice(0, 2).toUpperCase();

/** A stand-in home for an empty list (the database always has one). */
const NOWHERE: PlaceRow = {
  id: "home",
  name: { en: "Home", fr: "Chez moi" },
  region: { en: "", fr: "" },
  lat: 43.6047,
  lon: 1.4442,
  status: "been",
  home: true,
  iso: "FR",
  continent: "europe",
  sort: 0,
};

export type Atlas = {
  /** display order everywhere: home first, then been, then next */
  ordered: PlaceRow[];
  home: PlaceRow;
  /** home first, then the rest */
  been: PlaceRow[];
  next: PlaceRow[];
  byId: (id: string | null | undefined) => PlaceRow | undefined;
};

/** Everything the Atlas derives from the list (memoise it: see useAtlas). */
export function atlasOf(places: readonly PlaceRow[]): Atlas {
  const ordered = orderPlaces(places);
  const home = homeOf(ordered) ?? NOWHERE;
  const been = ordered.filter((p) => p.status === "been");
  const next = ordered.filter((p) => p.status === "want");
  const ids = new Map(ordered.map((p) => [p.id, p]));
  return { ordered, home, been, next, byId: (id) => (id ? ids.get(id) : undefined) };
}

/* ───────────────────────────── sphere maths ───────────────────────────── */

const RAD = Math.PI / 180;
const EARTH_KM = 6371;

/** Great-circle distance in km (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, degrees 0–360. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Index into a 16-point compass rose. */
export const compassIndex = (deg: number) => Math.round(deg / 22.5) % 16;

export type Vec3 = [number, number, number];

/** Geographic unit vector (x towards 0°E, z towards the north pole). */
export function toVec(lat: number, lon: number): Vec3 {
  const φ = lat * RAD;
  const λ = lon * RAD;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

export function toLatLon(v: Vec3) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lat: Math.asin(v[2] / n) / RAD, lon: Math.atan2(v[1], v[0]) / RAD };
}

/** Point on the great circle between unit vectors a and b (t ∈ [0, 1]). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const ω = Math.acos(dot);
  if (ω < 1e-6) return a;
  const s = Math.sin(ω);
  const ka = Math.sin((1 - t) * ω) / s;
  const kb = Math.sin(t * ω) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/** Central angle between two unit vectors (radians). */
export function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

/** Where the camera looks for a place: the middle of the route from home,
    nudged off the great circle toward the equator so the whole flight path
    is on the near side and bows across the disc like an airline map (a
    route through the centre of an orthographic view is a straight line).
    Home looks a little south-west of itself, so the routes out bow too. */
export function focusFor(p: PlaceRow, home: PlaceRow) {
  if (p.home || p.id === home.id) return { lat: p.lat - 4, lon: p.lon - 9 };
  const a = toVec(home.lat, home.lon);
  const b = toVec(p.lat, p.lon);
  const m = slerp(a, b, 0.5);
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = Math.hypot(c[0], c[1], c[2]);
  if (len < 1e-6) return toLatLon(m);
  const n: Vec3 = [c[0] / len, c[1] / len, c[2] / len];
  const δ = Math.min(16 * RAD, angleBetween(a, b) * 0.35);
  const toward = (s: number): Vec3 => [
    m[0] * Math.cos(δ) + s * n[0] * Math.sin(δ),
    m[1] * Math.cos(δ) + s * n[1] * Math.sin(δ),
    m[2] * Math.cos(δ) + s * n[2] * Math.sin(δ),
  ];
  const f1 = toward(1);
  const f2 = toward(-1);
  return toLatLon(f1[2] < f2[2] ? f1 : f2);
}

/* ───────────────────────────── trip stats ───────────────────────────── */

export function travelStats({ home, been, next }: Atlas) {
  const countries = new Set(been.map(isoOf));
  const nextCountries = new Set(next.map(isoOf).filter((c) => !countries.has(c)));
  const continents = new Set(been.map((p) => p.continent).filter(Boolean));
  let furthest: PlaceRow = home;
  let km = 0;
  for (const p of been) {
    const d = distanceKm(home, p);
    if (d > km) {
      km = d;
      furthest = p;
    }
  }
  return {
    countries: countries.size,
    places: been.length,
    next: nextCountries.size,
    nextPlaces: next.length,
    furthest,
    furthestKm: km,
    continents: continents.size,
  };
}

/* the landmass lookups (worldGrid, isLand, tileFor) are in land.ts */

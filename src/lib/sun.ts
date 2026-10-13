/**
 * The sun over Toulouse, computed: NOAA's solar position equations (the
 * ones behind their solar calculator), accurate to about a minute, which
 * is all a sky, a sundial and a sunrise line need. Pure functions, no DOM,
 * safe in a worker.
 *
 * Phases are astronomical rather than clock bands: night with the sun more
 * than 6° below the horizon (past civil twilight), dawn or dusk within 6°
 * of it (rising or setting), day above. On 11 October that puts dusk at
 * 18:30–19:45 instead of a fixed 17:30.
 */

export const TOULOUSE = { lat: 43.6047, lon: 1.4442, tz: "Europe/Paris" } as const;

export type SkyPhase = "dawn" | "day" | "dusk" | "night";

const R = Math.PI / 180;
/** elevation of the sun's centre at sunrise/sunset (refraction + radius) */
const RISE = -0.833;
/** civil twilight, and the dawn/dusk band around the horizon */
const CIVIL = -6;
const BAND = 6;

type Orbit = { decl: number; eqTime: number; lambda: number; eps: number };

/** Declination (radians) and the equation of time (minutes) at an instant. */
function orbit(ms: number): Orbit {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * R;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * R;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * R;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * R;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const y = Math.tan(eps / 2) ** 2;
  const L = L0 * R;
  const eqTime =
    (4 / R) *
    (y * Math.sin(2 * L) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L) -
      0.5 * y * y * Math.sin(4 * L) -
      1.25 * e * e * Math.sin(2 * Mr));
  return { decl, eqTime, lambda, eps };
}

export type SunPos = {
  /** degrees above the horizon (negative below) */
  elevation: number;
  /** degrees clockwise from north: 90 east, 180 south, 270 west */
  azimuth: number;
  /** solar hour angle in degrees, negative in the morning */
  hourAngle: number;
  /** local apparent solar time in hours (12 = the sun due south) */
  solarHour: number;
};

/** Where the sun is over Toulouse at an instant. */
export function sunAt(d: Date | number, lat: number = TOULOUSE.lat, lon: number = TOULOUSE.lon): SunPos {
  const ms = typeof d === "number" ? d : d.getTime();
  const { decl, eqTime } = orbit(ms);
  const utcMin = (((ms / 60000) % 1440) + 1440) % 1440;
  const tst = (((utcMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 - 180;
  const la = lat * R;
  const cosZ = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha * R);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZ)));
  const elevation = 90 - zen / R;
  // azimuth from north, clockwise
  const az = Math.atan2(Math.sin(ha * R), Math.cos(ha * R) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) / R + 180;
  return { elevation, azimuth: ((az % 360) + 360) % 360, hourAngle: ha, solarHour: tst / 60 };
}

/** The phase for a sun position. */
export function phaseOf(p: Pick<SunPos, "elevation" | "hourAngle">): SkyPhase {
  if (p.elevation > BAND) return "day";
  if (p.elevation < CIVIL) return "night";
  return p.hourAngle < 0 ? "dawn" : "dusk";
}

/* ── Toulouse wall-clock helpers (Intl, so DST is always right) ── */

const fmt = new Map<string, Intl.DateTimeFormat>();
function parts(d: Date, tz: string) {
  let f = fmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    fmt.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return { y: out.year, mo: out.month, d: out.day, h: out.hour % 24, m: out.minute, s: out.second };
}

/** Minutes Toulouse is ahead of UTC at an instant (60 or 120). */
export function tzOffset(d: Date, tz: string = TOULOUSE.tz) {
  const p = parts(d, tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Toulouse wall-clock hour of an instant, fractional (19.5 = 19:30). */
export function localHour(d: Date, tz: string = TOULOUSE.tz) {
  const p = parts(d, tz);
  return p.h + p.m / 60 + p.s / 3600;
}

/** The instant at a Toulouse wall-clock hour on the same Toulouse day as `ref`. */
export function atLocalHour(hour: number, ref: Date = new Date(), tz: string = TOULOUSE.tz) {
  const p = parts(ref, tz);
  const off = tzOffset(ref, tz);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d) + hour * 3600000 - off * 60000);
}

/* ── the day: sunrise, sunset, noon, twilight ── */

export type SunDay = {
  /** Toulouse wall-clock hours (fractional); null when the sun never gets there */
  dawn: number | null;
  sunrise: number | null;
  noon: number;
  sunset: number | null;
  dusk: number | null;
  /** the sun's elevation at solar noon */
  peak: number;
  /** wall clock minus solar time, in minutes (~114 in summer, ~54 in winter, ± the equation of time) */
  clockAhead: number;
};

const days = new Map<string, SunDay>();

/** The sun's day over Toulouse for the Toulouse date containing `ref`. Cached per date. */
export function sunDay(ref: Date = new Date(), lat: number = TOULOUSE.lat, lon: number = TOULOUSE.lon, tz: string = TOULOUSE.tz): SunDay {
  const p = parts(ref, tz);
  const key = `${p.y}-${p.mo}-${p.d}:${lat}:${lon}`;
  const hit = days.get(key);
  if (hit) return hit;
  const off = tzOffset(ref, tz);
  const base = Date.UTC(p.y, p.mo - 1, p.d);
  const toLocal = (utcMin: number) => (((utcMin + off) / 60) % 24 + 24) % 24;
  // solar noon, refined once with the orbit at noon itself
  let noonMin = 720 - 4 * lon - orbit(base + 720 * 60000).eqTime;
  noonMin = 720 - 4 * lon - orbit(base + noonMin * 60000).eqTime;

  const cross = (elev: number, side: -1 | 1) => crossUtc(base, elev, side, lat, lon);

  const { decl } = orbit(base + noonMin * 60000);
  const day: SunDay = {
    dawn: nullable(cross(CIVIL, -1), toLocal),
    sunrise: nullable(cross(RISE, -1), toLocal),
    noon: toLocal(noonMin),
    sunset: nullable(cross(RISE, 1), toLocal),
    dusk: nullable(cross(CIVIL, 1), toLocal),
    peak: 90 - Math.abs(lat - decl / R),
    clockAhead: Math.round(off - (4 * lon + orbit(base + noonMin * 60000).eqTime)),
  };
  if (days.size > 8) days.clear();
  days.set(key, day);
  return day;
}

function nullable(v: number | null, f: (v: number) => number) {
  return v == null ? null : f(v);
}

/** UTC minute (from `base`, a UTC midnight) the sun crosses an elevation:
    side -1 before solar noon, +1 after. Null if it never does that day. */
function crossUtc(base: number, elev: number, side: -1 | 1, lat: number, lon: number) {
  const la = lat * R;
  let t = 720 - 4 * lon - orbit(base + 720 * 60000).eqTime;
  for (let i = 0; i < 3; i++) {
    const { decl, eqTime } = orbit(base + t * 60000);
    const cosH = (Math.sin(elev * R) - Math.sin(la) * Math.sin(decl)) / (Math.cos(la) * Math.cos(decl));
    if (cosH > 1 || cosH < -1) return null;
    t = 720 - 4 * (lon - side * (Math.acos(cosH) / R)) - eqTime;
  }
  return t;
}

/** Toulouse hour the sun crosses an elevation today (side -1 morning, +1 evening). */
export function crossLocal(elev: number, side: -1 | 1, ref: Date = new Date()) {
  const p = parts(ref, TOULOUSE.tz);
  const t = crossUtc(Date.UTC(p.y, p.mo - 1, p.d), elev, side, TOULOUSE.lat, TOULOUSE.lon);
  return t == null ? null : ((((t + tzOffset(ref)) / 60) % 24) + 24) % 24;
}

/** The moon's phase, 0 = new, 0.5 = full (synodic month from a known new moon). */
export function moonPhase(d: Date) {
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((d.getTime() - ref) / 86400000 / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * Where the moon is, near enough for a sky: placed on the ecliptic at its
 * phase angle from the sun (its ~5° orbital tilt ignored), then turned into
 * elevation and azimuth with the sidereal clock. A few degrees off at most.
 */
export function moonAt(d: Date | number, lat: number = TOULOUSE.lat, lon: number = TOULOUSE.lon) {
  const ms = typeof d === "number" ? d : d.getTime();
  const phase = moonPhase(new Date(ms));
  const { lambda, eps } = orbit(ms);
  const lm = lambda + 2 * Math.PI * phase;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lm));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lm), Math.cos(lm)) / R;
  const gmst = 280.46061837 + 360.98564736629 * (ms / 86400000 + 2440587.5 - 2451545);
  const ha = ((((gmst + lon - ra) % 360) + 540) % 360) - 180;
  const la = lat * R;
  const sinEl = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha * R);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) / R;
  const az = Math.atan2(Math.sin(ha * R), Math.cos(ha * R) * Math.sin(la) - Math.tan(decl) * Math.cos(la)) / R + 180;
  return { elevation, azimuth: ((az % 360) + 360) % 360, phase, lit: (1 - Math.cos(2 * Math.PI * phase)) / 2 };
}

/** "19:13" from a fractional hour. */
export function fmtHour(h: number) {
  const m = Math.round(h * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

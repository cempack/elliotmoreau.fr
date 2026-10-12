import type { CurrentAway, PlaceRow } from "./content";

/**
 * The IANA time zone of a place on the Atlas, so "15:42 in Tokyo" follows
 * daylight saving like a real clock. One zone per country, split by
 * longitude (and latitude) for the countries that span several; anything
 * unknown falls back to a fixed offset from the longitude.
 */

const ONE: Record<string, string> = {
  FR: "Europe/Paris", GB: "Europe/London", IE: "Europe/Dublin", ES: "Europe/Madrid", PT: "Europe/Lisbon",
  IT: "Europe/Rome", DE: "Europe/Berlin", NL: "Europe/Amsterdam", BE: "Europe/Brussels", LU: "Europe/Luxembourg",
  CH: "Europe/Zurich", AT: "Europe/Vienna", DK: "Europe/Copenhagen", NO: "Europe/Oslo", SE: "Europe/Stockholm",
  FI: "Europe/Helsinki", IS: "Atlantic/Reykjavik", PL: "Europe/Warsaw", CZ: "Europe/Prague", SK: "Europe/Bratislava",
  HU: "Europe/Budapest", SI: "Europe/Ljubljana", HR: "Europe/Zagreb", GR: "Europe/Athens", TR: "Europe/Istanbul",
  RO: "Europe/Bucharest", BG: "Europe/Sofia", EE: "Europe/Tallinn", LV: "Europe/Riga", LT: "Europe/Vilnius",
  UA: "Europe/Kyiv", MT: "Europe/Malta", CY: "Asia/Nicosia", MC: "Europe/Monaco", AD: "Europe/Andorra",
  MA: "Africa/Casablanca", TN: "Africa/Tunis", EG: "Africa/Cairo", ZA: "Africa/Johannesburg", KE: "Africa/Nairobi",
  SN: "Africa/Dakar", NG: "Africa/Lagos", TZ: "Africa/Dar_es_Salaam", MU: "Indian/Mauritius", RE: "Indian/Reunion",
  JP: "Asia/Tokyo", KR: "Asia/Seoul", CN: "Asia/Shanghai", HK: "Asia/Hong_Kong", TW: "Asia/Taipei", SG: "Asia/Singapore",
  TH: "Asia/Bangkok", VN: "Asia/Ho_Chi_Minh", MY: "Asia/Kuala_Lumpur", PH: "Asia/Manila", IN: "Asia/Kolkata",
  NP: "Asia/Kathmandu", LK: "Asia/Colombo", AE: "Asia/Dubai", IL: "Asia/Jerusalem", JO: "Asia/Amman", GE: "Asia/Tbilisi",
  NZ: "Pacific/Auckland", FJ: "Pacific/Fiji", PF: "Pacific/Tahiti", NC: "Pacific/Noumea",
  AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago", PE: "America/Lima", CO: "America/Bogota",
  UY: "America/Montevideo", CR: "America/Costa_Rica", CU: "America/Havana", GP: "America/Guadeloupe",
  MQ: "America/Martinique", GF: "America/Cayenne", PM: "America/Miquelon",
};

function split(iso: string, lat: number, lon: number): string | undefined {
  switch (iso) {
    case "US":
      if (lat > 51 && lon < -130) return "America/Anchorage";
      if (lon < -154) return "Pacific/Honolulu";
      if (lon < -114.5) return "America/Los_Angeles";
      if (lon < -102) return lat < 37 && lon < -109 ? "America/Phoenix" : "America/Denver";
      if (lon < -86.5) return "America/Chicago";
      return "America/New_York";
    case "CA":
      if (lon < -120) return "America/Vancouver";
      if (lon < -110) return "America/Edmonton";
      if (lon < -101.5) return "America/Regina";
      if (lon < -90) return "America/Winnipeg";
      if (lon < -67) return "America/Toronto";
      if (lon < -59.5 || lat < 46.5) return "America/Halifax";
      return "America/St_Johns";
    case "MX":
      return lon < -106 ? "America/Tijuana" : "America/Mexico_City";
    case "BR":
      return lon < -60 ? "America/Manaus" : lon < -45 && lat > -10 ? "America/Fortaleza" : "America/Sao_Paulo";
    case "AU":
      if (lon < 129) return "Australia/Perth";
      if (lon < 141) return lat > -26 ? "Australia/Darwin" : "Australia/Adelaide";
      return lat > -28.5 ? "Australia/Brisbane" : lat < -39.5 ? "Australia/Hobart" : "Australia/Sydney";
    case "RU":
      return lon < 40 ? "Europe/Moscow" : lon < 60 ? "Asia/Yekaterinburg" : lon < 100 ? "Asia/Novosibirsk" : "Asia/Vladivostok";
    case "ID":
      return lon < 115 ? "Asia/Jakarta" : lon < 125 ? "Asia/Makassar" : "Asia/Jayapura";
    case "ES":
      // the Canaries keep Lisbon's time
      return lon < -13 ? "Atlantic/Canary" : "Europe/Madrid";
    case "PT":
      return lon < -20 ? "Atlantic/Azores" : lon < -15 ? "Atlantic/Madeira" : "Europe/Lisbon";
    default:
      return undefined;
  }
}

/** "Etc/GMT-9" is UTC+9 (the sign is inverted in that namespace) */
const fromLongitude = (lon: number) => {
  const h = Math.max(-12, Math.min(14, Math.round(lon / 15)));
  return h === 0 ? "UTC" : `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`;
};

export function tzForPlace(p: Pick<PlaceRow, "iso" | "lat" | "lon">): string {
  const iso = (p.iso || "").toUpperCase();
  return split(iso, p.lat, p.lon) ?? ONE[iso] ?? fromLongitude(p.lon);
}

/** where an away actually is in time: its own zone, else its place's, else none */
export function tzForAway(a: CurrentAway | null | undefined): string | undefined {
  if (!a) return undefined;
  if (a.tz) return a.tz;
  if (a.place) return tzForPlace(a.place);
  return undefined;
}

/** "15:42" in a zone (24 h; the menu bar's style) */
export function clockIn(tz: string, at: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  } catch {
    return "";
  }
}

/**
 * Where a visitor probably is, from nothing but their browser's time zone
 * (no location prompt, nothing sent anywhere): the city an IANA zone is
 * named after. Mail uses it to draw the route a letter takes to Toulouse.
 * Zones not listed here return null and the route is left out.
 */

const CITIES: Record<string, [number, number]> = {
  // Europe
  "Europe/Paris": [48.86, 2.35], "Europe/London": [51.51, -0.13], "Europe/Dublin": [53.35, -6.26], "Europe/Madrid": [40.42, -3.7],
  "Europe/Lisbon": [38.72, -9.14], "Europe/Rome": [41.9, 12.5], "Europe/Berlin": [52.52, 13.4], "Europe/Amsterdam": [52.37, 4.9],
  "Europe/Brussels": [50.85, 4.35], "Europe/Luxembourg": [49.61, 6.13], "Europe/Zurich": [47.38, 8.54], "Europe/Vienna": [48.21, 16.37],
  "Europe/Copenhagen": [55.68, 12.57], "Europe/Oslo": [59.91, 10.75], "Europe/Stockholm": [59.33, 18.07], "Europe/Helsinki": [60.17, 24.94],
  "Atlantic/Reykjavik": [64.15, -21.94], "Europe/Warsaw": [52.23, 21.01], "Europe/Prague": [50.08, 14.44], "Europe/Bratislava": [48.15, 17.11],
  "Europe/Budapest": [47.5, 19.04], "Europe/Ljubljana": [46.06, 14.51], "Europe/Zagreb": [45.81, 15.98], "Europe/Belgrade": [44.79, 20.45],
  "Europe/Athens": [37.98, 23.73], "Europe/Istanbul": [41.01, 28.98], "Europe/Bucharest": [44.43, 26.1], "Europe/Sofia": [42.7, 23.32],
  "Europe/Tallinn": [59.44, 24.75], "Europe/Riga": [56.95, 24.11], "Europe/Vilnius": [54.69, 25.28], "Europe/Kyiv": [50.45, 30.52],
  "Europe/Kiev": [50.45, 30.52], "Europe/Malta": [35.9, 14.51], "Asia/Nicosia": [35.19, 33.38], "Europe/Monaco": [43.74, 7.42],
  "Europe/Andorra": [42.51, 1.52], "Europe/Moscow": [55.76, 37.62], "Europe/Minsk": [53.9, 27.56], "Europe/Chisinau": [47.01, 28.86],
  "Europe/Tirane": [41.33, 19.82], "Europe/Sarajevo": [43.86, 18.41], "Europe/Skopje": [42.0, 21.43], "Europe/Podgorica": [42.44, 19.26],
  "Atlantic/Canary": [28.12, -15.43], "Atlantic/Madeira": [32.65, -16.91], "Atlantic/Azores": [37.74, -25.67], "Europe/Gibraltar": [36.14, -5.35],
  // Africa
  "Africa/Casablanca": [33.57, -7.59], "Africa/Algiers": [36.75, 3.06], "Africa/Tunis": [36.81, 10.18], "Africa/Cairo": [30.04, 31.24],
  "Africa/Johannesburg": [-26.2, 28.05], "Africa/Nairobi": [-1.29, 36.82], "Africa/Dakar": [14.72, -17.47], "Africa/Lagos": [6.52, 3.38],
  "Africa/Abidjan": [5.36, -4.01], "Africa/Accra": [5.6, -0.19], "Africa/Dar_es_Salaam": [-6.79, 39.21], "Africa/Kinshasa": [-4.44, 15.27],
  "Africa/Addis_Ababa": [9.03, 38.74], "Indian/Mauritius": [-20.16, 57.5], "Indian/Reunion": [-20.88, 55.45],
  // Asia
  "Asia/Tokyo": [35.68, 139.69], "Asia/Seoul": [37.57, 126.98], "Asia/Shanghai": [31.23, 121.47], "Asia/Hong_Kong": [22.32, 114.17],
  "Asia/Taipei": [25.03, 121.57], "Asia/Singapore": [1.35, 103.82], "Asia/Bangkok": [13.76, 100.5], "Asia/Ho_Chi_Minh": [10.82, 106.63],
  "Asia/Saigon": [10.82, 106.63], "Asia/Kuala_Lumpur": [3.14, 101.69], "Asia/Manila": [14.6, 120.98], "Asia/Jakarta": [-6.21, 106.85],
  "Asia/Kolkata": [22.57, 88.36], "Asia/Calcutta": [22.57, 88.36], "Asia/Kathmandu": [27.72, 85.32], "Asia/Colombo": [6.93, 79.86],
  "Asia/Dhaka": [23.81, 90.41], "Asia/Karachi": [24.86, 67.0], "Asia/Dubai": [25.2, 55.27], "Asia/Qatar": [25.29, 51.53],
  "Asia/Riyadh": [24.71, 46.68], "Asia/Tehran": [35.69, 51.39], "Asia/Jerusalem": [31.77, 35.21], "Asia/Tel_Aviv": [32.09, 34.78],
  "Asia/Beirut": [33.89, 35.5], "Asia/Amman": [31.95, 35.93], "Asia/Tbilisi": [41.72, 44.79], "Asia/Yerevan": [40.18, 44.51],
  "Asia/Baku": [40.41, 49.87], "Asia/Almaty": [43.24, 76.89], "Asia/Tashkent": [41.3, 69.24], "Asia/Yekaterinburg": [56.84, 60.6],
  "Asia/Novosibirsk": [55.01, 82.93], "Asia/Vladivostok": [43.12, 131.89], "Asia/Ulaanbaatar": [47.89, 106.91],
  // Oceania
  "Australia/Sydney": [-33.87, 151.21], "Australia/Melbourne": [-37.81, 144.96], "Australia/Brisbane": [-27.47, 153.03],
  "Australia/Perth": [-31.95, 115.86], "Australia/Adelaide": [-34.93, 138.6], "Australia/Darwin": [-12.46, 130.84], "Australia/Hobart": [-42.88, 147.33],
  "Pacific/Auckland": [-36.85, 174.76], "Pacific/Fiji": [-18.14, 178.44], "Pacific/Tahiti": [-17.54, -149.57], "Pacific/Noumea": [-22.28, 166.46],
  "Pacific/Honolulu": [21.31, -157.86],
  // Americas
  "America/New_York": [40.71, -74.01], "America/Chicago": [41.88, -87.63], "America/Denver": [39.74, -104.99], "America/Phoenix": [33.45, -112.07],
  "America/Los_Angeles": [34.05, -118.24], "America/Anchorage": [61.22, -149.9], "America/Detroit": [42.33, -83.05], "America/Toronto": [43.65, -79.38],
  "America/Montreal": [45.5, -73.57], "America/Vancouver": [49.28, -123.12], "America/Edmonton": [53.55, -113.49], "America/Winnipeg": [49.9, -97.14],
  "America/Regina": [50.45, -104.62], "America/Halifax": [44.65, -63.58], "America/St_Johns": [47.56, -52.71], "America/Mexico_City": [19.43, -99.13],
  "America/Tijuana": [32.51, -117.04], "America/Bogota": [4.71, -74.07], "America/Lima": [-12.05, -77.04], "America/Santiago": [-33.45, -70.67],
  "America/Argentina/Buenos_Aires": [-34.6, -58.38], "America/Buenos_Aires": [-34.6, -58.38], "America/Sao_Paulo": [-23.55, -46.63],
  "America/Fortaleza": [-3.73, -38.53], "America/Manaus": [-3.12, -60.02], "America/Montevideo": [-34.9, -56.16], "America/Caracas": [10.48, -66.9],
  "America/Panama": [8.98, -79.52], "America/Costa_Rica": [9.93, -84.08], "America/Havana": [23.11, -82.37], "America/Puerto_Rico": [18.47, -66.11],
  "America/Guadeloupe": [16.24, -61.53], "America/Martinique": [14.6, -61.07], "America/Cayenne": [4.92, -52.31], "America/Miquelon": [47.1, -56.38],
};

export type TzCity = { lat: number; lon: number; name: string };

/** the visitor's zone and the city it's named after, or null when unknown */
export function cityOfZone(tz: string | undefined): TzCity | null {
  if (!tz) return null;
  const at = CITIES[tz];
  if (!at) return null;
  const name = tz.split("/").pop()!.replace(/_/g, " ");
  return { lat: at[0], lon: at[1], name: name === "Kiev" ? "Kyiv" : name === "Calcutta" ? "Kolkata" : name === "Saigon" ? "Ho Chi Minh" : name };
}

export function visitorZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

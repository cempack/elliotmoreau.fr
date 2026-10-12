import "server-only";

/**
 * Toulouse's weather right now, for the wallpaper (Autan in the
 * wallpaper) and the sundial's caption: Open-Meteo's current conditions at
 * the Pont Saint-Pierre (no key), fetched on the server and cached 15
 * minutes. null when it doesn't answer: the scene stays clear.
 */

export type Weather = {
  /** °C */
  temp: number;
  /** WMO weather code */
  code: number;
  /** 0–100 */
  cloud: number;
  /** mm in the last hour */
  precip: number;
  /** km/h */
  wind: number;
  /** degrees the wind comes from (90 = east) */
  windDir: number;
  /** metres */
  visibility: number;
  at: string;
};

export type Sky = "clear" | "cloudy" | "rain" | "fog" | "autan";

const URL_TLS =
  "https://api.open-meteo.com/v1/forecast?latitude=43.60&longitude=1.44" +
  "&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility" +
  "&wind_speed_unit=kmh&timezone=Europe%2FParis";

type OM = {
  current?: {
    time: string;
    temperature_2m: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    visibility?: number;
  };
};

export async function getWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(URL_TLS, { next: { revalidate: 900 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const c = ((await res.json()) as OM).current;
    if (!c) return null;
    return {
      temp: Math.round(c.temperature_2m),
      code: c.weather_code,
      cloud: c.cloud_cover,
      precip: c.precipitation,
      wind: Math.round(c.wind_speed_10m),
      windDir: c.wind_direction_10m,
      visibility: c.visibility ?? 20_000,
      at: c.time,
    };
  } catch {
    return null;
  }
}

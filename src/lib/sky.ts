import type { Weather } from "./weather";

/** what the scene shows, from the weather: the autan first (it's Toulouse's wind), then rain, fog, cloud */
export function skyOf(w: Weather | null | undefined): "clear" | "cloudy" | "rain" | "fog" | "autan" {
  if (!w) return "clear";
  // the autan blows from the south-east, hard
  if (w.wind >= 30 && w.windDir >= 90 && w.windDir <= 170) return "autan";
  const rainy = (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82) || w.code >= 95 || w.precip >= 0.2;
  if (rainy) return "rain";
  if (w.code === 45 || w.code === 48 || w.visibility < 1500) return "fog";
  if (w.cloud >= 65 || w.code === 3) return "cloudy";
  return "clear";
}

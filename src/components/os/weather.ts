"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Weather } from "@/lib/weather";
import { skyOf } from "@/lib/sky";
import { useSiteData } from "./SiteData";

/**
 * Toulouse's weather for the wallpaper and the clock widget: the server's
 * reading (Open-Meteo, 15 minutes old at most), or `?weather=autan|rain|
 * fog|cloudy|clear` to see a sky that isn't today's.
 */

export type WeatherKind = ReturnType<typeof skyOf>;
const KINDS: readonly WeatherKind[] = ["clear", "cloudy", "rain", "fog", "autan"];

/** what each forced sky stands for, over whatever the real reading is */
const FORCED: Record<WeatherKind, Omit<Weather, "temp" | "at">> = {
  clear: { code: 0, cloud: 5, precip: 0, wind: 8, windDir: 300, visibility: 30_000 },
  cloudy: { code: 3, cloud: 85, precip: 0, wind: 16, windDir: 290, visibility: 20_000 },
  rain: { code: 63, cloud: 100, precip: 2.4, wind: 18, windDir: 280, visibility: 8_000 },
  fog: { code: 45, cloud: 100, precip: 0, wind: 4, windDir: 200, visibility: 600 },
  autan: { code: 1, cloud: 20, precip: 0, wind: 46, windDir: 125, visibility: 40_000 },
};

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const readForced = () => {
  const v = new URLSearchParams(window.location.search).get("weather");
  return v && (KINDS as readonly string[]).includes(v) ? (v as WeatherKind) : null;
};

export function useWeather(): { weather: Weather | null; kind: WeatherKind } {
  const real = useSiteData().weather;
  const forced = useSyncExternalStore(subscribe, readForced, () => null);
  return useMemo(() => {
    if (!forced) return { weather: real, kind: skyOf(real) };
    const weather: Weather = { temp: real?.temp ?? 14, at: real?.at ?? "", ...FORCED[forced] };
    return { weather, kind: forced };
  }, [real, forced]);
}

/** -1 or 1: which way the wind pushes things across the scene. The view
    faces south (east on the left), so a wind from the east or the autan's
    south-east blows left to right. */
export const windSide = (w: Weather | null) => (!w || Math.sin((w.windDir * Math.PI) / 180) >= 0 ? 1 : -1);

"use client";

import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";

/** "{n} places" → "6 places" */
export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export const capitalize = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

/** Whole kilometres in the reader's locale ("6,912" / "6 912"). */
export function useKm() {
  const { lang } = useI18n();
  return (km: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 0 }).format(km);
}

/** narrow no-break space: French puts one between a number and its unit */
const NNBSP = " ";
const NF: Record<Locale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  fr: new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** One coordinate: "46.60°N" in English, "46,60° N" in French (O for west). */
export function fmtAxis(v: number, axis: "lat" | "lon", lang: Locale, digits = 2) {
  const hemi = axis === "lat" ? (v >= 0 ? "N" : "S") : v >= 0 ? "E" : lang === "fr" ? "O" : "W";
  const n = digits === 2 ? NF[lang].format(Math.abs(v)) : String(Math.round(Math.abs(v)));
  return lang === "fr" ? `${n}°${NNBSP}${hemi}` : `${n}°${hemi}`;
}

/** "46.60°N 1.89°E" / "46,60° N 1,89° E" */
export const fmtCoordsL = (lat: number, lon: number, lang: Locale) =>
  `${fmtAxis(lat, "lat", lang)} ${fmtAxis(lon, "lon", lang)}`;

export function useCoords() {
  const { lang } = useI18n();
  return (lat: number, lon: number) => fmtCoordsL(lat, lon, lang);
}

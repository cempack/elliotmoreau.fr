"use client";

import { useI18n } from "@/i18n/client";

/** "{n} places" → "6 places" */
export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export const capitalize = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

/** Whole kilometres in the reader's locale ("6,912" / "6 912"). */
export function useKm() {
  const { lang } = useI18n();
  return (km: number) => new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 0 }).format(km);
}

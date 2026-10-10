/**
 * Locales live in the URL: English at the root (`/work`), French under
 * `/fr` (`/fr/work`). `src/proxy.ts` rewrites unprefixed paths to `/en/*`
 * internally, so every page is statically built once per locale.
 */
export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LANG_COOKIE = "em-lang";

export const hasLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

/** Public URL for an app path in a locale: ("fr", "/work") → "/fr/work". */
export function localePath(lang: Locale, path = "/") {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${lang}` : `/${lang}${clean}`;
}

/** Strip a locale prefix from a pathname: "/fr/work" → "/work". */
export function stripLocale(pathname: string) {
  const m = pathname.match(/^\/(en|fr)(?=\/|$)/);
  const rest = m ? pathname.slice(m[0].length) : pathname;
  return rest === "" ? "/" : rest;
}

export const SITE_URL = "https://elliotmoreau.fr";

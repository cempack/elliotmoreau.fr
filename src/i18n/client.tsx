"use client";

import { createContext, useContext, useMemo } from "react";
import { LANG_COOKIE, localePath, stripLocale, type Locale } from "./config";
import type { Dict } from "./index";

type I18n = {
  lang: Locale;
  /** the other locale, for the language switch */
  other: Locale;
  t: Dict;
  /** localized href for an app path: path("/work") → "/fr/work" in French */
  path: (p: string) => string;
};

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ lang, dict, children }: { lang: Locale; dict: Dict; children: React.ReactNode }) {
  const value = useMemo<I18n>(
    () => ({ lang, other: lang === "en" ? "fr" : "en", t: dict, path: (p) => localePath(lang, p) }),
    [lang, dict]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

/** Remember the choice so the proxy sends future visits to the right locale. */
export function rememberLocale(lang: Locale) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

/** Same page, other language. */
export function switchLocaleHref(pathname: string, to: Locale) {
  return localePath(to, stripLocale(pathname));
}

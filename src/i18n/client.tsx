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

/**
 * In development, reading a namespace this page didn't send (the layout
 * sends the shell's, each page adds its app's with <I18nScope>) throws with
 * its name instead of failing later on `undefined`.
 */
function guard(t: Dict): Dict {
  if (process.env.NODE_ENV === "production") return t;
  return new Proxy(t, {
    get(target, key) {
      if (typeof key === "string" && !(key in target) && key !== "then" && key !== "$$typeof" && key !== "toJSON")
        throw new Error(`i18n: namespace "${key}" isn't loaded here; add it to this page's <I18nScope>`);
      return Reflect.get(target, key);
    },
  });
}

export function I18nProvider({ lang, dict, children }: { lang: Locale; dict: Dict; children: React.ReactNode }) {
  const value = useMemo<I18n>(
    () => ({ lang, other: lang === "en" ? "fr" : "en", t: guard(dict), path: (p) => localePath(lang, p) }),
    [lang, dict]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Adds a page's own namespaces (from getNamespaces) to the shell's. */
export function I18nScope({ dict, children }: { dict: Partial<Dict>; children: React.ReactNode }) {
  const parent = useI18n();
  const value = useMemo<I18n>(() => ({ ...parent, t: guard({ ...parent.t, ...dict } as Dict) }), [parent, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The same, for a segment that doesn't know its locale on the server
 * (not-found.tsx gets no params): both locales are sent, the context picks.
 */
export function I18nScopeByLang({ dicts, children }: { dicts: Record<Locale, Partial<Dict>>; children: React.ReactNode }) {
  const { lang } = useI18n();
  return <I18nScope dict={dicts[lang]}>{children}</I18nScope>;
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

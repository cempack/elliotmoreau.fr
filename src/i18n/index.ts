import "server-only";
import meta from "./dict/meta";
import shell from "./dict/shell";
import home from "./dict/home";
import work from "./dict/work";
import writing from "./dict/writing";
import atlas from "./dict/atlas";
import now from "./dict/now";
import contact from "./dict/contact";
import notfound from "./dict/notfound";
import dock from "./dict/dock";
import windowing from "./dict/windowing";
import system from "./dict/system";
import type { Locale } from "./config";

const pick = (l: Locale) => ({
  meta: meta[l],
  shell: shell[l],
  home: home[l],
  work: work[l],
  writing: writing[l],
  atlas: atlas[l],
  now: now[l],
  contact: contact[l],
  notfound: notfound[l],
  dock: dock[l],
  windowing: windowing[l],
  system: system[l],
});

export type Dict = ReturnType<typeof pick>;

/** Every string for a locale (server-side; the client gets slices, below). */
export function getDict(lang: Locale): Dict {
  return pick(lang);
}

/** the namespaces the always-mounted shell reads (menu bar, dock, windows, Spotlight, Terminal) */
const SHELL = ["shell", "dock", "windowing", "system"] as const;
export type Namespace = keyof Dict;

/**
 * The shell's strings only: the root layout hands these to I18nProvider,
 * and each page adds its own app's namespace with <I18nScope>, so a page's
 * HTML carries its own strings rather than every app's. Typed as the full
 * Dict so call sites stay the same; in development a read of a namespace
 * that wasn't sent throws (see I18nProvider).
 */
export function getShellDict(lang: Locale): Dict {
  const d = pick(lang);
  return Object.fromEntries(SHELL.map((k) => [k, d[k]])) as unknown as Dict;
}

/** one or more app namespaces, for <I18nScope> */
export function getNamespaces<K extends Namespace>(lang: Locale, ...keys: K[]): Pick<Dict, K> {
  const d = pick(lang);
  return Object.fromEntries(keys.map((k) => [k, d[k]])) as unknown as Pick<Dict, K>;
}

export * from "./config";

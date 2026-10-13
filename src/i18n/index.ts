import "server-only";
import { getCopy } from "@/server/content";
import { baseDict, withEdits, type Dict } from "./base";
import type { Locale } from "./config";

export type { Dict } from "./base";

/**
 * A locale's strings with the admin panel's edits (Texts) laid over the
 * ones written in src/i18n/dict. Pages render from the database, so an
 * edit shows on each page's next render (the panel marks them stale).
 * The patched dictionary is kept until the edits change.
 */
const patched = new Map<Locale, { key: string; dict: Dict }>();
function pick(lang: Locale): Dict {
  const edits = getCopy()[lang];
  const key = JSON.stringify(edits);
  const hit = patched.get(lang);
  if (hit && hit.key === key) return hit.dict;
  const dict = withEdits(baseDict(lang), edits);
  patched.set(lang, { key, dict });
  return dict;
}

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

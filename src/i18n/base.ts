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
import admin from "./dict/admin";
import type { Locale } from "./config";

/**
 * The strings as written in src/i18n/dict, before any edit from the admin
 * panel (src/i18n/index.ts lays those over them). Also what the panel's
 * Texts section lists and checks edits against.
 */
export const baseDict = (l: Locale) => ({
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
  admin: admin[l],
});

export type Dict = ReturnType<typeof baseDict>;

/** the namespaces the Texts section can change (the panel's own words stay as written, so it can't be broken from inside) */
export const EDITABLE = ["home", "system", "dock", "work", "writing", "atlas", "now", "contact", "shell", "windowing", "notfound", "meta"] as const;

const flat = new Map<Locale, Record<string, string>>();

/** every string of the editable namespaces, by path: "home.role" → "Student at Epitech, Toulouse" (array items by index) */
export function flatStrings(lang: Locale): Record<string, string> {
  const hit = flat.get(lang);
  if (hit) return hit;
  const d = baseDict(lang);
  const out: Record<string, string> = {};
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") out[path] = v;
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  for (const ns of EDITABLE) walk(d[ns], ns);
  flat.set(lang, out);
  return out;
}

/** the {placeholders} a string fills in, sorted: an edit must keep the same ones */
export function placeholders(s: string): string[] {
  return [...new Set(Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]))].sort();
}

/**
 * The dictionary with edits laid over it: each edited namespace is cloned
 * and its paths set; the rest are shared with the base. Paths that no
 * longer exist (a string renamed since) are skipped.
 */
export function withEdits(base: Dict, edits: Record<string, string>): Dict {
  const keys = Object.keys(edits);
  if (!keys.length) return base;
  const out = { ...base } as Record<string, unknown>;
  const cloned = new Set<string>();
  for (const path of keys) {
    const parts = path.split(".");
    const ns = parts[0];
    if (!(ns in out) || !(EDITABLE as readonly string[]).includes(ns)) continue;
    if (!cloned.has(ns)) {
      out[ns] = structuredClone(out[ns]);
      cloned.add(ns);
    }
    let node = out[ns] as Record<string, unknown>;
    for (let i = 1; i < parts.length - 1 && node; i++) node = node[parts[i]] as Record<string, unknown>;
    const last = parts[parts.length - 1];
    if (node && typeof node === "object" && typeof node[last] === "string") node[last] = edits[path];
  }
  return out as Dict;
}

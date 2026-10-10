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
import story from "./dict/story";
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
  story: story[l],
});

export type Dict = ReturnType<typeof pick>;

/** Every string for a locale (small; shared with client components via I18nProvider). */
export function getDict(lang: Locale): Dict {
  return pick(lang);
}

export * from "./config";

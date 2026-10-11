import type { RepoInfo } from "@/lib/github";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";

/* ───────────────────────────── types ───────────────────────────── */

export type SortKey = "recent" | "stars" | "name";
/** "auto" lets CSS decide (icons ≥768px, list below) so SSR never flashes */
export type ViewMode = "auto" | "icons" | "list";
export type Filter =
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "recent" }
  | { kind: "lang"; value: string }
  | { kind: "tag"; value: string };

export const SORTS: SortKey[] = ["recent", "stars", "name"];

/* ───────────────────────────── config ───────────────────────────── */

/**
 * The featured project, first match wins. Edit freely: names that no
 * longer exist are skipped, and with no match the most-starred repo is
 * featured instead.
 */
export const PINNED: string[] = ["omarchy-dos-moos-theme"];

/** "Recent" is the N most recently pushed repos (clock-free, so SSR-safe). */
export const RECENT_COUNT = 5;

/* ───────────────────────────── helpers ───────────────────────────── */

export const sameFilter = (a: Filter, b: Filter) =>
  a.kind === b.kind && ("value" in a ? a.value : "") === ("value" in b ? b.value : "");

const time = (r: RepoInfo) => Date.parse(r.pushedAt) || 0;

export const langColor = (lang: string) => LANG_COLORS[lang] ?? LANG_FALLBACK;

/** DOM id of a repo's item in the collection. */
export const itemId = (name: string) => `app-work-item-${name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;

/** Lowercase, accent-free, with separators folded to spaces. */
export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_./#]+/g, " ");
}

export function searchTerms(q: string) {
  return normalize(q).split(/\s+/).filter(Boolean);
}

/** Every term must appear in the name, description, language or topics. */
export function matches(repo: RepoInfo, terms: string[]) {
  if (!terms.length) return true;
  const hay = normalize([repo.name, repo.description, repo.language, ...repo.topics].join(" "));
  return terms.every((t) => hay.includes(t));
}

export function sortRepos(list: RepoInfo[], key: SortKey) {
  const out = [...list];
  if (key === "recent") out.sort((a, b) => time(b) - time(a));
  else if (key === "stars") out.sort((a, b) => b.stars - a.stars || time(b) - time(a));
  else out.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
  return out;
}

export function recentNames(repos: RepoInfo[]) {
  return new Set(sortRepos(repos, "recent").slice(0, RECENT_COUNT).map((r) => r.name));
}

export function inFilter(repo: RepoInfo, f: Filter, recent: Set<string>) {
  switch (f.kind) {
    case "all":
      return true;
    case "starred":
      return repo.stars > 0;
    case "recent":
      return recent.has(repo.name);
    case "lang":
      return repo.language === f.value;
    case "tag":
      return repo.topics.includes(f.value);
  }
}

/**
 * [value, count] pairs: most frequent first, then by the stars of the repos
 * that carry it (so the owner's core topics lead a field of ones), then
 * alphabetical.
 */
function tally(pairs: [string, number][]) {
  const m = new Map<string, { n: number; stars: number }>();
  for (const [v, stars] of pairs) {
    if (!v) continue;
    const e = m.get(v) ?? { n: 0, stars: 0 };
    e.n += 1;
    e.stars += stars;
    m.set(v, e);
  }
  return [...m]
    .sort((a, b) => b[1].n - a[1].n || b[1].stars - a[1].stars || a[0].localeCompare(b[0]))
    .map(([v, e]) => [v, e.n] as [string, number]);
}

export const languagesOf = (repos: RepoInfo[]) => tally(repos.map((r) => [r.language, r.stars]));
export const tagsOf = (repos: RepoInfo[]) => tally(repos.flatMap((r) => r.topics.map((t) => [t, r.stars] as [string, number])));

export function pickFeatured(repos: RepoInfo[]): RepoInfo | null {
  for (const name of PINNED) {
    const hit = repos.find((r) => r.name === name);
    if (hit) return hit;
  }
  return sortRepos(repos, "stars")[0] ?? null;
}

/* ───────────────────────────── text ───────────────────────────── */

/** "{n} items" → "6 items" */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** English: singular for 1. French: singular for 0 and 1. */
export function plural(lang: string, n: number, one: string, other: string) {
  const single = lang === "fr" ? n < 2 : n === 1;
  return fmt(single ? one : other, { n: compact(n, lang) });
}

/** Deterministic short numbers (no Intl: identical on server and client). */
export function compact(n: number, lang: string) {
  if (n < 1000) return String(n);
  const k = n < 10_000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") : String(Math.round(n / 1000));
  return (lang === "fr" ? k.replace(".", ",") + " k" : k + "k");
}

/** Split `text` into runs, flagging the parts that match any search term. */
export function highlight(text: string, terms: string[]) {
  if (!terms.length) return [{ text, hit: false }];
  // per character, so indices stay aligned with `text`
  const lower = text
    .split("")
    .map((c) => normalize(c)[0] ?? " ")
    .join("");
  const hits = new Array<boolean>(text.length).fill(false);
  for (const t of terms) {
    let i = lower.indexOf(t);
    while (i !== -1 && t) {
      for (let j = i; j < i + t.length && j < hits.length; j++) hits[j] = true;
      i = lower.indexOf(t, i + t.length);
    }
  }
  const runs: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.hit === hits[i]) last.text += text[i];
    else runs.push({ text: text[i], hit: hits[i] });
  }
  return runs;
}

/** The mono path in the title bar: ~/work, ~/work/starred, ~/work/lang/go … */
export function pathFor(f: Filter, q: string) {
  const base =
    f.kind === "all"
      ? "~/work"
      : f.kind === "lang"
        ? `~/work/lang/${f.value.toLowerCase()}`
        : f.kind === "tag"
          ? `~/work/tags/${f.value}`
          : `~/work/${f.kind}`;
  const query = q.trim();
  return query ? `${base}?q=${query.length > 18 ? query.slice(0, 17) + "…" : query}` : base;
}

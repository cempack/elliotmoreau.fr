import type { AppId } from "@/components/os/apps";

/**
 * zsh's CORRECT option for URLs: given the address that failed, find the
 * app the visitor most likely meant ("/wrok" → work, "/blog" → writing).
 * Pure and deterministic, so the server and the client agree on it.
 */

/** Words people type for each app, in both languages (accents stripped). */
const ALIASES: Record<AppId, readonly string[]> = {
  home: ["desktop", "home", "index", "bureau", "accueil", "start", "about", "readme"],
  work: ["work", "projects", "project", "projets", "projet", "repos", "code", "portfolio", "github"],
  writing: ["writing", "blog", "posts", "post", "notes", "ecrits", "articles", "journal", "essays", "newsletter"],
  atlas: ["atlas", "travel", "travels", "map", "maps", "places", "voyages", "carte", "world"],
  now: ["now", "uses", "setup", "maintenant", "music", "listening", "colophon"],
  contact: ["contact", "mail", "email", "hello", "message", "pgp"],
};

/** The name zsh offers as the correction (the route's own segment). */
const CANONICAL: Record<AppId, string> = {
  home: "desktop",
  work: "work",
  writing: "writing",
  atlas: "atlas",
  now: "now",
  contact: "contact",
};

export type Suggestion = { app: AppId; to: string };

/** The failed address as the "command" zsh echoes: no leading slash, decoded. */
export function commandFor(path: string) {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {}
  p = p.replace(/^\/+/, "").replace(/\/+$/, "");
  return p || "/";
}

/** Long addresses keep their head and tail: "a-very-lo…ng-path". */
export function middleTruncate(s: string, max = 40) {
  const chars = [...s];
  if (chars.length <= max) return s;
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

/** Optimal string alignment distance (Levenshtein + adjacent swaps). */
function distance(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** How many typos a word of this length may carry and still count. */
const tolerance = (len: number) => (len <= 3 ? 1 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

/** First path segment, lowercased, accents and file extensions stripped. */
function tokenFor(command: string) {
  const first = command.split("/")[0] ?? "";
  return first
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, "")
    .replace(/[^a-z0-9-]/g, "");
}

export function suggest(command: string): Suggestion | null {
  const token = tokenFor(command);
  if (token.length < 2) return null;
  let best: { app: AppId; alias: string; score: number } | null = null;
  for (const app of Object.keys(ALIASES) as AppId[]) {
    for (const alias of ALIASES[app]) {
      let score: number;
      if (token === alias) score = 0;
      else if (token.length >= 3 && alias.startsWith(token)) score = 0.5;
      else {
        const d = distance(token, alias);
        if (d > tolerance(alias.length)) continue;
        score = d;
      }
      if (!best || score < best.score) best = { app, alias, score };
    }
  }
  if (!best) return null;
  // a typo is corrected to the word it misspells ("blgo" → "blog"); a
  // known word, or a deeper path under a real app, to the app itself
  const exact = best.score === 0;
  return { app: best.app, to: exact ? CANONICAL[best.app] : best.alias };
}

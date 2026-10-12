import type { AppId, PublicAppId } from "@/components/os/apps";

/**
 * zsh's CORRECT option for URLs: given the address that failed, find what
 * the visitor most likely meant. An app ("/wrok" → work, "/blog" →
 * writing), or, from the live data, one of Elliot's posts (the blog moved
 * to its own host, so old slugs are the likeliest real 404s) or repos.
 * Pure and deterministic (the data is the same on the server and the
 * client), so both render the same alert.
 */

/** Words people type for each app, in both languages (accents stripped). */
const ALIASES: Record<PublicAppId, readonly string[]> = {
  home: ["desktop", "home", "index", "bureau", "accueil", "start", "about", "readme"],
  work: ["work", "projects", "project", "projets", "projet", "repos", "code", "portfolio", "github"],
  writing: ["writing", "blog", "posts", "post", "notes", "ecrits", "articles", "journal", "essays", "newsletter"],
  atlas: ["atlas", "travel", "travels", "map", "maps", "places", "voyages", "carte", "world"],
  now: ["now", "uses", "setup", "maintenant", "music", "listening", "colophon"],
  contact: ["contact", "mail", "email", "hello", "message", "pgp"],
};

/** The name zsh offers as the correction (the route's own segment). */
const CANONICAL: Record<PublicAppId, string> = {
  home: "desktop",
  work: "work",
  writing: "writing",
  atlas: "atlas",
  now: "now",
  contact: "contact",
};

export type Suggestion =
  /** one of emOS's apps: opens in place */
  | { kind: "app"; app: AppId; to: string }
  /** a post on the blog (external): `to` is where it lives now */
  | { kind: "post"; app: "writing"; to: string; name: string; href: string }
  /** a repository on GitHub (external) */
  | { kind: "repo"; app: "work"; to: string; name: string; href: string };

export type Candidates = {
  posts: readonly { slug: string; title: string; url: string }[];
  repos: readonly { name: string; url: string }[];
};

/** Direction overrides and isolates: a URL must not be able to mirror the alert. */
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

/** The failed address as the "command" zsh echoes: no leading slash, decoded. */
export function commandFor(path: string) {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {}
  p = p.replace(BIDI, "").replace(/^\/+/, "").replace(/\/+$/, "");
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

/** A correction that points off-site, short enough to keep zsh's prompt
    on two lines: "blog.elliotmoreau.fr/ricing-a-laptop" →
    "blog.…/ricing-a-laptop" (the subdomain says where it went, the last
    segment is the part you recognise). Short ones are left alone. */
export function shortTarget(to: string, max = 30) {
  if ([...to].length <= max) return to;
  const slash = to.indexOf("/");
  if (slash < 0) return middleTruncate(to, max);
  const host = to.slice(0, slash);
  const last = to.slice(to.lastIndexOf("/") + 1);
  const label = host.split(".")[0];
  return middleTruncate(`${label}.…/${last}`, max);
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
const tolerance = (len: number) => (len <= 5 ? 1 : len <= 8 ? 2 : len <= 16 ? 3 : 4);

/** A path segment, lowercased, accents and file extensions stripped. */
function normalize(segment: string) {
  return segment
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/** 0 exact, 0.5 a prefix of it, else the typo count (null: too far). */
function score(token: string, word: string) {
  if (token === word) return 0;
  if (token.length >= 3 && word.startsWith(token)) return 0.5;
  const d = distance(token, word);
  return d > tolerance(word.length) ? null : d;
}

/** How close a segment is to a post slug or repo name (null: not close
    enough). A prefix only counts when it's most of the name. */
function closeness(token: string, name: string) {
  const w = name.toLowerCase();
  const s = token.length < w.length && w.startsWith(token) ? (token.length >= w.length * 0.6 ? 0.5 : null) : score(token, w);
  return s != null && s <= Math.max(1, Math.floor(w.length * 0.2)) ? s : null;
}

/** "https://blog.elliotmoreau.fr/ricing/" → "blog.elliotmoreau.fr/ricing" */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");

export function suggest(command: string, data?: Candidates): Suggestion | null {
  const segments = command.split("/").map(normalize).filter(Boolean);
  if (!segments.length) return null;

  // the visitor's own content first: an old post slug or a repo name in
  // any segment ("/blog/ricing-a-laptop", "/ttfx") beats an app alias
  // when it's close (a typo or two for its length)
  if (data) {
    const hits: { s: number; hit: Suggestion }[] = [];
    for (const token of segments) {
      if (token.length < 4) continue;
      for (const p of data.posts) {
        const s = closeness(token, p.slug);
        if (s != null) hits.push({ s, hit: { kind: "post", app: "writing", to: bare(p.url), name: p.title, href: p.url } });
      }
      for (const r of data.repos) {
        const s = closeness(token, r.name);
        if (s != null) hits.push({ s, hit: { kind: "repo", app: "work", to: bare(r.url), name: r.name, href: r.url } });
      }
    }
    // the closest wins; ties keep the first found (posts, then repos)
    const best = hits.reduce<(typeof hits)[number] | null>((b, h) => (!b || h.s < b.s ? h : b), null);
    if (best) return best.hit;
  }

  const token = segments[0];
  if (token.length < 2) return null;
  let best: { app: PublicAppId; alias: string; s: number } | null = null;
  for (const app of Object.keys(ALIASES) as PublicAppId[]) {
    for (const alias of ALIASES[app]) {
      const s = score(token, alias);
      if (s != null && (!best || s < best.s)) best = { app, alias, s };
    }
  }
  if (!best) return null;
  // a typo is corrected to the word it misspells ("blgo" → "blog"); a
  // known word, or a deeper path under a real app, to the app itself
  return { kind: "app", app: best.app, to: best.s === 0 ? CANONICAL[best.app] : best.alias };
}

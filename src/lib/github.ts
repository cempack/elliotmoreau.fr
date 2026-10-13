import "server-only";
import type { ProjectNote } from "@/lib/content";
// Server-only GitHub helper with minute-scale in-memory cache.

const API = "https://api.github.com";
const USER = "cempack";

/** GitHub slow to answer: give up, and the page keeps what it had (or its empty state) */
const timeout = () => AbortSignal.timeout(8000);

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "elliotmoreau.fr",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export type RepoInfo = {
  name: string;
  description: string;
  url: string;
  homepage: string;
  language: string;
  stars: number;
  forks: number;
  pushedAt: string;
  topics: string[];
  /** First real screenshot from the README, if the project showcases one. */
  preview: string | null;
  /** set on the server from the admin panel's Projects: what it is, in plain words */
  note?: ProjectNote;
  /** its place in the hand-set order (lower first), when it has one */
  rank?: number;
};

type GhRepo = {
  name?: string;
  fork?: boolean;
  archived?: boolean;
  description?: string | null;
  html_url?: string;
  homepage?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  pushed_at?: string;
  topics?: string[];
};

let reposCache: { at: number; data: RepoInfo[] } | null = null;
const REPOS_TTL = 10 * 60 * 1000;

const MD_IMG_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const TAG_IMG_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const BADGE_RE =
  /shields\.io|badge|codecov|coveralls|sonar|deepscan|opencollective|liberapay|patreon|paypal|buymeacoffee|discord\.gg|gitter|actions\/workflows.*badge/i;
const PHOTO_RE = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i;

/** First README image that looks like a screenshot, not a badge. */
function pickPreview(md: string): string | null {
  const found: string[] = [];
  for (const m of md.matchAll(MD_IMG_RE)) found.push(m[1]);
  for (const m of md.matchAll(TAG_IMG_RE)) found.push(m[1]);
  for (const u of found) {
    if (!u || u.startsWith("#") || u.startsWith("data:")) continue;
    if (BADGE_RE.test(u)) continue;
    if (PHOTO_RE.test(u) || /user-attachments/i.test(u)) return u;
  }
  return null;
}

async function readmePreview(name: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/repos/${USER}/${name}/readme`, { headers: headers(), signal: timeout() });
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: string; download_url?: string };
    if (!j.content || !j.download_url) return null;
    const md = Buffer.from(j.content, "base64").toString("utf8");
    const raw = pickPreview(md);
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = j.download_url.slice(0, j.download_url.lastIndexOf("/") + 1);
    return new URL(raw.replace(/^\.\//, ""), base).toString();
  } catch {
    return null;
  }
}

export async function getRepos(): Promise<RepoInfo[] | null> {
  if (reposCache && Date.now() - reposCache.at < REPOS_TTL) return reposCache.data;
  try {
    const res = await fetch(`${API}/users/${USER}/repos?per_page=100&type=owner&sort=pushed`, {
      headers: headers(), signal: timeout(),
      next: { revalidate: 600 },
    });
    if (!res.ok) return reposCache?.data ?? null;
    const json = (await res.json()) as GhRepo[];
    const data = json
      // forks and archives never show; one without a description shows once the admin panel gives it a sentence
      .filter((r) => r.name && !r.fork && !r.archived)
      .map((r): RepoInfo => ({
        name: r.name as string,
        description: (r.description ?? "").trim(),
        url: r.html_url ?? `https://github.com/${USER}/${r.name}`,
        homepage: (r.homepage ?? "").trim(),
        language: r.language ?? "",
        stars: r.stargazers_count ?? 0,
        forks: r.forks_count ?? 0,
        pushedAt: r.pushed_at ?? "",
        topics: (r.topics ?? []).slice(0, 4),
        preview: null,
      }))
      .sort((a, b) => +new Date(b.pushedAt) - +new Date(a.pushedAt));
    // README screenshots cost one API call per repo — only with a token.
    if (process.env.GITHUB_TOKEN) {
      const previews = await Promise.all(data.map((r) => readmePreview(r.name)));
      data.forEach((r, i) => {
        r.preview = previews[i];
      });
    }
    reposCache = { at: Date.now(), data };
    return data;
  } catch {
    return reposCache?.data ?? null;
  }
}

export type ActivityInfo = {
  type: string;
  repo: string;
  repoUrl: string;
  message: string;
  createdAt: string;
};

/** One Toulouse calendar day of public pushes. */
export type PushDay = {
  /** YYYY-MM-DD, Toulouse time */
  d: string;
  /** pushes that day (not commits) */
  n: number;
  /** the repo pushed to most that day */
  repo: string;
  /** the day's first commit message, when the API still gives one */
  msg: string;
};

/** What the public events API remembers (~90 days, 300 events). */
export type PushHistory = {
  days: PushDay[];
  /** the oldest event actually returned: the wall starts here, not at an assumed 90 days */
  since: string;
};

type GhEvent = {
  type?: string;
  repo?: { name?: string };
  created_at?: string;
  payload?: { commits?: { message?: string }[] };
};

let eventsCache: { at: number; data: GhEvent[] | null } | null = null;
const EVENTS_TTL = 5 * 60 * 1000;

/** Public events, newest first: up to three pages of 100 (all the API keeps). */
async function getEvents(): Promise<GhEvent[] | null> {
  if (eventsCache && Date.now() - eventsCache.at < EVENTS_TTL) return eventsCache.data;
  try {
    const all: GhEvent[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`${API}/users/${USER}/events/public?per_page=100&page=${page}`, {
        headers: headers(), signal: timeout(),
        next: { revalidate: 300 },
      });
      if (!res.ok) {
        if (page === 1) return eventsCache?.data ?? null;
        break;
      }
      const batch = (await res.json()) as GhEvent[];
      all.push(...batch);
      if (batch.length < 100) break;
    }
    eventsCache = { at: Date.now(), data: all };
    return all;
  } catch {
    return eventsCache?.data ?? null;
  }
}

const firstLine = (m: string | undefined) => {
  const msg = (m ?? "").split("\n")[0].trim();
  return msg.length > 72 ? msg.slice(0, 72) + "…" : msg;
};

/** "cempack/dotfiles" → is "dotfiles" one of the repos hidden from the site? */
type Skip = (repo: string) => boolean;
const shown = (skip?: Skip) => (e: GhEvent) => !skip || !e.repo?.name || !skip(e.repo.name.replace(`${USER}/`, ""));

/** The latest push (or event), leaving out repos `skip` hides. */
export async function getActivity(skip?: Skip): Promise<ActivityInfo | null> {
  const all = await getEvents();
  const events = all?.filter(shown(skip));
  if (!events?.length) return null;
  const push = events.find((e) => e.type === "PushEvent") ?? events[0];
  if (!push?.repo?.name || !push.created_at) return null;
  return {
    type: push.type ?? "Event",
    repo: push.repo.name.replace(`${USER}/`, ""),
    repoUrl: `https://github.com/${push.repo.name}`,
    message: firstLine(push.payload?.commits?.[0]?.message),
    createdAt: push.created_at,
  };
}

const toulouseDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Public pushes grouped by Toulouse day, newest first (hidden repos left out). */
export async function getPushes(skip?: Skip): Promise<PushHistory | null> {
  const all = await getEvents();
  if (!all?.length) return null;
  const events = all.filter(shown(skip));
  if (!events.length) return null;
  const byDay = new Map<string, { n: number; repos: Map<string, number>; msg: string }>();
  for (const e of events) {
    if (e.type !== "PushEvent" || !e.created_at || !e.repo?.name) continue;
    const d = toulouseDay.format(new Date(e.created_at));
    const day = byDay.get(d) ?? { n: 0, repos: new Map(), msg: "" };
    day.n += 1;
    const repo = e.repo.name.replace(`${USER}/`, "");
    day.repos.set(repo, (day.repos.get(repo) ?? 0) + 1);
    // events come newest first: the last one seen is the day's first push
    const m = firstLine(e.payload?.commits?.[0]?.message);
    if (m) day.msg = m;
    byDay.set(d, day);
  }
  const days: PushDay[] = [...byDay].map(([d, v]) => ({
    d,
    n: v.n,
    repo: [...v.repos].sort((a, b) => b[1] - a[1])[0][0],
    msg: v.msg,
  }));
  const oldest = events[events.length - 1]?.created_at;
  return { days, since: oldest ? toulouseDay.format(new Date(oldest)) : days[days.length - 1]?.d ?? "" };
}

export type DayPush = { at: string; repo: string; msg: string };

/** Pushes in the last 24 hours, newest first, with their times (hidden repos left out). */
export async function getDayPushes(skip?: Skip): Promise<DayPush[] | null> {
  const all = await getEvents();
  if (!all) return null;
  const since = Date.now() - 24 * 3600_000;
  return all
    .filter(shown(skip))
    .filter((e) => e.type === "PushEvent" && e.created_at && e.repo?.name && Date.parse(e.created_at) >= since)
    .map((e) => ({ at: e.created_at as string, repo: e.repo!.name!.replace(`${USER}/`, ""), msg: firstLine(e.payload?.commits?.[0]?.message) }));
}

/* ───────────────────────── this site's own history (Terminal: git log) ───────────────────────── */

const SITE = "elliotmoreau.fr";
/** the branch and commit this server was built from (Railway sets these), so the log is the running site's */
const DEPLOYED_BRANCH = () => process.env.RAILWAY_GIT_BRANCH || "main";
const DEPLOYED_SHA = () => process.env.RAILWAY_GIT_COMMIT_SHA || DEPLOYED_BRANCH();

export type CommitInfo = { sha: string; message: string; date: string; url: string; author: string };
export type CommitDetail = CommitInfo & {
  body: string;
  stats: { additions: number; deletions: number };
  files: { name: string; status: string; additions: number; deletions: number }[];
};

type GhCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string }; committer?: { date?: string } };
  stats?: { additions: number; deletions: number };
  files?: { filename: string; status: string; additions: number; deletions: number }[];
};

const toInfo = (c: GhCommit): CommitInfo => ({
  sha: c.sha,
  message: c.commit.message.split("\n")[0].slice(0, 200),
  date: c.commit.committer?.date ?? c.commit.author?.date ?? "",
  url: c.html_url,
  author: c.commit.author?.name ?? "",
});

/** the latest commits of this site's repo (cached 5 minutes) */
export async function getSiteCommits(n = 15): Promise<CommitInfo[] | null> {
  try {
    const res = await fetch(`${API}/repos/${USER}/${SITE}/commits?per_page=${Math.min(n, 50)}&sha=${encodeURIComponent(DEPLOYED_SHA())}`, {
      headers: headers(), signal: timeout(),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return ((await res.json()) as GhCommit[]).map(toInfo);
  } catch {
    return null;
  }
}

/** one commit with its files (git show); null when unknown */
export async function getSiteCommit(name: string): Promise<CommitDetail | null> {
  if (!/^(HEAD|main|[0-9a-f]{4,40})$/i.test(name)) return null;
  const ref = /^head$/i.test(name) ? DEPLOYED_SHA() : name;
  try {
    const res = await fetch(`${API}/repos/${USER}/${SITE}/commits/${ref}`, { headers: headers(), signal: timeout(), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const c = (await res.json()) as GhCommit;
    const [, ...rest] = c.commit.message.split("\n");
    return {
      ...toInfo(c),
      body: rest.join("\n").replace(/\n?Co-Authored-By:[^\n]*|\n?Claude-Session:[^\n]*/g, "").trim().slice(0, 1200),
      stats: { additions: c.stats?.additions ?? 0, deletions: c.stats?.deletions ?? 0 },
      files: (c.files ?? []).slice(0, 40).map((f) => ({ name: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })),
    };
  } catch {
    return null;
  }
}

/* ───────────────────────── this site's code as a city (Now: Building) ───────────────────────── */

/** a source file: its path under src/, its size in bytes, and when a recent commit last changed it (epoch ms, 0 if none did) */
export type CityFile = [path: string, bytes: number, changed: number];
export type SiteCity = { sha: string; files: CityFile[] };

const CITY_TTL = 10 * 60_000;
const SOURCE_RE = /^src\/.+\.(tsx|ts|css)$/;
let cityCache: { at: number; data: SiteCity } | null = null;

/**
 * The running site's source files (the git tree at the deployed commit)
 * and, from its latest commits, when each one last changed. A commit
 * never changes, so each one's file list
 * is cached for a day; the whole is cached 10 minutes. Without a token,
 * fewer commits are read, to stay inside the anonymous rate limit.
 */
export async function getSiteCity(): Promise<SiteCity | null> {
  if (cityCache && Date.now() - cityCache.at < CITY_TTL) return cityCache.data;
  const commits = await getSiteCommits(30);
  if (!commits?.length) return cityCache?.data ?? null;
  const sha = commits[0].sha;
  const tree = await gh<{ tree?: { path: string; type: string; size?: number }[] }>(`/repos/${USER}/${SITE}/git/trees/${sha}?recursive=1`, 86_400);
  if (!tree.ok || !tree.data.tree) return cityCache?.data ?? null;
  const depth = process.env.GITHUB_TOKEN ? 30 : 8;
  const details = await Promise.all(commits.slice(0, depth).map((c) => gh<GhCommit>(`/repos/${USER}/${SITE}/commits/${c.sha}`, 86_400)));

  const changed = new Map<string, number>();
  details.forEach((d, i) => {
    if (!d.ok) return;
    const t = Date.parse(commits[i].date) || 0;
    for (const f of d.data.files ?? []) if (SOURCE_RE.test(f.filename) && (changed.get(f.filename) ?? 0) < t) changed.set(f.filename, t);
  });

  const files: CityFile[] = tree.data.tree
    .filter((e) => e.type === "blob" && SOURCE_RE.test(e.path))
    .map((e) => [e.path.slice(4), e.size ?? 0, changed.get(e.path) ?? 0]);
  if (!files.length) return cityCache?.data ?? null;
  const data: SiteCity = { sha: sha.slice(0, 7), files };
  cityCache = { at: Date.now(), data };
  return data;
}

/* ───────────────────────── recent commits, repo by repo (Terminal: the metro map) ───────────────────────── */

/** one repo's line on the map: its commits of the last 30 days, newest first */
export type MetroLine = { repo: string; language: string; url: string; commits: CommitInfo[] };

const METRO_TTL = 10 * 60_000;
const METRO_REPOS = 6;
let metroCache: { at: number; data: MetroLine[] } | null = null;

/**
 * The most recently pushed repos' own commits (Elliot's, the last 30 days,
 * up to 20 each), straight from each repo: the public events feed no
 * longer carries commit lists. Cached 10 minutes; repos without a commit
 * in the window are left out. `skip` drops repos hidden from the admin.
 */
export async function getMetro(skip?: (repo: string) => boolean): Promise<MetroLine[] | null> {
  const fresh = metroCache && Date.now() - metroCache.at < METRO_TTL;
  if (!fresh) {
    const repos = await getRepos();
    if (!repos) return metroCache ? metroCache.data.filter((l) => !skip?.(l.repo)) : null;
    // a day-rounded window keeps the fetch cache's key stable
    const since = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 - 30 * 86_400_000).toISOString();
    const top = repos.slice(0, METRO_REPOS);
    const lines = await Promise.all(
      top.map(async (r): Promise<MetroLine | null> => {
        try {
          const res = await fetch(`${API}/repos/${USER}/${encodeURIComponent(r.name)}/commits?author=${USER}&since=${since}&per_page=20`, {
            headers: headers(), signal: timeout(),
            next: { revalidate: 600 },
          });
          if (!res.ok) return null;
          const commits = ((await res.json()) as GhCommit[]).map(toInfo).filter((c) => c.date);
          return commits.length ? { repo: r.name, language: r.language, url: r.url, commits } : null;
        } catch {
          return null;
        }
      })
    );
    metroCache = { at: Date.now(), data: lines.filter((l): l is MetroLine => l !== null) };
  }
  return metroCache!.data.filter((l) => !skip?.(l.repo));
}

/* ───────────────────────── one repo, turned over (Projects: Quick Look's back, Green light) ───────────────────────── */

export type CiState = "passing" | "failing" | "running" | "none";
export type CiInfo = { state: CiState; /** the failing check's name, or "deployed" for this site */ detail?: string; url?: string; at?: string };

export type RepoDetail = {
  name: string;
  /** the README's first paragraph, as plain text */
  intro: string;
  /** the README's first image (absolute URL) */
  image: string | null;
  /** bytes per language, largest first */
  languages: { name: string; bytes: number }[];
  issues: number;
  license: string | null;
  release: { tag: string; at: string; url: string } | null;
  ci: CiInfo;
};

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

async function gh<T>(path: string, revalidate = 300): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(`${API}${path}`, { headers: headers(), signal: timeout(), next: { revalidate } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** a README's first real paragraph: no headings, badges, images, HTML or link-only lines */
export function readmeIntro(md: string): string {
  const blocks = md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .split(/\n\s*\n/);
  for (const b of blocks) {
    const text = b.trim();
    if (!text || /^(#|>|\||[-*+] |\d+\. |<|!\[|\[!\[)/.test(text)) continue;
    const plain = text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]+/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length >= 30) return plain.length > 420 ? `${plain.slice(0, 419).trimEnd()}…` : plain;
  }
  return "";
}

/** the default branch's checks, folded into one signal */
export async function getCi(name: string, branch = "HEAD"): Promise<CiInfo> {
  if (!NAME_RE.test(name)) return { state: "none" };
  // this site: the deploy itself is its check (Railway built and is serving it)
  if (name === SITE && process.env.RAILWAY_DEPLOYMENT_ID) return { state: "passing", detail: "deployed", at: BOOTED_AT };
  const r = await gh<{ check_runs: { name: string; status: string; conclusion: string | null; html_url: string; completed_at: string | null }[] }>(
    `/repos/${USER}/${name}/commits/${branch}/check-runs?per_page=30`
  );
  if (!r.ok || !r.data.check_runs.length) return { state: "none" };
  const runs = r.data.check_runs;
  const failed = runs.find((c) => c.conclusion === "failure" || c.conclusion === "timed_out" || c.conclusion === "cancelled");
  if (failed) return { state: "failing", detail: failed.name, url: failed.html_url, at: failed.completed_at ?? undefined };
  if (runs.some((c) => c.status !== "completed")) return { state: "running", url: runs[0].html_url };
  return { state: "passing", url: runs[0].html_url, at: runs[0].completed_at ?? undefined };
}

/** when this server started: on Railway, the moment the running deploy went live */
const BOOTED_AT = new Date().toISOString();

export async function getRepoDetail(name: string): Promise<RepoDetail | null> {
  if (!NAME_RE.test(name)) return null;
  const repo = await gh<{ open_issues_count: number; license: { spdx_id: string | null; name: string } | null; default_branch: string }>(
    `/repos/${USER}/${name}`
  );
  if (!repo.ok) return null;
  const [readme, langs, release, ci] = await Promise.all([
    gh<{ content?: string; download_url?: string }>(`/repos/${USER}/${name}/readme`, 3600),
    gh<Record<string, number>>(`/repos/${USER}/${name}/languages`, 3600),
    gh<{ tag_name: string; published_at: string; html_url: string }>(`/repos/${USER}/${name}/releases/latest`, 3600),
    getCi(name, repo.data.default_branch),
  ]);
  let intro = "";
  let image: string | null = null;
  if (readme.ok && readme.data.content) {
    const md = Buffer.from(readme.data.content, "base64").toString("utf8");
    intro = readmeIntro(md);
    const raw = pickPreview(md);
    if (raw && readme.data.download_url) {
      const base = readme.data.download_url.slice(0, readme.data.download_url.lastIndexOf("/") + 1);
      image = /^https?:\/\//i.test(raw) ? raw : new URL(raw.replace(/^\.\//, ""), base).toString();
    }
  }
  const languages = langs.ok
    ? Object.entries(langs.data)
        .map(([n, bytes]) => ({ name: n, bytes }))
        .sort((a, b) => b.bytes - a.bytes)
    : [];
  const spdx = repo.data.license?.spdx_id;
  return {
    name,
    intro,
    image,
    languages,
    issues: repo.data.open_issues_count,
    license: spdx && spdx !== "NOASSERTION" ? spdx : (repo.data.license?.name ?? null),
    release: release.ok ? { tag: release.data.tag_name, at: release.data.published_at, url: release.data.html_url } : null,
    ci,
  };
}

/* ───────────────────────── a year of work (Projects: the Years view) ───────────────────────── */

export type YearRange = {
  repo: string;
  language: string;
  url: string;
  /** commits per week, the last 52 weeks, oldest first */
  weeks: number[];
  total: number;
  last: { message: string; date: string } | null;
};
export type YearsInfo = {
  /** the first week's Sunday (UTC), YYYY-MM-DD */
  start: string;
  ranges: YearRange[];
};

const YEARS_TTL = 30 * 60_000;
const YEARS_REPOS = 6;
let yearsCache: { at: number; data: YearsInfo } | null = null;

/**
 * Each of the most recently pushed repos' weekly commit counts over the
 * last year (GitHub's own stats, recomputed by GitHub at most daily) and
 * its last commit. A repo whose stats are still being computed (202) or
 * that saw no commit all year is left out. Cached half an hour.
 */
export async function getYears(skip?: (repo: string) => boolean): Promise<YearsInfo | null> {
  const fresh = yearsCache && Date.now() - yearsCache.at < YEARS_TTL;
  if (!fresh) {
    const repos = await getRepos();
    if (!repos) return yearsCache ? { ...yearsCache.data, ranges: yearsCache.data.ranges.filter((r) => !skip?.(r.repo)) } : null;
    let start = "";
    const ranges = await Promise.all(
      repos.slice(0, YEARS_REPOS + 2).map(async (r): Promise<YearRange | null> => {
        try {
          const name = encodeURIComponent(r.name);
          const [stats, last] = await Promise.all([
            fetch(`${API}/repos/${USER}/${name}/stats/commit_activity`, { headers: headers(), signal: timeout(), next: { revalidate: 6 * 3600 } }),
            fetch(`${API}/repos/${USER}/${name}/commits?per_page=1`, { headers: headers(), signal: timeout(), next: { revalidate: 1800 } }),
          ]);
          if (stats.status !== 200) return null;
          const weeks = (await stats.json()) as { week: number; total: number }[];
          if (!Array.isArray(weeks) || weeks.length === 0) return null;
          const total = weeks.reduce((s, w) => s + (w.total || 0), 0);
          if (!total) return null;
          if (!start) start = new Date(weeks[0].week * 1000).toISOString().slice(0, 10);
          const c = last.ok ? ((await last.json()) as GhCommit[])[0] : undefined;
          const info = c ? toInfo(c) : null;
          return {
            repo: r.name,
            language: r.language,
            url: r.url,
            weeks: weeks.slice(-52).map((w) => w.total || 0),
            total,
            last: info ? { message: info.message, date: info.date } : null,
          };
        } catch {
          return null;
        }
      })
    );
    const got = ranges.filter((x): x is YearRange => x !== null).slice(0, YEARS_REPOS);
    if (!got.length) return yearsCache ? yearsCache.data : null;
    yearsCache = { at: Date.now(), data: { start, ranges: got } };
  }
  const data = yearsCache!.data;
  return { ...data, ranges: data.ranges.filter((r) => !skip?.(r.repo)) };
}

import "server-only";
// Server-only GitHub helper with minute-scale in-memory cache.

const API = "https://api.github.com";
const USER = "cempack";

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
    const res = await fetch(`${API}/repos/${USER}/${name}/readme`, { headers: headers() });
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
      headers: headers(),
      next: { revalidate: 600 },
    });
    if (!res.ok) return reposCache?.data ?? null;
    const json = (await res.json()) as GhRepo[];
    const data = json
      .filter((r) => r.name && !r.fork && !r.archived && r.description)
      .map((r): RepoInfo => ({
        name: r.name as string,
        description: (r.description as string).trim(),
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
        headers: headers(),
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

export async function getActivity(): Promise<ActivityInfo | null> {
  const events = await getEvents();
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

/** Public pushes grouped by Toulouse day, newest first. */
export async function getPushes(): Promise<PushHistory | null> {
  const events = await getEvents();
  if (!events?.length) return null;
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

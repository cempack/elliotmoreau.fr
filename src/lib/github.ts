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

let activityCache: { at: number; data: ActivityInfo | null } | null = null;
const ACTIVITY_TTL = 5 * 60 * 1000;

export async function getActivity(): Promise<ActivityInfo | null> {
  if (activityCache && Date.now() - activityCache.at < ACTIVITY_TTL) return activityCache.data;
  try {
    const res = await fetch(`${API}/users/${USER}/events/public?per_page=10`, {
      headers: headers(),
      next: { revalidate: 300 },
    });
    if (!res.ok) return activityCache?.data ?? null;
    const events = (await res.json()) as {
      type?: string;
      repo?: { name?: string };
      created_at?: string;
      payload?: { commits?: { message?: string }[] };
    }[];
    const push = events.find((e) => e.type === "PushEvent") ?? events[0];
    if (!push?.repo?.name || !push.created_at) {
      activityCache = { at: Date.now(), data: null };
      return null;
    }
    const msg = push.payload?.commits?.[0]?.message?.split("\n")[0] ?? "";
    const data: ActivityInfo = {
      type: push.type ?? "Event",
      repo: push.repo.name.replace(`${USER}/`, ""),
      repoUrl: `https://github.com/${push.repo.name}`,
      message: msg.length > 72 ? msg.slice(0, 72) + "…" : msg,
      createdAt: push.created_at,
    };
    activityCache = { at: Date.now(), data: data };
    return data;
  } catch {
    return activityCache?.data ?? null;
  }
}

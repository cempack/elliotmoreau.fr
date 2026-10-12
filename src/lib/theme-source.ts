import "server-only";
import { cache } from "react";
import { SNAPSHOT_THEME, THEME_NAME, THEME_REPO, parseColors, parseHyprland, themeFrom, type Theme } from "./theme";

/**
 * The theme, live from its repo: colors.toml and hyprland.conf from the
 * default branch (raw files, no API quota), and colors.toml's latest commit
 * for the "synced" note (API, with GITHUB_TOKEN when set). Cached ten
 * minutes under the "theme" tag: a push to the theme reaches the site
 * within that, or at once through /api/theme/hook (a GitHub webhook).
 * Anything missing or malformed falls back to the snapshot in ./theme.
 */

export const THEME_TAG = "theme";
const RAW = `https://raw.githubusercontent.com/${THEME_REPO}/main`;
const REVALIDATE = 600;

async function text(url: string, headers?: HeadersInit): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, next: { revalidate: REVALIDATE, tags: [THEME_TAG] }, signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export const getTheme = cache(async (): Promise<Theme> => {
  const auth: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "elliotmoreau.fr" };
  if (process.env.GITHUB_TOKEN) auth.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const [toml, conf, commits] = await Promise.all([
    text(`${RAW}/colors.toml`),
    text(`${RAW}/hyprland.conf`),
    text(`https://api.github.com/repos/${THEME_REPO}/commits?path=colors.toml&per_page=1`, auth),
  ]);
  const colors = toml ? parseColors(toml) : null;
  // a file that isn't a theme (an error page, an empty file) keeps the snapshot
  if (!colors || !colors.background || !colors.foreground) return SNAPSHOT_THEME;
  let sha: string | undefined;
  let at: string | undefined;
  try {
    const c = commits ? (JSON.parse(commits) as { sha?: string; commit?: { committer?: { date?: string } } }[])[0] : undefined;
    sha = c?.sha?.slice(0, 7);
    at = c?.commit?.committer?.date;
  } catch {}
  return {
    tokens: themeFrom(colors, conf ? parseHyprland(conf) : { rounding: 12, border: 1 }),
    meta: { name: THEME_NAME, repo: THEME_REPO, sha, at, source: "github" },
  };
});

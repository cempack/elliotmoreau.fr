import type { RepoInfo } from "@/lib/github";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";

export const langColor = (lang: string) => LANG_COLORS[lang] ?? LANG_FALLBACK;

/**
 * The project Projects opens on: the one named in the admin panel (Live
 * data), or the most recently worked on when none is set or it is gone.
 */
export function pickFeatured(repos: RepoInfo[], name?: string): RepoInfo | null {
  const hit = name ? repos.find((r) => r.name.toLowerCase() === name.toLowerCase()) : undefined;
  if (hit) return hit;
  const time = (r: RepoInfo) => Date.parse(r.pushedAt) || 0;
  return [...repos].sort((a, b) => time(b) - time(a))[0] ?? null;
}

/** "{n} items" → "6 items" */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** English: singular for 1. French: singular for 0 and 1. */
export function plural(lang: string, n: number, one: string, other: string) {
  const single = lang === "fr" ? n < 2 : n === 1;
  return fmt(single ? one : other, { n });
}

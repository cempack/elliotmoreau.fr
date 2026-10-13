import type { RepoInfo } from "@/lib/github";
import { PROJECT_KINDS, type ProjectKind } from "@/lib/content";

export type { ProjectKind };

/** The shelves, in the order Projects shows them. */
export const KINDS: readonly ProjectKind[] = PROJECT_KINDS;

/** the admin panel's note for it (attached on the server), if any */
const note = (r: RepoInfo) => r.note;

/** a store page for the Omarchy bar, not the project's own site */
const STORE = /omarchy(plugins)?\.(com|org)|plugins\.omarchy/i;

/**
 * Which shelf a repo sits on: the hand-written note when there is one,
 * else a guess from what GitHub says about it.
 */
export function kindOf(r: RepoInfo): ProjectKind {
  const n = note(r);
  if (n) return n.kind;
  return guessKind(r);
}

/** The shelf GitHub's own words suggest (the admin panel shows it as the default). */
export function guessKind(r: Pick<RepoInfo, "name" | "description" | "topics" | "homepage">): ProjectKind {
  const text = `${r.name} ${r.description} ${r.topics.join(" ")}`.toLowerCase();
  if (/\b(game|jeu|pygame|platformer|plateforme)\b/.test(text)) return "game";
  if (/omarchy|hyprland|waybar|\btheme\b|dotfiles|wallpaper/.test(text) || STORE.test(r.homepage)) return "desktop";
  if (/\b(cli|installer|install|proxy|packag\w*|script|setup)\b/.test(text)) return "tool";
  if (r.homepage || /\b(web|website|site|app|dashboard|globe|interface)\b/.test(text)) return "app";
  return "lab";
}

/** "omarchy-arch-extra" → "Omarchy arch extra", when no title was written */
export function titleOf(r: RepoInfo): string {
  const t = note(r)?.title;
  if (t) return t;
  const words = r.name.replace(/[-_.]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The plain sentence, or GitHub's own description. */
export function plainOf(r: RepoInfo, lang: "en" | "fr"): string {
  return note(r)?.plain?.[lang] ?? r.description;
}

/** The project's own page as a full URL ("euclide.example.fr" gets https). */
export function siteOf(r: RepoInfo): string {
  const h = r.homepage.trim();
  if (!h) return "";
  return /^https?:\/\//i.test(h) ? h : `https://${h}`;
}

/** What the main button does: play the game, get the add-on, open the site, or read the code. */
export type Action = "play" | "get" | "open" | "code";
export function actionOf(r: RepoInfo, kind: ProjectKind): Action {
  const site = siteOf(r);
  if (!site) return "code";
  if (kind === "game") return "play";
  if (STORE.test(site)) return "get";
  return "open";
}

/** Repos by shelf, in shelf order; within one, the order set in the admin
    panel, then the rest most recently worked on first. */
export function shelves(repos: RepoInfo[]) {
  const time = (r: RepoInfo) => Date.parse(r.pushedAt) || 0;
  const byRank = (a: RepoInfo, b: RepoInfo) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || time(b) - time(a);
  const by = new Map<ProjectKind, RepoInfo[]>();
  for (const r of repos) {
    const k = kindOf(r);
    const list = by.get(k) ?? [];
    list.push(r);
    by.set(k, list);
  }
  return KINDS.filter((k) => by.has(k)).map((kind) => ({ kind, repos: by.get(kind)!.sort(byRank) }));
}

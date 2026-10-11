import type { GhostPost } from "@/lib/ghost";
import type { Dict } from "@/i18n";

export type WritingDict = Dict["writing"];

export const BLOG_URL = (process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.elliotmoreau.fr").replace(/\/$/, "");
export const SIGNUP_URL = `${BLOG_URL}/#/portal/signup`;
export const RSS_URL = `${BLOG_URL}/rss/`;

/** "{n} posts" style templates. */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function countLabel(t: WritingDict, n: number) {
  return n === 1 ? t.countOne : fmt(t.countOther, { n });
}

/* Dates are formatted by hand from numeric Toulouse-time parts: numeric
   Intl output is stable across ICU builds, month names are not, and the
   server and the browser must print the same thing. */
const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parisDate(iso: string) {
  const parts = PARTS.formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month") - 1, d: get("day") };
}

export function dateShort(t: WritingDict, iso: string) {
  const { m, d } = parisDate(iso);
  return fmt(t.dateShort, { d, m: t.monthsShort[m] });
}

export function dateLong(t: WritingDict, iso: string) {
  const { y, m, d } = parisDate(iso);
  return fmt(t.dateLong, { d, m: t.months[m], y });
}

/** Ghost's stock placeholder art isn't a real cover. */
export function realImage(p: GhostPost) {
  return p.feature_image && !p.feature_image.includes("static.ghost.org") ? p.feature_image : null;
}

export type Folder = { slug: string; name: string; count: number };

/** One folder per tag, most used first, then alphabetical. */
export function foldersOf(posts: GhostPost[]): Folder[] {
  const map = new Map<string, Folder>();
  for (const p of posts) {
    for (const tag of p.tags ?? []) {
      if (!tag?.slug || tag.slug.startsWith("hash-")) continue; // Ghost internal tags
      const f = map.get(tag.slug);
      if (f) f.count++;
      else map.set(tag.slug, { slug: tag.slug, name: tag.name, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function primaryTag(p: GhostPost) {
  return (p.tags ?? []).find((tag) => tag?.slug && !tag.slug.startsWith("hash-")) ?? null;
}

/** Group posts (already newest first) by Toulouse-time year. */
export function byYear(posts: GhostPost[]) {
  const groups: { year: number; posts: GhostPost[] }[] = [];
  for (const p of posts) {
    const { y } = parisDate(p.published_at);
    const last = groups[groups.length - 1];
    if (last && last.year === y) last.posts.push(p);
    else groups.push({ year: y, posts: [p] });
  }
  return groups;
}

import type { Lang } from "./i18n";

/** "pushed … ago" in both languages, from an ISO timestamp. */
export function timeAgo(iso: string, lang: Lang): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return lang === "fr" ? "à l'instant" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return lang === "fr" ? `il y a ${m}\u00a0min` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "fr" ? `il y a ${h}\u00a0h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return lang === "fr" ? `il y a ${d}\u00a0j` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    year: "numeric",
  });
}

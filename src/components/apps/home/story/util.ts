import type { RepoInfo } from "@/lib/github";

/** "{n} min read" + { n: 7 } → "7 min read" */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** The deck's projects: most starred first, the freshest push breaking ties. */
export function selectRepos(repos: RepoInfo[], max = 5) {
  return [...repos]
    .sort((a, b) => b.stars - a.stars || Date.parse(b.pushedAt) - Date.parse(a.pushedAt))
    .slice(0, max);
}

/** "2026-10-04T…" → "04.10.26" / "Oct 4, 2026"-style, deterministic per locale. */
export function fmtDate(iso: string, lang: "en" | "fr") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(d);
}

/** Split "Small tools, made with *care*." into words, flagging accents. */
export function words(line: string) {
  return line
    .split(" ")
    .filter(Boolean)
    .map((raw) => {
      const accent = /\*/.test(raw);
      return { text: raw.replace(/\*/g, ""), accent };
    });
}

/* ───────────── a pixel world: land mask, 96 × 38 cells ─────────────
   Rasterized once from world-atlas land-110m (equirectangular, 76°N to
   58°S, 3×3 supersampled), packed one bit per cell, MSB first. */

export const MAP_W = 96;
export const MAP_H = 38;
const MAP_N = 76;
const MAP_S = -58;
const LAND =
  "AAH34H/gAAMD/0QAB8f//H/AB4K////yf///////8DgAAAAAD///3jgwP///////D//+HBgAe//////cAA//nwADE/////hgAAf/34AHf/////xgAAP//8AB//////wAAAH//gAB//////gAAAH/+AAD31v///IAAAH/8AAHDfv//0QAAAH/8AAD4H///zwAAAB/4AAH9////4AAAAB+IAAH/////4AAAAA8AAAP/////wAAAAAMkAAf//8f/AAAAAAPgAAf/94eeIAAAAABwAAf//gMOIAAAAAATgAP//wIGAAAAAAAH4AP//gEIEAAAAAAH8AAP/gAcwAAAAAAP+AAP/AANwAAAAAAP/wAH+AAEpwAAAAAP/4AH+AADAcAAAAAH/4AH+AAAAAAAAAAD/wAH+QAAH4AAAAAB/wAH8gAAP4AAAAAB/gAH8gAAf8AAAAAB/AAD4gAA/+AAAAAB+AAD4AAA/+AAAAAB+AABwAAAf+AAAAAB4AABAAAAYcAAAAAD4AAAAAAAAMDAAAADgAAAAAAAAEEAAAADgAAAAAAAAAMAAAADAAAAAAAAAAAAAAADAAAAAAAAAAAAAAABAAAAAAAAAAA";

let landPath: string | null = null;

/** One SVG path of 0.62-unit dots, one per land cell (viewBox 0 0 96 38). */
export function landDots() {
  if (landPath) return landPath;
  const bin = typeof atob === "function" ? atob(LAND) : Buffer.from(LAND, "base64").toString("binary");
  let d = "";
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    const byte = bin.charCodeAt(i >> 3);
    if (byte & (1 << (7 - (i & 7)))) {
      const x = i % MAP_W;
      const y = (i / MAP_W) | 0;
      d += `M${x + 0.19} ${y + 0.19}h.62v.62h-.62z`;
    }
  }
  landPath = d;
  return d;
}

/** lat/lon → whole cell on the map grid. */
export function mapCell(lat: number, lon: number) {
  const x = Math.min(MAP_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MAP_W)));
  const y = Math.min(MAP_H - 1, Math.max(0, Math.floor(((MAP_N - lat) / (MAP_N - MAP_S)) * MAP_H)));
  return { x, y };
}

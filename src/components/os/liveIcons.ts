"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useHydrated } from "@/hooks/env";
import { QUARTER, useQuarterHour } from "@/hooks/useQuarterHour";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { LANG_COLORS } from "@/lib/langColors";
import { moonAt, sunAt, type SkyPhase } from "@/lib/sun";
import { draftOnDesk, letterLines, loadDraft } from "@/components/apps/contact/mail";
import { useMaybeSiteData } from "./SiteData";
import { useSky } from "./sky";

/**
 * Living pixel icons: each dock icon keeps its hand-drawn 16×16 map, and
 * the part that can show its app's real state is recomputed from it.
 *
 * - Desktop: the window looks onto the sky over Toulouse right now, in the
 *   wallpaper's phase colours, with the sun on its real arc (east on the
 *   left, the window faces south) or, at night, the moon lit at its true
 *   phase among a few stars.
 * - Projects: up to three sheets stand in the folder for the three most
 *   recently pushed repos, each tab in its language's colour; one pushed
 *   in the last 24 hours stands a cell higher.
 * - Now: the headphones' cups take the colour of the album's cover (the
 *   last one played after the music stops), with a note between them
 *   while it plays.
 * - Mail: a saved draft opens the envelope, the letter standing up with
 *   ink lines as long as the draft's.
 *
 * A glyph is 256 fills (a palette role, a hex colour, or empty). Nothing
 * animates at rest; the sky is re-read each quarter hour. The server and
 * the first client render keep the static icon, so hydration is stable.
 */

export type Fills = (string | null)[];
export type LiveGlyph = { key: string; fills: Fills };
type Base = { pal: Record<string, string>; rows: readonly string[] };

const N = 16;
const at = (x: number, y: number) => y * N + x;

/** the base map as fills: palette roles by cell */
export function baseFills(base: Base): Fills {
  const out: Fills = new Array(N * N).fill(null);
  base.rows.forEach((row, y) => {
    Array.from(row.padEnd(N, ".").slice(0, N)).forEach((ch, x) => {
      if (ch !== ".") out[at(x, y)] = base.pal[ch] ?? "paper";
    });
  });
  return out;
}

/* ───────────────────────── Desktop: the sky ───────────────────────── */

/** first hill row per window column (the ridge of the base drawing) */
const RIDGE: Record<number, number> = { 2: 9, 3: 9, 4: 10, 5: 10, 6: 11, 7: 11, 8: 11, 9: 11, 10: 11, 11: 10, 12: 10, 13: 10 };
/** the sky in bands, top down from row 5: deeper overhead, paler (or warmer) at the horizon */
const SKY: Record<SkyPhase, [string, string, string]> = {
  night: ["night", "night", "night"],
  dawn: ["lilacDeep", "lilac", "lilacLight"],
  day: ["ion", "ionLight", "ionLight"],
  dusk: ["lilacDeep", "flareDeep", "flare"],
};
const band = (y: number) => (y <= 6 ? 0 : y <= 8 ? 1 : 2);

export type SkyState = {
  phase: SkyPhase;
  sun: { az: number; el: number };
  moon: { az: number; el: number; phase: number };
};

/** a 4×4 disc: the sun's and the moon's footprint */
const DISC = [".##.", "####", "####", ".##."];
/** the sun's shading, lit from the top left */
const SUN = [".YE.", "YEEE", "EEEe", ".Ee."];
const SUN_ROLE: Record<string, string> = { Y: "emberLight", E: "ember", e: "emberDeep" };

/** top-left cell of a 4×4 body in the window, or null when it's out of view */
function place(az: number, el: number) {
  if (el < 0 || az < 90 || az > 270) return null;
  const x = 3 + Math.round(((az - 90) / 180) * 6);
  const y = Math.round(8 - (Math.min(el, 60) / 60) * 3);
  return { x, y };
}

/**
 * Which cells of the moon's disc are lit at `phase` (0 new, 0.5 full):
 * the terminator is an ellipse whose half-width follows cos(2π·phase),
 * the lit side on the right while it waxes.
 */
function moonLit(phase: number, dx: number, dy: number) {
  const u = (dx - 1.5) / 2;
  const v = (dy - 1.5) / 2;
  const edge = Math.cos(2 * Math.PI * phase) * Math.sqrt(Math.max(0, 1 - v * v));
  return phase < 0.5 ? u > edge : u < -edge;
}

export function homeFills(base: Base, s: SkyState): Fills {
  const f = baseFills(base);
  const hillRole = (x: number, y: number) => (f[at(x, y)] === "signalDeep" ? "signalDeep" : "signal");
  const hills = new Map<number, string>();
  for (let x = 2; x <= 13; x++) for (let y = RIDGE[x]; y <= 12; y++) hills.set(at(x, y), hillRole(x, y));
  // the window: sky, then the sun or moon, then the hills in front
  for (let y = 5; y <= 12; y++) for (let x = 2; x <= 13; x++) f[at(x, y)] = SKY[s.phase][band(y)];
  const put = (x: number, y: number, role: string) => {
    if (x >= 2 && x <= 13 && y >= 5 && y <= 12) f[at(x, y)] = role;
  };
  const disc = (o: { x: number; y: number }, role: (dx: number, dy: number) => string) =>
    DISC.forEach((row, dy) => Array.from(row).forEach((c, dx) => c === "#" && put(o.x + dx, o.y + dy, role(dx, dy))));
  if (s.phase === "night") {
    put(3, 6, "paper2");
    put(12, 5, "paper2");
    put(6, 8, "paper3");
    const m = place(s.moon.az, s.moon.el);
    if (m) {
      // near new moon no cell would be lit: keep a hairline crescent on the lit side
      const thin = !DISC.some((row, dy) => Array.from(row).some((c, dx) => c === "#" && moonLit(s.moon.phase, dx, dy)));
      const edge = s.moon.phase < 0.5 ? 3 : 0;
      // the dark limb a shade above the sky, as earthshine
      disc(m, (dx, dy) => (moonLit(s.moon.phase, dx, dy) || (thin && dx === edge) ? "paper" : "ink700"));
    }
  } else {
    const sun = place(s.sun.az, s.sun.el);
    if (sun) disc(sun, (dx, dy) => SUN_ROLE[SUN[dy][dx]]);
  }
  for (const [i, role] of hills) f[i] = role;
  return f;
}

/** the sky to draw: the real sun and moon when the sky runs live, a stand-in for a pinned phase */
function skyState(phase: SkyPhase, live: boolean, now: number): SkyState {
  const s = sunAt(now);
  const m = moonAt(now);
  if (live) return { phase, sun: { az: s.azimuth, el: s.elevation }, moon: { az: m.azimuth, el: m.elevation, phase: m.phase } };
  const pinned: Record<SkyPhase, { az: number; el: number }> = {
    day: { az: 180, el: 48 },
    dawn: { az: 104, el: 4 },
    dusk: { az: 256, el: 4 },
    night: { az: 0, el: -20 },
  };
  return { phase, sun: pinned[phase], moon: { az: 200, el: 40, phase: m.phase } };
}

/* ─────────────────────── Projects: the sheets ─────────────────────── */

export function workFills(base: Base, repos: { language: string; pushedAt: string }[], now: number): Fills {
  const f = baseFills(base);
  if (!repos.length) return f;
  for (let x = 2; x <= 13; x++) f[at(x, 4)] = "ionDeep";
  repos.slice(0, 3).forEach((r, i) => {
    const x0 = 3 + i * 4;
    const fresh = now - Date.parse(r.pushedAt) < 86_400_000;
    const top = fresh ? 2 : 3;
    const tab = LANG_COLORS[r.language] ?? "paper3";
    for (let x = x0; x < x0 + 3; x++) {
      f[at(x, top)] = tab;
      for (let y = top + 1; y <= 4; y++) f[at(x, y)] = "paper";
    }
  });
  return f;
}

/* ─────────────────────── Now: the headphones ─────────────────────── */

/** a note between the cups while music plays */
const NOTE: [number, number][] = [
  [8, 7],
  [8, 8],
  [8, 9],
  [8, 10],
  [9, 7],
  [10, 8],
  [6, 10],
  [7, 10],
  [6, 11],
  [7, 11],
];

export type Label = { light: string; deep: string };

/** The headphones: cups in the cover's colour, and a note while a track plays. */
export function nowFills(base: Base, playing: boolean, tint: Label | null): Fills {
  const f = baseFills(base);
  if (tint)
    for (let i = 0; i < f.length; i++) {
      if (f[i] === "flare") f[i] = tint.light;
      else if (f[i] === "flareDeep") f[i] = tint.deep;
    }
  if (playing) for (const [x, y] of NOTE) f[at(x, y)] = "paper";
  return f;
}

const labels = new Map<string, Label | null>();

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
function hsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const c = (n: number) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return toHex(c(0), c(8), c(4));
}

/**
 * An album cover's one colour for the cups: the most vivid hue on the
 * sleeve (a hue histogram weighted by saturation), its lightness and
 * saturation reined in to sit with the theme. A greyscale sleeve gets a
 * silver label. null when the image can't be read.
 */
function loadLabel(url: string): Promise<Label | null> {
  if (labels.has(url)) return Promise.resolve(labels.get(url) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = (v: Label | null) => {
      labels.set(url, v);
      resolve(v);
    };
    img.onload = () => {
      try {
        const S = 16;
        const c = document.createElement("canvas");
        c.width = S;
        c.height = S;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no 2d");
        ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        const bins = Array.from({ length: 12 }, () => ({ w: 0, s: 0, l: 0 }));
        let total = 0;
        for (let i = 0; i < S * S; i++) {
          const r = d[i * 4] / 255;
          const g = d[i * 4 + 1] / 255;
          const b = d[i * 4 + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
          let h = 0;
          if (max !== min) {
            if (max === r) h = ((g - b) / (max - min) + 6) % 6;
            else if (max === g) h = (b - r) / (max - min) + 2;
            else h = (r - g) / (max - min) + 4;
            h *= 60;
          }
          // vivid, mid-light pixels count most
          const w = sat * sat * (1 - Math.abs(2 * l - 1));
          const bin = bins[Math.floor(h / 30) % 12];
          bin.w += w;
          bin.s += sat * w;
          bin.l += l * w;
          total += w;
        }
        const top = bins.reduce((a, b) => (b.w > a.w ? b : a));
        if (total < 4 || top.w <= 0) {
          done({ light: "#c9cdc6", deep: "#9aa29b" });
          return;
        }
        const idx = bins.indexOf(top);
        const hue = idx * 30 + 15;
        const sat = Math.min(0.72, Math.max(0.35, top.s / top.w));
        const light = Math.min(0.62, Math.max(0.46, top.l / top.w));
        done({ light: hsl(hue, sat, light), deep: hsl(hue, sat, light - 0.13) });
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

/* ─────────────────────── Mail: the waiting letter ─────────────────────── */

export function mailFills(lines: number[]): Fills {
  const f: Fills = new Array(N * N).fill(null);
  const set = (x: number, y: number, r: string) => (f[at(x, y)] = r);
  // the open flap behind the letter
  for (let y = 4; y <= 6; y++) for (let x = 1 + (6 - y); x <= 14 - (6 - y); x++) set(x, y, "paper3");
  // the letter, standing up, with its lines
  for (let y = 1; y <= 8; y++) for (let x = 4; x <= 11; x++) set(x, y, "paper");
  lines.slice(0, 3).forEach((len, k) => {
    for (let x = 0; x < Math.min(6, len); x++) set(5 + x, 3 + k * 2, "ink600");
  });
  // the pocket in front, its side flaps meeting in a V
  for (let y = 7; y <= 12; y++)
    for (let x = 1; x <= 14; x++) set(x, y, y === 12 || x === 1 + (y - 7) || x === 14 - (y - 7) ? "paper3" : "paper2");
  return f;
}

/* ───────────────────────── inputs ───────────────────────── */

const draftStore = {
  subscribe: draftOnDesk.subscribe,
  get: () => {
    const d = loadDraft();
    return d && (d.subject.trim() || d.body.trim()) ? d.body : null;
  },
  server: () => null,
};

/* Each icon calls only its own hook, so a dock icon subscribes to its one
   source. All return null until hydrated (the static drawing). */

export function useHomeGlyph(base: Base): LiveGlyph | null {
  const hydrated = useHydrated();
  const { phase, mode } = useSky();
  const quarter = useQuarterHour();
  return useMemo(() => {
    if (!hydrated) return null;
    const live = mode === "auto";
    const s = skyState(phase, live, quarter * QUARTER + QUARTER / 2);
    return { key: `home:${phase}:${live ? quarter : "pin"}`, fills: homeFills(base, s) };
  }, [hydrated, base, phase, mode, quarter]);
}

export function useWorkGlyph(base: Base): LiveGlyph | null {
  const hydrated = useHydrated();
  const repos = useMaybeSiteData()?.repos;
  const quarter = useQuarterHour();
  return useMemo(() => {
    if (!hydrated || !repos?.length) return null;
    const top = repos.slice(0, 3);
    const now = quarter * QUARTER;
    const fills = workFills(base, top, now);
    return { key: `work:${fills.join()}`, fills };
  }, [hydrated, base, repos, quarter]);
}

export function useNowGlyph(base: Base): LiveGlyph | null {
  const hydrated = useHydrated();
  const site = useMaybeSiteData();
  const { track, playing } = useSpotifyStatus(site?.spotify ?? null);
  const art = track?.image ?? "";
  // the cover's colour, read once per cover (effects run only after hydration)
  const [label, setLabel] = useState<{ url: string; label: Label | null } | null>(null);
  useEffect(() => {
    if (!art) return;
    let on = true;
    loadLabel(art).then((l) => on && setLabel({ url: art, label: l }));
    return () => {
      on = false;
    };
  }, [art]);
  const tint = label && label.url === art ? label.label : null;
  return useMemo(() => {
    if (!hydrated || (!playing && !tint)) return null;
    return { key: `now:${playing ? 1 : 0}:${tint?.light ?? ""}`, fills: nowFills(base, playing, tint) };
  }, [hydrated, base, playing, tint]);
}

export function useMailGlyph(): LiveGlyph | null {
  const draft = useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.server);
  return useMemo(() => {
    if (draft == null) return null;
    const lines = letterLines(draft, 3, 34, 6);
    return { key: `contact:${lines.join()}`, fills: mailFills(lines) };
  }, [draft]);
}

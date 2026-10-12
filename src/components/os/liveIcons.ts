"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useHydrated } from "@/hooks/env";
import { QUARTER, useQuarterHour } from "@/hooks/useQuarterHour";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { LANG_COLORS } from "@/lib/langColors";
import { moonAt, sunAt, type SkyPhase } from "@/lib/sun";
import { composite, paintPlateLayers, plateSeed } from "@/components/apps/writing/plate";
import { draftOnDesk, letterLines, loadDraft } from "@/components/apps/contact/mail";
import { useMaybeSiteData } from "./SiteData";
import { useSky } from "./sky";
import { useTerminalHistory } from "./Terminal";

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
 * - Writing: the latest post's sky (its plate) is pasted on the notepad.
 * - Now: while music plays, or after it, the meter becomes the album's
 *   sleeve with the record peeking out (further out while it plays).
 * - Mail: a saved draft opens the envelope, the letter standing up with
 *   ink lines as long as the draft's.
 * - Terminal: a dim line for each command run this session (up to four)
 *   above the prompt.
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

/* ─────────────────────── Writing: the latest sky ─────────────────────── */

const thumbs = new Map<string, string[]>();

const TW = 6;
const TH = 4;

/** a post's plate, 6×4 cells (block-averaged from a small paint), cached by seed */
export function plateThumb(seed: string): string[] {
  const hit = thumbs.get(seed);
  if (hit) return hit;
  const B = 8;
  const W = TW * B;
  const H = TH * B;
  const layers = paintPlateLayers(seed, W, H);
  const px = new Uint8ClampedArray(W * H * 4);
  composite(layers, [0, 0, 0, 0], px);
  const out: string[] = [];
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  for (let ty = 0; ty < TH; ty++)
    for (let tx = 0; tx < TW; tx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = ty * B; y < (ty + 1) * B; y++)
        for (let x = tx * B; x < (tx + 1) * B; x++) {
          const i = (y * W + x) * 4;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
        }
      const n = B * B;
      out.push(`#${hex(r / n)}${hex(g / n)}${hex(b / n)}`);
    }
  thumbs.set(seed, out);
  return out;
}

export function writingFills(base: Base, thumb: string[] | null): Fills {
  const f = baseFills(base);
  if (!thumb) return f;
  // pasted at the top of the page, under the pen; the lines below stay
  for (let ty = 0; ty < TH; ty++)
    for (let tx = 0; tx < TW; tx++) {
      const i = at(4 + tx, 4 + ty);
      if (f[i] === "paper" || f[i] === "paper3") f[i] = thumb[ty * TW + tx];
    }
  return f;
}

/* ─────────────────────── Now: the sleeve ─────────────────────── */

export function nowFills(cover: string[] | null, playing: boolean): Fills | null {
  if (!cover) return null;
  const f: Fills = new Array(N * N).fill(null);
  // the record, behind the sleeve: further out while it plays
  const disc = playing
    ? [
        [13, 3, 12],
        [14, 4, 11],
      ]
    : [[13, 4, 11]];
  for (const [x, y0, y1] of disc) for (let y = y0; y <= y1; y++) f[at(x, y)] = "ink950";
  if (playing) {
    f[at(14, 7)] = "signal";
    f[at(14, 8)] = "signal";
  }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) f[at(1 + x, 2 + y)] = cover[y * 12 + x];
  return f;
}

const covers = new Map<string, string[] | null>();

/** an album cover sampled to 12×12 cells (null when the image can't be read) */
function loadCover(url: string): Promise<string[] | null> {
  if (covers.has(url)) return Promise.resolve(covers.get(url) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 12;
        c.height = 12;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no 2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, 12, 12);
        const d = ctx.getImageData(0, 0, 12, 12).data;
        const hex = (n: number) => n.toString(16).padStart(2, "0");
        // a few tones per channel, so it reads as pixel art and not a photo
        const q = (n: number) => Math.min(255, Math.round(n / 51) * 51);
        const out: string[] = [];
        for (let i = 0; i < 144; i++) out.push(`#${hex(q(d[i * 4]))}${hex(q(d[i * 4 + 1]))}${hex(q(d[i * 4 + 2]))}`);
        covers.set(url, out);
        resolve(out);
      } catch {
        covers.set(url, null);
        resolve(null);
      }
    };
    img.onerror = () => {
      covers.set(url, null);
      resolve(null);
    };
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

/* ─────────────────────── Terminal: what was typed ─────────────────────── */

export function terminalFills(history: string[]): Fills {
  const f: Fills = new Array(N * N).fill(null);
  const recent = history.slice(-4);
  // what was run, oldest on top, in dim scrollback
  recent.forEach((cmd, k) => {
    const y = 8 - 2 * (recent.length - 1 - k);
    f[at(2, y)] = "signalDeep";
    const len = Math.max(2, Math.min(10, Math.round(cmd.length / 1.5)));
    for (let x = 0; x < len; x++) f[at(4 + x, y)] = "paper3";
  });
  // the live prompt and its cursor
  for (const [x, y] of [
    [2, 10],
    [3, 10],
    [3, 11],
    [4, 11],
    [2, 12],
    [3, 12],
  ])
    f[at(x, y)] = "signal";
  for (let x = 6; x <= 10; x++) f[at(x, 12)] = "paper";
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

export function useWritingGlyph(base: Base): LiveGlyph | null {
  const hydrated = useHydrated();
  const latest = useMaybeSiteData()?.posts?.[0];
  return useMemo(() => {
    if (!hydrated || !latest) return null;
    const seed = plateSeed(latest);
    return { key: `writing:${seed}`, fills: writingFills(base, plateThumb(seed)) };
  }, [hydrated, base, latest]);
}

export function useNowGlyph(): LiveGlyph | null {
  const site = useMaybeSiteData();
  const { track, playing } = useSpotifyStatus(site?.spotify ?? null);
  const art = track?.image ?? "";
  // the album art, sampled once per cover (effects run only after hydration)
  const [cover, setCover] = useState<{ url: string; cells: string[] | null } | null>(null);
  useEffect(() => {
    if (!art) return;
    let on = true;
    loadCover(art).then((cells) => on && setCover({ url: art, cells }));
    return () => {
      on = false;
    };
  }, [art]);
  const cells = cover && cover.url === art ? cover.cells : null;
  return useMemo(() => {
    const fills = nowFills(cells, playing);
    return fills ? { key: `now:${art}:${playing ? 1 : 0}`, fills } : null;
  }, [cells, art, playing]);
}

export function useMailGlyph(): LiveGlyph | null {
  const draft = useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.server);
  return useMemo(() => {
    if (draft == null) return null;
    const lines = letterLines(draft, 3, 34, 6);
    return { key: `contact:${lines.join()}`, fills: mailFills(lines) };
  }, [draft]);
}

export function useTerminalGlyph(): LiveGlyph | null {
  const history = useTerminalHistory();
  return useMemo(() => {
    if (!history.length) return null;
    const fills = terminalFills(history);
    return { key: `terminal:${fills.join()}`, fills };
  }, [history]);
}

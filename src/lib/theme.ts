/**
 * emOS wears Elliot's Omarchy theme, Dos Moos: the palette is read from the
 * theme's own repo (colors.toml, plus rounding and border width from
 * hyprland.conf) and mapped onto the site's tokens. Pure: the server fetches
 * (./theme-source), this maps; the client derives its pixel-art tones from
 * the same tokens. The snapshot below is the fallback when GitHub doesn't
 * answer, and the values globals.css ships with.
 *
 * Every text colour is checked against the background it sits on and
 * lifted toward the foreground until it clears its contrast floor, so a
 * theme change can never make the site unreadable.
 */

import { cursorCss } from "./cursors";

export const THEME_REPO = "cempack/omarchy-dos-moos-theme";
export const THEME_NAME = "Dos Moos";

export type ThemeTokens = {
  ink950: string;
  ink900: string;
  ink800: string;
  ink700: string;
  ink600: string;
  ink500: string;
  label: string;
  label2: string;
  label3: string;
  /** the accent */
  signal: string;
  signalDeep: string;
  /** links, live data */
  ion: string;
  /** night, secondary accents */
  lilac: string;
  /** sun, warmth */
  ember: string;
  /** live dot, errors, close */
  flare: string;
  yellow: string;
  cursor: string;
  selectionBg: string;
  selectionFg: string;
  borderActive: string;
  borderInactive: string;
  /** ANSI 0–15 */
  ansi: string[];
  /** px */
  radius: number;
  /** px */
  border: number;
};

export type ThemeMeta = {
  name: string;
  repo: string;
  /** colors.toml's latest commit, when known */
  sha?: string;
  at?: string;
  source: "github" | "snapshot";
};

export type Theme = { tokens: ThemeTokens; meta: ThemeMeta };

/* ───────────────────────────── colour maths ───────────────────────────── */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#ABC", "abc123", "rgb(A5B5AB)", "rgba(A5B5ABff)" → "#a5b5ab", or null */
export function normHex(v: string | undefined | null): string | null {
  if (!v) return null;
  let s = v.trim();
  const fn = /^rgba?\(\s*([0-9a-f]{6})(?:[0-9a-f]{2})?\s*\)$/i.exec(s);
  if (fn) s = fn[1];
  const m = HEX.exec(s);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return `#${h}`;
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** a → b by t (sRGB) */
export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** lift `fg` toward `toward` until it clears `min` on `bg` */
export function ensureContrast(fg: string, bg: string, min: number, toward: string) {
  if (contrast(fg, bg) >= min) return fg;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(fg, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

/** "rgba(…)" for a hex at alpha a (for tints) */
export const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/* ───────────────────────────── parsing ───────────────────────────── */

/** colors.toml is flat `key = "value"` lines (sections and comments ignored) */
export function parseColors(toml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of toml.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** rounding and border_size from hyprland.conf (the last value wins, as in Hyprland) */
export function parseHyprland(conf: string): { rounding?: number; border?: number } {
  const out: { rounding?: number; border?: number } = {};
  for (const line of conf.split(/\r?\n/)) {
    const code = line.replace(/#.*/, "");
    const r = /^\s*rounding\s*=\s*(\d+)/.exec(code);
    if (r) out.rounding = Number(r[1]);
    const b = /^\s*border_size\s*=\s*(\d+)/.exec(code);
    if (b) out.border = Number(b[1]);
  }
  return out;
}

/* ───────────────────────────── mapping ───────────────────────────── */

export function themeFrom(colors: Record<string, string>, hypr: { rounding?: number; border?: number } = {}): ThemeTokens {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = normHex(colors[k]);
      if (v) return v;
    }
    return null;
  };
  const bg = pick("background", "dark_background", "color0") ?? "#131516";
  const fg = pick("foreground", "bright_foreground", "color15") ?? "#f8ebe3";
  const bg0 = pick("darker_background") ?? mix(bg, "#000000", 0.25);
  const bg1 = pick("lighter_background") ?? mix(bg, fg, 0.05);
  const fg2 = pick("dark_foreground", "color7") ?? mix(fg, bg, 0.3);
  const c8 = pick("color8") ?? mix(bg1, fg2, 0.25);
  const muted = pick("muted") ?? mix(fg2, bg, 0.35);
  const accent = pick("accent", "green", "color2") ?? fg2;
  const red = pick("red", "color1") ?? "#e2786b";
  const yellow = pick("yellow", "color3") ?? "#e0bd6e";
  const orange = pick("orange", "yellow", "color3") ?? yellow;
  const cyan = pick("cyan", "color6") ?? accent;
  const magenta = pick("magenta", "color5") ?? accent;

  // text floors on the main background: primary 7:1, secondary 7:1, the rest 4.5:1
  const text = (c: string, min = 4.5) => ensureContrast(c, bg, min, fg);
  const signal = text(accent);
  const ansiFallback = [bg, red, accent, yellow, fg2, magenta, cyan, fg2, c8, red, accent, yellow, fg2, magenta, cyan, fg];

  return {
    ink950: bg0,
    ink900: bg,
    ink800: bg1,
    ink700: mix(bg1, c8, 0.4),
    ink600: mix(bg1, c8, 0.72),
    ink500: c8,
    label: text(fg, 7),
    label2: text(fg2, 7),
    label3: text(muted),
    signal,
    signalDeep: mix(signal, bg, 0.3),
    ion: text(cyan),
    lilac: text(magenta),
    ember: text(orange),
    flare: text(red),
    yellow,
    cursor: pick("cursor") ?? yellow,
    selectionBg: pick("selection_background") ?? signal,
    selectionFg: pick("selection_foreground") ?? bg,
    borderActive: pick("hyprland_active_border") ?? fg2,
    borderInactive: pick("hyprland_inactive_border") ?? c8,
    ansi: ansiFallback.map((f, i) => pick(`color${i}`) ?? f),
    radius: Math.max(0, Math.min(24, hypr.rounding ?? 12)),
    border: Math.max(1, Math.min(3, hypr.border ?? 1)),
  };
}

/** the site's CSS custom properties for a theme (an unlayered :root rule
    beats Tailwind's @theme layer) */
export function themeCss(t: ThemeTokens) {
  const v: [string, string][] = [
    ["--color-ink-950", t.ink950],
    ["--color-ink-900", t.ink900],
    ["--color-ink-800", t.ink800],
    ["--color-ink-700", t.ink700],
    ["--color-ink-600", t.ink600],
    ["--color-ink-500", t.ink500],
    ["--color-label", t.label],
    ["--color-label-2", t.label2],
    ["--color-label-3", t.label3],
    ["--color-signal", t.signal],
    ["--color-signal-deep", t.signalDeep],
    ["--color-ion", t.ion],
    ["--color-lilac", t.lilac],
    ["--color-ember", t.ember],
    ["--color-flare", t.flare],
    ["--color-yellow", t.yellow],
    ["--color-cursor", t.cursor],
    ["--color-selection-bg", t.selectionBg],
    ["--color-selection-fg", t.selectionFg],
    ["--color-border-active", t.borderActive],
    ["--color-border-inactive", t.borderInactive],
    ...t.ansi.map((c, i) => [`--color-ansi-${i}`, c] as [string, string]),
    ["--radius-window", `${t.radius}px`],
    ["--win-border", `${t.border}px`],
  ];
  // the pixel cursors, drawn in this palette (./cursors)
  return `:root{${v.map(([k, c]) => `${k}:${c}`).join(";")}}${cursorCss(t)}`;
}

/* ───────────────────────────── the snapshot ───────────────────────────── */

/** colors.toml at cempack/omarchy-dos-moos-theme@ec83b09 */
export const SNAPSHOT_COLORS: Record<string, string> = {
  accent: "#819890",
  cursor: "#F4E276",
  foreground: "#F8EBE3",
  background: "#131516",
  selection_foreground: "#131516",
  selection_background: "#A5B5AB",
  selection: "#35352D",
  muted: "#72856C",
  hyprland_active_border: "rgb(A5B5AB)",
  hyprland_inactive_border: "rgb(35373A)",
  dark_background: "#131516",
  darker_background: "#0F1011",
  lighter_background: "#1C2224",
  dark_foreground: "#A5B5AB",
  light_foreground: "#F9F5E4",
  bright_foreground: "#F8EBE3",
  red: "#F0334A",
  yellow: "#F4E276",
  orange: "#E0C15C",
  green: "#819890",
  cyan: "#6d877d",
  blue: "#A5B5AB",
  magenta: "#72856C",
  color0: "#131516",
  color1: "#F0334A",
  color2: "#819890",
  color3: "#F4E276",
  color4: "#A5B5AB",
  color5: "#72856C",
  color6: "#6d877d",
  color7: "#d5dbd7",
  color8: "#3A4849",
  color9: "#F0334A",
  color10: "#819890",
  color11: "#F4E276",
  color12: "#A5B5AB",
  color13: "#72856C",
  color14: "#6d877d",
  color15: "#F8EBE3",
};

export const SNAPSHOT_THEME: Theme = {
  tokens: themeFrom(SNAPSHOT_COLORS, { rounding: 12, border: 1 }),
  meta: { name: THEME_NAME, repo: THEME_REPO, sha: "ec83b09", source: "snapshot" },
};

/* ───────────────────────────── pixel-art tones ───────────────────────────── */

/**
 * The tones the pixel art (app icons, glyphs, little machines) is drawn in,
 * from the theme: the base roles plus a light and a deep shade of each
 * accent, so a sage theme draws sage icons and a red theme red ones.
 */
export function artPalette(t: ThemeTokens) {
  return {
    paper: t.label,
    paper2: t.label2,
    paper3: t.label3,
    ink950: t.ink950,
    ink900: t.ink900,
    ink800: t.ink800,
    ink700: t.ink700,
    ink600: t.ink600,
    ink500: t.ink500,
    signal: t.signal,
    signalDeep: t.signalDeep,
    signalLight: mix(t.signal, t.label, 0.55),
    ion: t.ion,
    ionLight: mix(t.ion, t.label, 0.6),
    ionDeep: mix(t.ion, t.ink900, 0.35),
    lilac: t.lilac,
    lilacLight: mix(t.lilac, t.label, 0.55),
    lilacDeep: mix(t.lilac, t.ink900, 0.35),
    ember: t.ember,
    emberLight: mix(t.ember, t.label, 0.55),
    emberDeep: mix(t.ember, t.ink900, 0.25),
    flare: t.flare,
    flareDeep: mix(t.flare, t.ink900, 0.3),
    yellow: t.yellow,
    night: mix(t.ink800, t.ion, 0.12),
  };
}
export type ArtPalette = ReturnType<typeof artPalette>;

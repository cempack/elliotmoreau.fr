/**
 * The theme engine: Dos Moos's colors.toml and hyprland.conf parsed and
 * mapped onto the site's tokens, with the contrast floors holding for any
 * theme.
 *
 *   npx tsx --conditions=react-server --test scripts/test/theme.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SNAPSHOT_COLORS, SNAPSHOT_THEME, contrast, normHex, parseColors, parseHyprland, themeCss, themeFrom } from "../../src/lib/theme";

const REPO = "/home/user/cempack/omarchy-dos-moos-theme";

test("colour formats normalise", () => {
  assert.equal(normHex("#A5B5AB"), "#a5b5ab");
  assert.equal(normHex("abc"), "#aabbcc");
  assert.equal(normHex("rgb(A5B5AB)"), "#a5b5ab");
  assert.equal(normHex("rgba(A5B5ABee)"), "#a5b5ab");
  assert.equal(normHex("not a colour"), null);
  assert.equal(normHex(undefined), null);
});

test("colors.toml: flat keys, comments and sections ignored", () => {
  const c = parseColors(`# comment\naccent = "#819890"\n[section]\nforeground = "#F8EBE3" # trailing\nbad = 12\n`);
  assert.deepEqual(c, { accent: "#819890", foreground: "#F8EBE3" });
});

test("hyprland.conf: rounding and border_size, comments ignored", () => {
  const h = parseHyprland(`general {\n  border_size = 1\n  # border_size = 4\n}\ndecoration {\n  rounding = 12\n  rounding_power = 2\n}`);
  assert.deepEqual(h, { rounding: 12, border: 1 });
});

test("the snapshot maps to the theme's own colours", () => {
  const t = SNAPSHOT_THEME.tokens;
  assert.equal(t.ink900, "#131516");
  assert.equal(t.label, "#f8ebe3");
  assert.equal(t.signal, "#819890");
  assert.equal(t.flare, "#f0334a");
  assert.equal(t.borderActive, "#a5b5ab");
  assert.equal(t.ansi.length, 16);
  assert.equal(t.radius, 12);
  assert.equal(t.border, 1);
});

test("the live repo file parses the same as the snapshot", { skip: !existsSync(`${REPO}/colors.toml`) }, () => {
  const live = parseColors(readFileSync(`${REPO}/colors.toml`, "utf8"));
  for (const [k, v] of Object.entries(SNAPSHOT_COLORS)) assert.equal(normHex(live[k]), normHex(v), k);
  assert.deepEqual(parseHyprland(readFileSync(`${REPO}/hyprland.conf`, "utf8")), { rounding: 12, border: 1 });
});

test("text never falls under its contrast floor, whatever the theme", () => {
  // a hostile theme: muted and accents nearly the background
  const t = themeFrom({ background: "#202020", foreground: "#eeeeee", muted: "#262626", accent: "#2a2a2a", red: "#301010", cyan: "#203030", dark_foreground: "#303030" });
  for (const k of ["label3", "signal", "flare", "ion", "lilac", "ember"] as const) assert.ok(contrast(t[k], t.ink900) >= 4.5, `${k} ${t[k]}`);
  for (const k of ["label", "label2"] as const) assert.ok(contrast(t[k], t.ink900) >= 7, k);
});

test("a sparse theme still fills every token", () => {
  const t = themeFrom({ background: "#101010", foreground: "#f0f0f0" });
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "string") assert.match(v, /^#[0-9a-f]{6}$/, k);
  }
  assert.equal(t.ansi.every((c) => /^#[0-9a-f]{6}$/.test(c)), true);
});

test("the CSS sets every site token on :root", () => {
  const css = themeCss(SNAPSHOT_THEME.tokens);
  for (const v of ["--color-ink-950", "--color-label-3", "--color-signal", "--color-flare", "--color-cursor", "--color-border-active", "--color-ansi-15", "--radius-window:12px", "--win-border:1px"]) assert.ok(css.includes(v), v);
  assert.ok(css.startsWith(":root{") && css.endsWith("}"));
});

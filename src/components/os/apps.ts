import type { Locale } from "@/i18n/config";
import { stripLocale } from "@/i18n/config";

/**
 * The apps of emOS. Each route is an app; the dock, Spotlight, menu bar
 * and window chrome all read this registry. `accent` tints the app's
 * icon tile and window glow.
 */
export type AppId = "home" | "work" | "writing" | "atlas" | "now" | "contact" | "admin";

/** the apps visitors can find (everything but the admin panel) */
export type PublicAppId = Exclude<AppId, "admin">;

export type AppDef = {
  id: AppId;
  path: string;
  /** key into dict.shell.apps */
  label: AppId;
  accent: string;
  /** dock keyboard shortcut (1–6) */
  key: string;
};

/** The dock's apps (and the workspaces, Spotlight, sitemap). */

export const APPS: AppDef[] = [
  { id: "home", path: "/", label: "home", accent: "var(--color-signal)", key: "1" },
  { id: "work", path: "/work", label: "work", accent: "var(--color-ion)", key: "2" },
  { id: "writing", path: "/writing", label: "writing", accent: "var(--color-ember)", key: "3" },
  { id: "atlas", path: "/atlas", label: "atlas", accent: "var(--color-lilac)", key: "4" },
  { id: "now", path: "/now", label: "now", accent: "var(--color-flare)", key: "5" },
  { id: "contact", path: "/contact", label: "contact", accent: "var(--color-signal)", key: "6" },
];

/**
 * Elliot's admin panel: a window like the others, opened only from the
 * Terminal (`sudo`). Never in the Dock, Spotlight, workspaces or sitemap.
 */
export const ADMIN_APP: AppDef = { id: "admin", path: "/admin", label: "admin", accent: "var(--color-ember)", key: "" };

const ALL_APPS = [...APPS, ADMIN_APP];

/** any app's definition, the hidden admin included */
export function appDef(id: AppId): AppDef {
  return ALL_APPS.find((a) => a.id === id) ?? APPS[0];
}

export function appForPath(pathname: string): AppDef {
  const p = stripLocale(pathname);
  return ALL_APPS.find((a) => a.path !== "/" && (p === a.path || p.startsWith(`${a.path}/`))) ?? APPS[0];
}

export type { Locale };

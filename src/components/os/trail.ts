"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { stripLocale } from "@/i18n/config";
import { appForPath, type AppId } from "./apps";

/**
 * Where you've been this visit, for Spotlight's Arrivals board: the app,
 * the thing you opened in it (a post, a repo, a place) and when. Kept in
 * sessionStorage (this tab, this visit), never sent anywhere. The newest
 * stop replaces an identical one, so going back and forth doesn't fill it.
 */

export type Stop = {
  /** the URL to return to (path, query and hash, as visited) */
  href: string;
  app: AppId;
  /** what was open: a post slug, a repo, a place id ("" for the app itself) */
  item: string;
  at: number;
};

const KEY = "em-trail";
const MAX = 8;
const listeners = new Set<() => void>();
let cache: { raw: string; value: Stop[] } = { raw: "", value: [] };

function read(): Stop[] {
  let raw = "";
  try {
    raw = sessionStorage.getItem(KEY) ?? "";
  } catch {}
  if (raw === cache.raw) return cache.value;
  let value: Stop[] = [];
  try {
    value = raw ? (JSON.parse(raw) as Stop[]) : [];
  } catch {}
  cache = { raw, value };
  return value;
}

function itemOf(app: AppId, url: URL) {
  const path = stripLocale(url.pathname);
  if (app === "writing") return path.startsWith("/writing/") ? path.slice(9) : (url.searchParams.get("p") ?? "");
  if (app === "work") return url.searchParams.get("repo") ?? "";
  if (app === "atlas") return url.hash.slice(1);
  return "";
}

function record(href: string) {
  const url = new URL(href, window.location.origin);
  const app = appForPath(url.pathname).id;
  if (app === "admin") return;
  const stop: Stop = { href: `${url.pathname}${url.search}${url.hash}`, app, item: itemOf(app, url), at: Date.now() };
  const prev = read().filter((s) => !(s.app === stop.app && s.item === stop.item));
  const next = [stop, ...prev].slice(0, MAX);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export const trail = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  get: read,
  server: (): Stop[] => [],
};

/** records each page, query and hash change (mounted once, in the shell) */
export function TrailRecorder() {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search?.toString() ?? "";
  useEffect(() => {
    // the router has committed: the address bar is the page now
    const id = window.setTimeout(() => record(window.location.href), 50);
    return () => window.clearTimeout(id);
  }, [pathname, qs]);
  useEffect(() => {
    const onHash = () => record(window.location.href);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return null;
}

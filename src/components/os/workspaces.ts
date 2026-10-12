"use client";

import { useMemo, useSyncExternalStore } from "react";
import { APPS, type AppId } from "./apps";

/**
 * Workspaces the way Hyprland shows them without persistent workspaces:
 * one exists only while something is open in it. Here that means the apps
 * this visitor opened in this tab (sessionStorage), plus the Desktop,
 * which is always there. Minimising keeps a workspace; closing a window
 * removes it. Shown in dock order, so each keeps its place and its 1-6
 * shortcut.
 */
const KEY = "em-ws";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function write(ids: AppId[]) {
  try {
    sessionStorage.setItem(KEY, ids.join(","));
  } catch {}
  listeners.forEach((l) => l());
}

function parse(raw: string): AppId[] {
  const known = new Set<string>(APPS.map((a) => a.id));
  return raw.split(",").filter((x): x is AppId => known.has(x));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** An app was opened: its workspace appears (if it is not there yet). */
export function openWorkspace(id: AppId) {
  if (id === "home") return;
  const ids = parse(read());
  if (!ids.includes(id)) write([...ids, id]);
}

/** A restart: every app is closed, only the Desktop remains. */
export function resetWorkspaces() {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(DESKS);
  } catch {}
  listeners.forEach((l) => l());
}

/** Its window was closed: the workspace goes away. */
export function closeWorkspace(id: AppId) {
  const ids = parse(read());
  if (ids.includes(id)) write(ids.filter((x) => x !== id));
  const desks = parseDesks(readDesks());
  if (desks.some((d) => d.includes(id))) writeDesks(desks.map((d) => d.filter((x) => x !== id)));
}

/*
 * Desks: the overview's numbered workspaces, each a group of open
 * windows. A window nobody moved lives on the first desk, so a visit that
 * never touches them has exactly one. Dragging a window onto another desk
 * in the overview moves it there; the menu bar then shows only the
 * current desk's windows, Hyprland-style.
 */
const DESKS = "em-desks";
export type Desks = AppId[][];

function readDesks(): string {
  try {
    return sessionStorage.getItem(DESKS) ?? "";
  } catch {
    return "";
  }
}

function parseDesks(raw: string): Desks {
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) return v.map((d) => (Array.isArray(d) ? parse(d.join(",")) : []));
  } catch {}
  return [];
}

function writeDesks(d: Desks) {
  // trailing empty desks go away (one is always there)
  const out = d.map((x) => [...x]);
  while (out.length > 1 && !out[out.length - 1].length) out.pop();
  try {
    sessionStorage.setItem(DESKS, JSON.stringify(out));
  } catch {}
  listeners.forEach((l) => l());
}

/** the desks, at least one */
export function useDesks(): Desks {
  const raw = useSyncExternalStore(subscribe, readDesks, () => "");
  return useMemo(() => {
    const d = parseDesks(raw);
    return d.length ? d : [[]];
  }, [raw]);
}

/** which desk a window is on (the first, unless it was moved) */
export const deskOf = (desks: Desks, id: AppId) => Math.max(0, desks.findIndex((d) => d.includes(id)));

/** the open windows on desk `k`, in dock order */
export const deskWindows = (desks: Desks, open: AppId[], k: number) => open.filter((id) => id !== "home" && deskOf(desks, id) === k);

/** move a window to desk `k` (one past the last makes a new desk) */
export function moveToDesk(id: AppId, k: number) {
  const d = parseDesks(readDesks()).map((x) => x.filter((y) => y !== id));
  while (d.length <= k) d.push([]);
  d[k].push(id);
  writeDesks(d);
}

/** the desk last looked at from the Desktop (which belongs to no desk) */
let homeDesk = 0;
export const getHomeDesk = () => homeDesk;
export const setHomeDesk = (k: number) => void (homeDesk = k);

/**
 * The workspaces to show, in dock order: the Desktop, every open app and
 * the current one. The server (and hydration) only knows the current app.
 */
export function useWorkspaces(current: AppId): AppId[] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  return useMemo(() => {
    const open = new Set<AppId>(["home", current, ...parse(raw)]);
    return APPS.map((a) => a.id).filter((id) => open.has(id));
  }, [raw, current]);
}

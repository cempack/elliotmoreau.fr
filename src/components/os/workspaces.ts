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
  } catch {}
  listeners.forEach((l) => l());
}

/** Its window was closed: the workspace goes away. */
export function closeWorkspace(id: AppId) {
  const ids = parse(read());
  if (ids.includes(id)) write(ids.filter((x) => x !== id));
}

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

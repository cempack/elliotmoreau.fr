"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * The dashboard order, persisted per device in localStorage. Read through
 * useSyncExternalStore (server and hydration render the default order),
 * kept in sync across tabs, and validated against the widgets that exist
 * today: unknown ids are dropped, new ones slot in at their default place.
 */
const KEY = "em-now-board";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(order: string[] | null) {
  try {
    if (order) localStorage.setItem(KEY, JSON.stringify(order));
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function parse(raw: string | null, defaults: readonly string[]): string[] {
  if (!raw) return [...defaults];
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return [...defaults];
    const known = new Set(defaults);
    const order = saved.filter((x): x is string => typeof x === "string" && known.has(x));
    const unique = [...new Set(order)];
    // widgets added since the save go back to their default neighbours
    defaults.forEach((id, i) => {
      if (unique.includes(id)) return;
      const before = defaults.slice(0, i).reverse().find((d) => unique.includes(d));
      unique.splice(before ? unique.indexOf(before) + 1 : 0, 0, id);
    });
    return unique;
  } catch {
    return [...defaults];
  }
}

export function useBoardOrder(defaults: readonly string[]) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const order = useMemo(() => parse(raw, defaults), [raw, defaults]);
  const isDefault = order.length === defaults.length && order.every((x, i) => x === defaults[i]);
  const save = useCallback(
    (next: string[]) => {
      const same = next.length === defaults.length && next.every((x, i) => x === defaults[i]);
      write(same ? null : next);
    },
    [defaults]
  );
  const reset = useCallback(() => write(null), []);
  return { order, isDefault, save, reset };
}

/**
 * The visitor's letters, as this browser remembers them: localStorage
 * `em-threads` = [{ token, subject, at }], newest first. The token is the
 * only key to a thread (the server never sees anything else from here),
 * and the same link arrives by email with every reply from Elliot. A tiny
 * external store, so Mail and its Sent mailbox stay in step, across tabs
 * too.
 */
import { useSyncExternalStore } from "react";
import { TOKEN_RE } from "./api";

export type LocalThread = { token: string; subject: string; at: string };

const KEY = "em-threads";
const MAX = 50;
const EMPTY: LocalThread[] = [];

let cache: LocalThread[] | null = null;
const subs = new Set<() => void>();

function read(): LocalThread[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return EMPTY;
    const out = raw.filter(
      (t): t is LocalThread =>
        !!t && typeof t === "object" && TOKEN_RE.test((t as LocalThread).token) && typeof (t as LocalThread).subject === "string" && typeof (t as LocalThread).at === "string"
    );
    return out.length ? out.slice(0, MAX) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(list: LocalThread[]) {
  cache = list.length ? list : EMPTY;
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {}
  for (const f of subs) f();
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY && e.key !== null) return;
  cache = read();
  for (const f of subs) f();
}

export const threadStore = {
  get(): LocalThread[] {
    if (cache === null) cache = read();
    return cache;
  },
  server: (): LocalThread[] => EMPTY,
  subscribe(f: () => void) {
    if (!subs.size) window.addEventListener("storage", onStorage);
    subs.add(f);
    return () => {
      subs.delete(f);
      if (!subs.size) window.removeEventListener("storage", onStorage);
    };
  },
  add(t: LocalThread) {
    const list = threadStore.get();
    if (list.some((x) => x.token === t.token)) return;
    write([t, ...list].slice(0, MAX));
  },
  /** what the server says it is now (its subject and start date), when that differs */
  sync(token: string, patch: Partial<Omit<LocalThread, "token">>) {
    const list = threadStore.get();
    const i = list.findIndex((x) => x.token === token);
    if (i < 0) return;
    const cur = list[i];
    const next = { ...cur, ...patch };
    if (next.subject === cur.subject && next.at === cur.at) return;
    write(list.map((x, j) => (j === i ? next : x)));
  },
  remove(token: string) {
    write(threadStore.get().filter((x) => x.token !== token));
  },
};

export function useLocalThreads() {
  return useSyncExternalStore(threadStore.subscribe, threadStore.get, threadStore.server);
}

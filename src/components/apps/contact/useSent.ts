"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchThreads, type ApiThread } from "./api";
import { threadStore, useLocalThreads } from "./threads";

export type SentItem = {
  token: string;
  subject: string;
  at: string;
  /** what the server has (undefined until it answers) */
  thread?: ApiThread;
  /** the server doesn't know this token any more */
  gone?: boolean;
};

const POLL_MS = 60_000;

/**
 * The visitor's letters, local list + the server's copy of each thread.
 * Fetched once when there is something to fetch (for the unread badge),
 * then every minute while the Sent mailbox is open and the page visible.
 */
export function useSent(active: boolean) {
  const local = useLocalThreads();
  const [remote, setRemote] = useState<Record<string, ApiThread | null>>({});
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState(false);
  const inFlight = useRef(false);
  const key = local.map((t) => t.token).join(",");

  const refresh = useCallback(async (read?: string) => {
    const tokens = threadStore.get().map((t) => t.token).slice(0, 20);
    if (!tokens.length || (inFlight.current && !read)) return;
    inFlight.current = true;
    const res = await fetchThreads(tokens, read);
    inFlight.current = false;
    setFetched(true);
    if (!res) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRemote((prev) => (JSON.stringify(prev) === JSON.stringify(res) ? prev : res));
    for (const [token, t] of Object.entries(res)) if (t) threadStore.sync(token, { subject: t.subject, at: t.createdAt });
  }, []);

  // first look, and whenever a letter is added or removed
  useEffect(() => {
    if (!key) return;
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [key, refresh]);

  // while open: every minute, and on coming back to the tab
  useEffect(() => {
    if (!active || !key) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, key, refresh]);

  const items = useMemo<SentItem[]>(() => {
    const list = local.map((l) => ({
      ...l,
      thread: remote[l.token] ?? undefined,
      gone: remote[l.token] === null,
    }));
    // latest activity first
    const when = (x: SentItem) => x.thread?.lastAt ?? x.at;
    return list.sort((a, b) => when(b).localeCompare(when(a)));
  }, [local, remote]);

  const unread = items.filter((x) => (x.thread?.visitorUnread ?? 0) > 0).length;
  return { items, unread, refresh, failed, loading: Boolean(key) && !fetched };
}

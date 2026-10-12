"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CiInfo, RepoDetail, RepoInfo } from "@/lib/github";

/**
 * What Projects learns after the page is up: each repo's CI signal (Green
 * light), one repo turned over (Quick Look's back), and what changed since
 * this visitor last looked (stars gained, new pushes), from a snapshot kept
 * in this browser.
 */

/* ── CI, for the list and the lid ── */

const ciCache = new Map<string, CiInfo>();

export function useCi(repos: RepoInfo[]): Record<string, CiInfo> {
  const names = repos.slice(0, 12).map((r) => r.name);
  const key = names.join(",");
  const [ci, setCi] = useState<Record<string, CiInfo>>(() => Object.fromEntries(names.filter((n) => ciCache.has(n)).map((n) => [n, ciCache.get(n)!])));
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetch(`/api/repos/ci?names=${encodeURIComponent(key)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ci?: Record<string, CiInfo> } | null) => {
        if (!j?.ci) return;
        for (const [n, v] of Object.entries(j.ci)) ciCache.set(n, v);
        setCi(j.ci);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);
  return ci;
}

/* ── one repo, turned over ── */

const detailCache = new Map<string, RepoDetail | null>();

export function useRepoDetail(name: string | null): RepoDetail | null | undefined {
  const [state, setState] = useState<{ name: string | null; detail: RepoDetail | null | undefined }>({ name, detail: name ? detailCache.get(name) : undefined });
  const current = state.name === name ? state.detail : name ? detailCache.get(name) : undefined;
  useEffect(() => {
    if (!name || detailCache.has(name)) return;
    const ctrl = new AbortController();
    fetch(`/api/repo?name=${encodeURIComponent(name)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { detail?: RepoDetail } | null) => {
        detailCache.set(name, j?.detail ?? null);
        setState({ name, detail: j?.detail ?? null });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [name]);
  return current;
}

/* ── new since you last looked ── */

export type Mark = { stars?: number; fresh?: boolean };
type Snap = Record<string, { s: number; p: string }>;

const SEEN_KEY = "em-work-seen";
let marks: Record<string, Mark> | null = null;
const EMPTY: Record<string, Mark> = {};

/**
 * Compared once per page load against the snapshot from the visitor's
 * last visit, then the snapshot is replaced: a mark shows for this visit
 * only. A first visit has nothing to compare with, so no marks.
 */
function computeMarks(repos: RepoInfo[]): Record<string, Mark> {
  if (marks) return marks;
  let prev: Snap | null = null;
  try {
    prev = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null") as Snap | null;
  } catch {}
  const out: Record<string, Mark> = {};
  if (prev) {
    for (const r of repos) {
      const before = prev[r.name];
      if (!before) {
        out[r.name] = { fresh: true };
        continue;
      }
      const m: Mark = {};
      if (r.stars > before.s) m.stars = r.stars - before.s;
      if (r.pushedAt && before.p && r.pushedAt > before.p) m.fresh = true;
      if (m.stars || m.fresh) out[r.name] = m;
    }
  }
  const snap: Snap = Object.fromEntries(repos.map((r) => [r.name, { s: r.stars, p: r.pushedAt }]));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(snap));
  } catch {}
  marks = out;
  return out;
}

const noop = () => () => {};

/** `live`: only real data is compared and remembered (never the sample repos) */
export function useMarks(repos: RepoInfo[], live: boolean): Record<string, Mark> {
  return useSyncExternalStore(
    noop,
    () => (live ? computeMarks(repos) : EMPTY),
    () => EMPTY
  );
}

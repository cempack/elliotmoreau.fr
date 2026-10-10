"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RepoInfo } from "@/lib/github";
import type { SiteData, Source } from "@/lib/data";
import { useHydrated, useMedia } from "@/hooks/env";
import { lenisRef } from "@/lib/lenisRef";
import { useSound } from "@/lib/sound";
import { revealItem } from "./Collection";
import {
  type Filter,
  type SortKey,
  type ViewMode,
  inFilter,
  itemId,
  matches,
  pickFeatured,
  recentNames,
  sameFilter,
  searchTerms,
  sortRepos,
} from "./model";

export type QL = { name: string; mode: "panel" | "sheet"; from: "item" | "hero" };

type Work = {
  repos: RepoInfo[];
  source: Source;
  hydrated: boolean;
  phone: boolean;
  filter: Filter;
  setFilter: (f: Filter) => void;
  query: string;
  setQuery: (q: string) => void;
  terms: string[];
  view: ViewMode;
  /** what is on screen; null until hydrated while CSS decides ("auto") */
  effView: "icons" | "list" | null;
  setView: (v: "icons" | "list") => void;
  stagger: boolean;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  visible: RepoInfo[];
  widerHits: number;
  featured: RepoInfo | null;
  showHero: boolean;
  stars: number;
  selected: string | null;
  setSelected: (name: string | null) => void;
  focusItem: (name: string | undefined) => void;
  ql: QL | null;
  qlRepo: RepoInfo | null;
  openQL: (name: string, from?: QL["from"]) => void;
  stepQL: (dir: 1 | -1) => void;
  getOrigin: () => HTMLElement | null;
  onPanelClosed: (after?: () => void) => void;
  onSheetClosed: () => void;
  /** run after the open sheet has animated away */
  afterSheet: (fn: () => void) => void;
  applyTag: (tag: string) => void;
};

const Ctx = createContext<Work | null>(null);

export function useWork() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWork outside WorkProvider");
  return v;
}

/** The visible search field (the title-bar one, or the phone one). */
export function visibleSearch() {
  return [...document.querySelectorAll<HTMLInputElement>("[data-work-search]")].find((el) => el.offsetParent !== null);
}

/**
 * All of Projects' state, above the window: the toolbar, sidebar and
 * content read it from context, so AppWindow itself never re-renders (and
 * never re-measures its layout) while you type or filter.
 */
export function WorkProvider({ data, children }: { data: SiteData; children: React.ReactNode }) {
  const repos = data.repos;
  const source = data.sources.repos;
  const { blip } = useSound();
  const hydrated = useHydrated();
  const phone = useMedia("(max-width: 767px)");

  const [filter, setFilterState] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [view, setViewState] = useState<ViewMode>("auto");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<string | null>(null);
  const [ql, setQl] = useState<QL | null>(null);
  const [stagger, setStagger] = useState(false);
  const staggerTimer = useRef(0);
  const afterSheetRef = useRef<(() => void) | null>(null);

  // CSS owns the layout until the user picks one (no SSR flash on phones)
  const effView = view === "auto" ? (hydrated ? (phone ? "list" : "icons") : null) : view;

  const recent = useMemo(() => recentNames(repos), [repos]);
  const terms = useMemo(() => searchTerms(query), [query]);
  const scoped = useMemo(() => repos.filter((r) => inFilter(r, filter, recent)), [repos, filter, recent]);
  const visible = useMemo(() => sortRepos(scoped.filter((r) => matches(r, terms)), sort), [scoped, terms, sort]);
  const widerHits = useMemo(
    () => (terms.length && filter.kind !== "all" ? repos.filter((r) => matches(r, terms)).length : 0),
    [repos, terms, filter.kind]
  );
  const featured = useMemo(() => pickFeatured(repos), [repos]);
  const stars = useMemo(() => visible.reduce((s, r) => s + r.stars, 0), [visible]);
  const sel = selected && visible.some((r) => r.name === selected) ? selected : null;
  const qlRepo = ql ? (repos.find((r) => r.name === ql.name) ?? null) : null;
  const showHero = !!featured && filter.kind === "all" && terms.length === 0;

  // transient UI doesn't survive the page being hidden (Next keeps it in <Activity>)
  useLayoutEffect(() => () => setQl(null), []);
  useEffect(() => () => window.clearTimeout(staggerTimer.current), []);

  // ⌘F / Ctrl+F and "/" focus the search here (Spotlight keeps "/" elsewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".os-term")) return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      const typing = !!target?.closest?.("input,textarea,select,[contenteditable='true']");
      const find = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f";
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing;
      if (!find && !slash) return;
      const input = visibleSearch();
      if (!input || input.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      input.focus({ preventScroll: true });
      input.select();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const setFilter = (f: Filter) => {
    if (sameFilter(f, filter)) return;
    setFilterState(f);
    // smart folders bring their natural order
    if (f.kind === "starred") setSort("stars");
    else if (f.kind === "recent") setSort("recent");
  };

  const setView = (v: "icons" | "list") => {
    if (v === view) return;
    setViewState(v);
    if (v !== effView) {
      blip("toggle");
      setStagger(true);
      window.clearTimeout(staggerTimer.current);
      staggerTimer.current = window.setTimeout(() => setStagger(false), 700);
    }
  };

  const focusItem = (name: string | undefined) => {
    if (!name) return;
    const el = document.getElementById(itemId(name));
    el?.focus({ preventScroll: true });
    revealItem(el);
  };

  const openQL = (name: string, from: QL["from"] = "item") => {
    const mode = window.matchMedia("(max-width: 767px)").matches ? "sheet" : "panel";
    setSelected(name);
    setQl({ name, mode, from });
  };

  const getOrigin = () => {
    if (!ql) return null;
    if (ql.from === "hero") {
      const hero = document.querySelector<HTMLElement>("[data-hero-origin]");
      if (hero) return hero;
    }
    return document.getElementById(itemId(ql.name))?.querySelector<HTMLElement>("[data-ql-origin]") ?? null;
  };

  const stepQL = (dir: 1 | -1) => {
    if (!ql) return;
    const i = visible.findIndex((r) => r.name === ql.name);
    const next = visible[i < 0 ? 0 : i + dir];
    if (!next || next.name === ql.name) return;
    setSelected(next.name);
    setQl({ ...ql, name: next.name, from: "item" });
    // keep the item it will fold back into on screen behind the panel
    const el = document.getElementById(itemId(next.name));
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 120 && r.bottom <= window.innerHeight - 130) return;
    const to = window.scrollY + r.top - window.innerHeight / 2 + r.height / 2;
    if (lenisRef.current) lenisRef.current.scrollTo(to, { immediate: true, force: true });
    else window.scrollTo({ top: to, behavior: "auto" });
  };

  const applyTag = (tag: string) => {
    setQuery("");
    setFilter({ kind: "tag", value: tag });
  };

  const onPanelClosed = (after?: () => void) => {
    const current = ql;
    setQl(null);
    if (after) after();
    else if (current?.from === "item") requestAnimationFrame(() => focusItem(current.name));
  };

  const onSheetClosed = () => {
    setQl(null);
    const run = afterSheetRef.current;
    afterSheetRef.current = null;
    run?.();
  };

  const value: Work = {
    repos,
    source,
    hydrated,
    phone,
    filter,
    setFilter,
    query,
    setQuery,
    terms,
    view,
    effView,
    setView,
    stagger,
    sort,
    setSort,
    visible,
    widerHits,
    featured,
    showHero,
    stars,
    selected: sel,
    setSelected,
    focusItem,
    ql,
    qlRepo,
    openQL,
    stepQL,
    getOrigin,
    onPanelClosed,
    onSheetClosed,
    afterSheet: (fn) => {
      afterSheetRef.current = fn;
    },
    applyTag,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

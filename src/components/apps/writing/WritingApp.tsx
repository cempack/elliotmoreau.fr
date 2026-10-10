"use client";

import "./writing.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import type { SiteData } from "@/lib/data";
import { AppWindow } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useMedia, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { lenisRef } from "@/lib/lenisRef";
import { PixelGlyph } from "@/components/glyphs";
import { EmptyState } from "./EmptyState";
import { FolderChips, Folders, Newsletter } from "./Folders";
import { PostList } from "./PostList";
import { Reader } from "./Reader";
import { G_LINK } from "./glyphs";
import { useNavStack, type View } from "./useNavStack";
import { BLOG_URL, foldersOf } from "./util";

const PARAM = "p";

function urlWith(slug: string | null) {
  const u = new URL(window.location.href);
  if (slug) u.searchParams.set(PARAM, slug);
  else u.searchParams.delete(PARAM);
  return `${u.pathname}${u.search}${u.hash}`;
}

type HistState = { emWriting?: string } | null;
const histSlug = () => ((window.history.state as HistState)?.emWriting ?? null) as string | null;

/**
 * Writing, as a Notes app. ≥768px: folders (the window sidebar), the post
 * list and a reader side by side; picking a post cross-fades the reader,
 * ↑/↓ (or j/k) walk the list. Phones: an iOS navigation stack, list first,
 * the reader pushed in from the right and swiped back from the left edge
 * (useNavStack). The selected post lives in `?p=` so links and the back
 * button work.
 */
export function WritingApp({ data }: { data: SiteData }) {
  const { t } = useI18n();
  const w = t.writing;
  const reduced = useReduced();
  const compact = useMedia("(max-width: 767px)");
  const { blip } = useSound();

  // dev only: preview the empty and offline states with ?state=empty|offline
  const [devState, setDevState] = useState<"empty" | "offline" | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const s = new URLSearchParams(window.location.search).get("state");
    if (s === "empty" || s === "offline") queueMicrotask(() => setDevState(s));
  }, []);

  const allPosts = useMemo(() => (devState ? [] : data.posts), [devState, data.posts]);
  const source = devState === "offline" ? "none" : devState === "empty" ? "live" : data.sources.posts;
  const folders = useMemo(() => foldersOf(allPosts), [allPosts]);
  const [tag, setTag] = useState<string | null>(null);
  const posts = useMemo(
    () => (tag ? allPosts.filter((p) => p.tags?.some((x) => x.slug === tag)) : allPosts),
    [allPosts, tag]
  );
  const [selected, setSelected] = useState<string | null>(data.posts[0]?.slug ?? null);
  const post = posts.find((p) => p.slug === selected) ?? posts[0] ?? null;
  const folderName = (tag && folders.find((f) => f.slug === tag)?.name) || w.all;
  const [swap, setSwap] = useState({ epoch: 0, animate: true });

  const stackRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const options = useRef(new Map<string, HTMLDivElement>());
  const openedFrom = useRef<string | null>(null);

  const optionRef = useCallback((slug: string, el: HTMLDivElement | null) => {
    if (el) options.current.set(slug, el);
    else options.current.delete(slug);
  }, []);

  const onSettle = useCallback((view: View, fromHistory: boolean) => {
    if (view === "reader") {
      titleRef.current?.focus({ preventScroll: true });
      return;
    }
    // popped by the button or a swipe: rewind our own history entry, or
    // drop ?p= when the reader was opened from a link
    if (!fromHistory) {
      if (histSlug()) window.history.back();
      else window.history.replaceState(null, "", urlWith(null));
    }
    const back = openedFrom.current && options.current.get(openedFrom.current);
    const active = document.activeElement;
    if (back && (!active || active === document.body || readerRef.current?.contains(active))) {
      back.focus({ preventScroll: true });
    }
  }, []);

  const stack = useNavStack({ enabled: compact, reduced, stackRef, navRef, onSettle });

  // keep the window's scroll position honest across our own history entries
  useEffect(() => {
    if (!compact) return;
    const h = window.history;
    const prev = h.scrollRestoration;
    h.scrollRestoration = "manual";
    return () => {
      h.scrollRestoration = prev;
    };
  }, [compact]);

  /** desktop: bring the top of the reader back into view after a switch */
  const revealReader = useCallback(
    (instant = false) => {
      const el = readerRef.current;
      const nav = navRef.current;
      if (!el) return;
      const stick = nav ? parseFloat(getComputedStyle(nav).top) || 0 : 0;
      const top = el.getBoundingClientRect().top;
      if (top >= stick - 1) return;
      const y = Math.max(0, window.scrollY + top - stick);
      const l = lenisRef.current;
      if (l && !reduced && !instant) l.scrollTo(y, { duration: 0.7 });
      else if (l) l.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo({ top: y, behavior: "instant" });
    },
    [reduced]
  );

  const select = useCallback(
    (slug: string, opts: { animate?: boolean; url?: boolean } = {}) => {
      const animate = opts.animate ?? true;
      setSelected(slug);
      setSwap((s) => (animate ? (s.animate ? s : { ...s, animate: true }) : { epoch: s.epoch + 1, animate: false }));
      if (opts.url !== false) {
        const own = histSlug();
        window.history.replaceState(own ? { emWriting: slug } : null, "", urlWith(slug));
      }
    },
    []
  );

  const focusOption = (slug: string) => {
    const el = options.current.get(slug);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: "instant" });
  };

  /** step through the visible list (↑/↓, j/k, Home/End) */
  const step = (to: "next" | "prev" | "first" | "last") => {
    if (!posts.length) return null;
    const i = Math.max(0, posts.findIndex((p) => p.slug === post?.slug));
    const n = to === "next" ? Math.min(posts.length - 1, i + 1) : to === "prev" ? Math.max(0, i - 1) : to === "first" ? 0 : posts.length - 1;
    const next = posts[n];
    if (next.slug !== post?.slug) {
      select(next.slug);
      blip("tick");
      if (!compact) revealReader();
    }
    return next.slug;
  };

  const open = (slug: string) => {
    openedFrom.current = slug;
    const same = slug === post?.slug;
    select(slug, { animate: false, url: false });
    if (!same || stack.view === "list") {
      window.history.pushState({ emWriting: slug }, "", urlWith(slug));
    }
    stack.push();
    blip("open");
  };

  const onPress = (slug: string, via: "pointer" | "click") => {
    if (compact) {
      if (via === "click") open(slug);
      return;
    }
    if (slug === post?.slug) return;
    select(slug);
    blip("tick");
    revealReader();
  };

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map: Record<string, "next" | "prev" | "first" | "last"> = {
      ArrowDown: "next",
      j: "next",
      ArrowUp: "prev",
      k: "prev",
      Home: "first",
      End: "last",
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      const slug = step(dir);
      if (slug) focusOption(slug);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && post) {
      e.preventDefault();
      if (compact) open(post.slug);
      else titleRef.current?.focus();
    }
  };

  // ↑/↓ work from anywhere on desktop while nothing else has focus;
  // Esc pops the reader on phones
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (compact) {
        if (e.key === "Escape" && stack.view === "reader") {
          e.preventDefault();
          stack.pop();
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const idle = !target || target === document.body || target === document.documentElement;
      if (!idle) return;
      const dir = ({ ArrowDown: "next", j: "next", ArrowUp: "prev", k: "prev" } as const)[e.key as "j"];
      if (!dir) return;
      e.preventDefault();
      const slug = step(dir);
      if (slug) focusOption(slug);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // deep link on load: ?p=slug selects it (and opens it on phones)
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current) return;
    linked.current = true;
    const slug = new URLSearchParams(window.location.search).get(PARAM);
    if (!slug || !data.posts.some((p) => p.slug === slug)) return;
    queueMicrotask(() => {
      select(slug, { animate: false, url: false });
      if (window.matchMedia("(max-width: 767px)").matches) {
        openedFrom.current = slug;
        stack.jump("reader");
      }
    });
  }, [data.posts, select, stack]);

  // back / forward through our own entries
  const popRef = useRef<() => void>(() => {});
  useEffect(() => {
    popRef.current = () => {
      const own = histSlug();
      if (compact) {
        if (own && data.posts.some((p) => p.slug === own)) {
          if (stack.view === "list") {
            openedFrom.current = own;
            select(own, { animate: false, url: false });
            stack.push();
          }
        } else if (stack.view === "reader") {
          stack.pop({ fromHistory: true });
        }
        return;
      }
      const slug = new URLSearchParams(window.location.search).get(PARAM);
      if (slug && slug !== post?.slug && posts.some((p) => p.slug === slug)) select(slug, { url: false });
    };
  });
  useEffect(() => {
    const onPop = () => popRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const pickFolder = (slug: string | null) => {
    if (slug === tag) return;
    setTag(slug);
    blip("tick");
    const next = slug ? allPosts.filter((p) => p.tags?.some((x) => x.slug === slug)) : allPosts;
    if (next.length && !next.some((p) => p.slug === post?.slug)) select(next[0].slug);
  };

  const filterByTag = (slug: string) => {
    pickFolder(slug);
    if (compact) stack.pop();
  };

  const toolbar = (
    <a href={BLOG_URL} target="_blank" rel="noopener" className="app-writing-tool" aria-label={w.openBlog}>
      <span className="app-writing-tool-label">blog.elliotmoreau.fr</span>
      <PixelGlyph cells={G_LINK} size={10} className="app-writing-tool-glyph" />
    </a>
  );

  /* ── no posts at all: one calm state instead of three empty panes ── */
  if (!allPosts.length) {
    const offline = source === "none";
    return (
      <AppWindow app="writing" toolbar={toolbar}>
        <div className="app-writing app-writing--empty">
          <EmptyState
            seed={offline ? "offline-blog" : "first-post"}
            tone={offline ? "offline" : "calm"}
            title={offline ? w.offlineTitle : w.noneTitle}
            body={offline ? w.offlineBody : w.noneBody}
            action={{ label: w.visitBlog, href: BLOG_URL }}
          />
        </div>
      </AppWindow>
    );
  }

  const sidebar = <Folders folders={folders} active={tag} total={allPosts.length} onPick={pickFolder} />;
  const folderProps = { folders, active: tag, total: allPosts.length, onPick: pickFolder };
  const live = compact && stack.moving;

  return (
    <AppWindow app="writing" toolbar={toolbar} sidebar={sidebar}>
      <div className="app-writing">
        <div ref={stackRef} className="app-writing-stack" data-view={stack.view} data-moving={stack.moving || undefined}>
          <m.div
            className="app-writing-pane app-writing-pane--list"
            style={compact ? { x: stack.listX, clipPath: live ? stack.listClip : undefined } : undefined}
            data-lenis-prevent
          >
            <FolderChips {...folderProps} />
            {posts.length ? (
              <PostList
                posts={posts}
                selected={post?.slug ?? null}
                title={folderName}
                source={source}
                onPress={onPress}
                onKeyDown={onListKey}
                optionRef={optionRef}
                footer={<Newsletter className="app-writing-news--list" />}
              />
            ) : (
              <EmptyState
                seed={`folder-${tag}`}
                title={w.folderEmptyTitle}
                body={w.folderEmptyBody}
                action={{ label: w.folderEmptyCta, onClick: () => pickFolder(null) }}
              />
            )}
            {live && <m.span className="app-writing-shade" style={{ opacity: stack.shade }} aria-hidden />}
          </m.div>

          <m.div
            ref={readerRef}
            className="app-writing-pane app-writing-pane--reader"
            style={compact ? { x: stack.x } : undefined}
            {...(compact ? stack.bind : {})}
          >
            {live && <span className="app-writing-edge" aria-hidden />}
            {post && (
              <Reader
                post={post}
                posts={posts}
                epoch={swap.epoch}
                animatePlate={swap.animate}
                reduced={reduced}
                folderName={folderName}
                onPick={(slug) => {
                  select(slug);
                  blip("tick");
                  revealReader(compact);
                }}
                onFilter={filterByTag}
                onBack={() => stack.pop()}
                titleRef={titleRef}
                navRef={navRef}
              />
            )}
          </m.div>
        </div>
      </div>
    </AppWindow>
  );
}

"use client";

import "./writing.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { m } from "motion/react";
import { useRouter } from "next/navigation";
import { AppWindow } from "@/components/os/AppWindow";
import { InlineScript } from "@/components/InlineScript";
import { useI18n } from "@/i18n/client";
import { useHydrated, useMedia, useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { scrollToY, scrollTop, scrollerTop } from "@/lib/scroller";
import { PixelGlyph } from "@/components/glyphs";
import { EmptyState } from "./EmptyState";
import { FolderChips, FolderColumn, Newsletter } from "./Folders";
import { PostList } from "./PostList";
import { Shelf } from "./Shelf";
import { Reader } from "./Reader";
import { G_LINK } from "./glyphs";
import { useNavStack, type Settle, type View } from "./useNavStack";
import { usePageSwipe, type Dir } from "./usePageSwipe";
import { BLOG_URL, dateLong, fmt, foldersOf } from "./util";
import { openBook, type BookFrom } from "./openBook";
import { useSiteData } from "@/components/os/SiteData";

const PARAM = "p";
/** set on <html> before hydration while a deep link waits for the client */
const PENDING = "data-writing-link";

function urlWith(slug: string | null) {
  const u = new URL(window.location.href);
  if (slug) u.searchParams.set(PARAM, slug);
  else u.searchParams.delete(PARAM);
  return `${u.pathname}${u.search}${u.hash}`;
}

type HistState = { emWriting?: string } | null;
const histSlug = () => ((window.history.state as HistState)?.emWriting ?? null) as string | null;
const urlSlug = () => new URLSearchParams(window.location.search).get(PARAM);
const noSubscribe = () => () => {};

/** history writes re-render Next's router tree: keep them off busy frames */
function whenIdle(fn: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 500 });
  else window.setTimeout(fn, 0);
}

/**
 * Writing, as a Notes app. ≥1280px: folders, the post list and a reader
 * side by side; 768–1279: list (folders as chips) and reader. Picking a
 * post dissolves the plate and raises the new title; ↑/↓ (or j/k) walk the
 * list, and ←/→, the pager or a two-finger swipe turn the reader's page
 * (usePageSwipe). Phones: an iOS navigation stack, list first, the reader
 * pushed in from the right and swiped back from the left edge
 * (useNavStack). The selected post lives in `?p=` so links and the back
 * button work.
 *
 * `initialSlug` (optional): the page's `?p=`, when the server knows it, so
 * a deep link renders the right post (and, on phones, the reader) before
 * hydration. Without it a tiny pre-paint script hides the reader copy
 * until the client has caught up.
 */
const OPENED_KEY = "em-read";

export function WritingApp({ initialSlug = null }: { initialSlug?: string | null } = {}) {
  const data = useSiteData();
  const { t, path } = useI18n();
  const w = t.writing;
  const reduced = useReduced();
  const compact = useMedia("(max-width: 767px)");
  const hydrated = useHydrated();
  const { blip } = useSound();
  const router = useRouter();

  // dev only: preview the empty and offline states with ?state=empty|offline
  const [devState, setDevState] = useState<"empty" | "offline" | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const s = new URLSearchParams(window.location.search).get("state");
    if (s === "empty" || s === "offline") queueMicrotask(() => setDevState(s));
  }, []);

  const allPosts = useMemo(() => (devState ? [] : data.posts), [devState, data.posts]);
  const known = useCallback((slug: string | null | undefined): slug is string => !!slug && data.posts.some((p) => p.slug === slug), [data.posts]);
  const serverSlug = known(initialSlug) ? initialSlug : null;
  // the deep link: what the server knew during hydration, the URL after
  const linkSlug = useSyncExternalStore(
    noSubscribe,
    () => {
      const s = urlSlug();
      return known(s) ? s : serverSlug;
    },
    () => serverSlug
  );
  const source = devState === "offline" ? "none" : devState === "empty" ? "live" : data.sources.posts;
  const folders = useMemo(() => foldersOf(allPosts), [allPosts]);
  const [tag, setTag] = useState<string | null>(null);
  const posts = useMemo(
    () => (tag ? allPosts.filter((p) => p.tags?.some((x) => x.slug === tag)) : allPosts),
    [allPosts, tag]
  );
  const visibleSlugs = useMemo(() => new Set(posts.map((p) => p.slug)), [posts]);
  const [picked, setPicked] = useState<string | null>(null);
  // with nothing picked or linked, the reader opens on the post pinned in
  // the admin panel (Live data), else the latest
  const pinned = known(data.live.pinnedPost) ? data.live.pinnedPost : null;
  const selected = picked ?? linkSlug ?? pinned ?? data.posts[0]?.slug ?? null;
  const post = posts.find((p) => p.slug === selected) ?? posts[0] ?? null;
  const index = post ? posts.findIndex((p) => p.slug === post.slug) : -1;
  const folderName = (tag && folders.find((f) => f.slug === tag)?.name) || w.all;
  const [swap, setSwap] = useState({ epoch: 0, animate: false });

  const stackRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const options = useRef(new Map<string, HTMLElement>());
  const openedFrom = useRef<string | null>(null);
  /** a pushed reader's history entry, written once the push has landed */
  const pendingEntry = useRef<string | null>(null);

  // the URL follows the selection once it settles (every history write
  // re-renders the router tree, so a run of ↓ presses writes it once)
  const urlTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(urlTimer.current), []);

  const optionRef = useCallback((slug: string, el: HTMLElement | null) => {
    if (el) options.current.set(slug, el);
    else options.current.delete(slug);
  }, []);

  const focusTitle = useCallback(() => {
    readerRef.current?.querySelector<HTMLElement>(".app-writing-title")?.focus({ preventScroll: true });
  }, []);

  const onSettle = useCallback(
    (view: View, fromHistory: boolean, how: Settle) => {
      if (view === "reader") {
        // the push has landed: now it may cost the router a render
        const entry = pendingEntry.current;
        if (entry) {
          pendingEntry.current = null;
          window.clearTimeout(urlTimer.current);
          window.history.pushState({ emWriting: entry }, "", urlWith(entry));
        }
        const active = document.activeElement;
        if (how === "push" || !active || active === document.body || !readerRef.current?.contains(active)) focusTitle();
        return;
      }
      blip("close");
      const never = pendingEntry.current; // popped before the push landed
      pendingEntry.current = null;
      // popped by the button or a swipe: rewind our own history entry, or
      // drop ?p= when the reader was opened from a link
      window.clearTimeout(urlTimer.current);
      if (!fromHistory && !never) {
        if (histSlug()) window.history.back();
        else if (urlSlug()) window.history.replaceState(null, "", urlWith(null));
      }
      const back = openedFrom.current && options.current.get(openedFrom.current);
      const active = document.activeElement;
      if (back && (!active || active === document.body || readerRef.current?.contains(active))) {
        back.focus({ preventScroll: true });
      }
    },
    [blip, focusTitle]
  );

  const stack = useNavStack({
    enabled: compact,
    reduced,
    // a soft navigation to a deep link knows the URL and the width at once
    initialView: serverSlug || (hydrated && linkSlug && compact) ? "reader" : "list",
    stackRef,
    probeRef,
    onSettle,
  });

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
      const probe = probeRef.current;
      if (!el) return;
      const stick = probe ? parseFloat(getComputedStyle(probe).top) || 0 : 0;
      const top = el.getBoundingClientRect().top - scrollerTop();
      if (top >= stick - 1) return;
      scrollToY(scrollTop() + top - stick, !reduced && !instant);
    },
    [reduced]
  );

  // posts this visitor has opened: a ribbon on the shelf (kept on their device only)
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const v = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "[]");
        if (Array.isArray(v)) setOpened(new Set(v.filter((x): x is string => typeof x === "string")));
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const markOpened = useCallback((slug: string) => {
    setOpened((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev).add(slug);
      try {
        localStorage.setItem(OPENED_KEY, JSON.stringify([...next].slice(-60)));
      } catch {}
      return next;
    });
  }, []);

  const select = useCallback(
    (slug: string, opts: { animate?: boolean; url?: boolean } = {}) => {
      const animate = opts.animate ?? true;
      setPicked(slug);
      markOpened(slug);
      setSwap((s) => (animate ? (s.animate ? s : { ...s, animate: true }) : { epoch: s.epoch + 1, animate: false }));
      window.clearTimeout(urlTimer.current);
      if (opts.url !== false) {
        urlTimer.current = window.setTimeout(
          () =>
            whenIdle(() => {
              const own = histSlug();
              window.history.replaceState(own ? { emWriting: slug } : null, "", urlWith(slug));
            }),
          600
        );
      }
    },
    [markOpened]
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
    const i = Math.max(0, index);
    const n = to === "next" ? Math.min(posts.length - 1, i + 1) : to === "prev" ? Math.max(0, i - 1) : to === "first" ? 0 : posts.length - 1;
    const next = posts[n];
    if (next.slug !== post?.slug) {
      select(next.slug);
      blip("tick");
      if (!compact) revealReader();
    }
    return next.slug;
  };

  // turning the reader's page: older (1) / newer (-1), by swipe, ←/→ or the pager
  const turnTo = (dir: Dir) => posts[index + dir] ?? null;
  const swipe = usePageSwipe({
    enabled: !compact && !reduced && !!post,
    reduced,
    paneRef: readerRef,
    can: (dir) => !!turnTo(dir),
    onTurn: (dir) => {
      const next = turnTo(dir);
      if (!next) return;
      select(next.slug);
      blip("select");
      revealReader();
      // turned from the list (←/→ there): focus follows the selection
      if ((document.activeElement as HTMLElement | null)?.closest?.("[role='listbox']")) focusOption(next.slug);
    },
    onArm: (dir) => {
      if (dir) blip("tick");
    },
  });

  const go = (dir: Dir) => {
    if (compact) {
      const next = turnTo(dir);
      if (!next) return;
      select(next.slug);
      blip("tick");
      revealReader(true);
      return;
    }
    swipe.go(dir);
  };

  const open = (slug: string) => {
    if (stack.view !== "list" || stack.moving) return;
    openedFrom.current = slug;
    if (slug !== post?.slug) select(slug, { animate: false, url: false });
    pendingEntry.current = slug;
    stack.push();
    blip("open");
  };

  /** a finger came down on a row: render the reader while it is pressed */
  const prime = (slug: string) => {
    if (!compact || stack.view !== "list" || stack.moving || slug === post?.slug || slug === picked) return;
    select(slug, { animate: false, url: false });
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

  const onListKey = (e: React.KeyboardEvent<HTMLElement>) => {
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
      focusTitle();
    }
  };

  // desktop, while nothing else has focus (or the reader does): ↑/↓ walk
  // the list, ←/→ turn the page. Phones: Esc pops the reader
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (compact) {
        const inDialog = (e.target as Element | null)?.closest?.("dialog,[role='dialog']");
        if (e.key === "Escape" && stack.view === "reader" && !inDialog) {
          e.preventDefault();
          stack.pop();
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const idle = !target || target === document.body || target === document.documentElement;
      const inReader = !!target && !!readerRef.current?.contains(target) && !target.closest("input,textarea,select,[contenteditable]");
      const inList = !!target?.closest?.("[role='listbox']");
      if (!idle && !inReader && !inList) return;
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && (idle || inReader || inList)) {
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (inList) return; // the listbox handles ↑/↓ itself
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

  // deep link on load: ?p=slug is selected (linkSlug) and opens the
  // reader on phones; then the pre-paint guard comes off
  const { jump } = stack;
  useEffect(() => {
    const slug = urlSlug();
    if (known(slug) && slug !== serverSlug) {
      // the linked post replaces the hydrated one in place: no exit, no rise
      queueMicrotask(() => setSwap((s) => ({ epoch: s.epoch + 1, animate: false })));
    }
    if (known(slug) && window.matchMedia("(max-width: 767px)").matches) {
      openedFrom.current = slug;
      queueMicrotask(() => jump("reader"));
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => document.documentElement.removeAttribute(PENDING));
    });
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.removeAttribute(PENDING);
    };
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const slug = urlSlug();
      if (slug && slug !== post?.slug && posts.some((p) => p.slug === slug)) select(slug, { url: false });
    };
  });
  useEffect(() => {
    const onPop = () => popRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** a book off the shelf: it opens where it stood, onto the post */
  const openFromShelf = (slug: string, from: BookFrom | null) => {
    const p = data.posts.find((x) => x.slug === slug);
    if (!p) return;
    const href = path(`/writing/${slug}`);
    markOpened(slug);
    router.prefetch(href);
    const area = stackRef.current?.closest<HTMLElement>(".os-win-main") ?? stackRef.current;
    if (reduced || !from || !area) {
      blip("open");
      router.push(href);
      return;
    }
    openBook({
      post: p,
      from,
      bounds: area.getBoundingClientRect(),
      meta: `${dateLong(w, p.published_at)}\n${fmt(w.minRead, { n: Math.max(1, p.reading_time || 1) })}`,
      navigate: () => router.push(href),
      ready: () => !!document.querySelector(`.app-writing-article[data-slug="${CSS.escape(slug)}"]`),
      onTurn: () => blip("open"),
    });
  };

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

  const hrefFor = useCallback((slug: string) => `${path("/writing")}?${PARAM}=${encodeURIComponent(slug)}`, [path]);

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
          >
            {!offline && <Newsletter className="app-writing-news--empty" />}
          </EmptyState>
        </div>
      </AppWindow>
    );
  }

  const folderProps = { folders, active: tag, total: allPosts.length, onPick: pickFolder };
  const live = compact && stack.moving;
  // before hydration: a deep link the server didn't know hides the reader
  // copy (and on phones shows the reader screen) until the client lands
  const guard = serverSlug
    ? null
    : `try{var p=new URLSearchParams(location.search).get("p");if(p&&${JSON.stringify(data.posts.map((p) => p.slug)).replace(/</g, "\\u003c")}.indexOf(p)>-1)document.documentElement.setAttribute("${PENDING}","")}catch(e){}`;

  return (
    <AppWindow app="writing" toolbar={toolbar}>
      <div className="app-writing">
        {guard && <InlineScript html={guard} />}
        <div ref={stackRef} className="app-writing-stack" data-view={stack.view} data-moving={stack.moving || undefined}>
          {/* its computed `top` is the sticky line under the title bar, in px */}
          <span ref={probeRef} className="app-writing-probe" aria-hidden />
          <FolderColumn {...folderProps} />
          <m.div
            layoutScroll
            className="app-writing-pane app-writing-pane--list"
            style={compact ? { x: stack.listX, clipPath: stack.listClip } : undefined}
            data-lenis-prevent={compact ? undefined : ""}
          >
            {posts.length ? (
              <PostList
                posts={posts}
                selected={post?.slug ?? null}
                title={folderName}
                source={source}
                compact={compact}
                hrefFor={hrefFor}
                onPress={onPress}
                onPrime={prime}
                onKeyDown={onListKey}
                optionRef={optionRef}
                shelf={
                  <Shelf
                    posts={allPosts}
                    visible={visibleSlugs}
                    selected={compact ? null : (post?.slug ?? null)}
                    opened={opened}
                    onPick={openFromShelf}
                    label={(p) => p.title}
                  />
                }
                chips={<FolderChips {...folderProps} />}
                footer={<Newsletter className="app-writing-news--list" />}
              />
            ) : (
              <>
                <FolderChips {...folderProps} />
                <EmptyState
                  seed={`folder-${tag}`}
                  title={w.folderEmptyTitle}
                  body={w.folderEmptyBody}
                  action={{ label: w.folderEmptyCta, onClick: () => pickFolder(null) }}
                />
              </>
            )}
            {live && <m.span className="app-writing-shade" style={{ opacity: stack.shade }} aria-hidden />}
          </m.div>

          <m.div
            ref={readerRef}
            className="app-writing-pane app-writing-pane--reader"
            style={compact ? { x: stack.x } : undefined}
            {...(compact ? stack.bind : swipe.bind)}
          >
            {live && <span className="app-writing-edge" aria-hidden />}
            {post && (
              <Reader
                post={post}
                posts={posts}
                epoch={swap.epoch}
                animatePlate={swap.animate}
                reduced={reduced}
                compact={compact}
                folderName={folderName}
                swipe={compact || reduced ? null : swipe}
                travel={compact ? stack.travel : undefined}
                onGo={go}
                onFilter={filterByTag}
                onBack={() => stack.pop()}
              />
            )}
          </m.div>
        </div>
      </div>
    </AppWindow>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m, useMotionValue, useMotionValueEvent, useSpring, useTransform, type MotionValue, type Variants } from "motion/react";
import type { GhostPost } from "@/lib/ghost";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { spring, springFrom } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { PixelGlyph } from "@/components/glyphs";
import { Monogram } from "@/components/Monogram";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";
import { Plate } from "./Plate";
import { SubscribeForm } from "./SubscribeForm";
import { MAX_SHIFT } from "./plate";
import { G_BACK, G_COPY, G_MAIL, G_RSS } from "./glyphs";
import type { Dir } from "./usePageSwipe";
import { RSS_URL, dateLong, fmt, primaryTag } from "./util";

/* the outgoing copy steps aside fast; the incoming title rises word by
   word out of its own line box, the rest settles in after it */
const RISE = springFrom(0.42);
const copyV: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.018 } },
  exit: { opacity: 0, transition: { duration: 0.08, ease: [0.4, 0, 1, 1] } },
};
const wordV: Variants = {
  hidden: { y: "115%" },
  shown: { y: "0%", transition: RISE },
};
const fadeV: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { ...spring.default, delay: 0.08 } },
};
const calmCopyV: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
const noneV: Variants = { hidden: {}, shown: {} };

/** the page-turn gesture's handles (desktop and tablets) */
export type Swipe = {
  x: MotionValue<number>;
  fade: MotionValue<number>;
  hint: MotionValue<number>;
  drift: MotionValue<number>;
};

type Props = {
  post: GhostPost;
  /** the visible list, newest first, for older/newer */
  posts: GhostPost[];
  /** a new epoch swaps the copy instantly (pushes, deep links) */
  epoch: number;
  /** dissolve the plate between posts */
  animatePlate: boolean;
  reduced: boolean;
  /** phones: the reader is a pushed screen with its own nav bar */
  compact: boolean;
  folderName: string;
  swipe: Swipe | null;
  /** phones: how far the pushed reader is off its rest, 0..1 */
  travel?: MotionValue<number>;
  /** turn to the older (1) or newer (-1) post */
  onGo: (dir: Dir) => void;
  onFilter: (tag: string) => void;
  onBack: () => void;
};

export function Reader({ post, posts, epoch, animatePlate, reduced, compact, folderName, swipe, travel, onGo, onFilter, onBack }: Props) {
  const { t, lang } = useI18n();
  const w = t.writing;
  const hydrated = useHydrated();
  const { notify } = useToast();
  const { blip } = useSound();
  const id = useId();
  const tag = primaryTag(post);
  const i = posts.findIndex((p) => p.slug === post.slug);
  const newer = i > 0 ? posts[i - 1] : null;
  const older = i >= 0 && i < posts.length - 1 ? posts[i + 1] : null;
  const words = post.title.split(/\s+/).filter(Boolean);
  const cv = reduced ? calmCopyV : copyV;
  const wv = reduced ? noneV : wordV;
  const fv = reduced ? noneV : fadeV;

  // the plate's world leans with the pointer (whole cells, a soft spring),
  // with a page being turned, and on phones lags behind a sliding screen:
  // near hills move more than far ones, so the plate has depth
  const lookTarget = useMotionValue(0);
  const look = useSpring(lookTarget, { stiffness: 120, damping: 22 });
  const zero = useMotionValue(0);
  const drift = swipe?.drift ?? zero;
  const slide = travel ?? zero;
  const shift = useTransform(() => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, -(look.get() + drift.get() + slide.get() * 1.6))));
  const leans = !compact && !reduced;
  const onLook = (e: React.PointerEvent<HTMLElement>) => {
    if (!leans || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    lookTarget.set(Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2))));
  };
  useEffect(() => {
    if (!leans) lookTarget.set(0);
  }, [leans, lookTarget]);

  // phones: the nav bar gains a material once the copy scrolls under it,
  // and the post's title once its large title has gone (iOS scroll edge)
  const navRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const titleEl = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    const bar = navRef.current;
    const edge = edgeRef.current;
    if (!compact || !bar || !edge) return;
    const observe = () => {
      ioRef.current?.disconnect();
      const line = Math.round((parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight);
      const io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            const past = !en.isIntersecting && en.boundingClientRect.top < line;
            const key = en.target === edge ? "stuck" : "titled";
            if (past) bar.dataset[key] = "";
            else delete bar.dataset[key];
          }
        },
        { rootMargin: `${-line}px 0px 0px 0px`, threshold: 0 }
      );
      io.observe(edge);
      if (titleEl.current) io.observe(titleEl.current);
      ioRef.current = io;
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      ioRef.current?.disconnect();
      ioRef.current = null;
      window.removeEventListener("resize", observe);
      delete bar.dataset.stuck;
      delete bar.dataset.titled;
    };
  }, [compact]);
  // each post's title is a new element: watch whichever is on the page
  const titleRef = useCallback((el: HTMLHeadingElement | null) => {
    if (titleEl.current && titleEl.current !== el) ioRef.current?.unobserve(titleEl.current);
    titleEl.current = el;
    if (el) ioRef.current?.observe(el);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post.url);
      notify(w.copied, t.shell.apps.writing);
      blip("success");
    } catch {
      notify(w.copyFailed, t.shell.apps.writing);
    }
  };

  const turnStyle = swipe ? { x: swipe.x, opacity: swipe.fade } : undefined;

  return (
    <article className="app-writing-reader" aria-labelledby={`${id}-title`} onPointerMove={onLook} onPointerLeave={() => lookTarget.set(0)}>
      <div ref={navRef} className="app-writing-navbar">
        <button type="button" className="app-writing-back" onClick={onBack} aria-label={fmt(w.back, { folder: folderName })}>
          <PixelGlyph cells={G_BACK} size={14} />
          <span className="app-writing-back-label">{folderName}</span>
        </button>
        <span className="app-writing-navtitle" aria-hidden>
          {post.title}
        </span>
        <button type="button" className="app-writing-navbtn" onClick={copy} aria-label={w.copyLink}>
          <PixelGlyph cells={G_COPY} size={14} />
        </button>
      </div>

      {swipe && (
        <div className="app-writing-turns" aria-hidden>
          <TurnHint side={-1} target={newer} hint={swipe.hint} />
          <TurnHint side={1} target={older} hint={swipe.hint} />
        </div>
      )}

      <Plate post={post} animate={animatePlate && !reduced} shift={reduced ? undefined : shift} />
      <span ref={edgeRef} className="app-writing-sentinel" aria-hidden />

      <m.div className="app-writing-turn" style={turnStyle}>
        <AnimatePresence key={epoch} mode="wait" initial={false}>
          <m.div key={post.slug} className="app-writing-copy" variants={cv} initial="hidden" animate="shown" exit="exit">
            <m.p className="app-writing-meta tabular" variants={fv}>
              {tag && (
                <button type="button" className="app-writing-tag" onClick={() => onFilter(tag.slug)}>
                  {tag.name}
                </button>
              )}
              <time dateTime={post.published_at}>{dateLong(w, post.published_at)}</time>
              <span className="app-writing-dot" aria-hidden />
              <span>{fmt(w.minRead, { n: post.reading_time })}</span>
            </m.p>

            <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1} className="app-writing-title" aria-label={post.title}>
              {words.map((word, k) => (
                <span key={`${k}-${word}`} aria-hidden>
                  <span className="app-writing-w">
                    <m.span className="app-writing-wi" variants={wv}>
                      {word}
                    </m.span>
                  </span>
                  {k < words.length - 1 ? " " : null}
                </span>
              ))}
            </h2>

            {post.excerpt && (
              <m.p className="app-writing-dek" variants={fv}>
                {post.excerpt}
              </m.p>
            )}

            <m.div className="app-writing-byline" variants={fv}>
              <span className="app-writing-author">
                <span className="app-writing-avatar" aria-hidden>
                  <Monogram text="elliot-moreau" className="app-writing-avatar-px" />
                </span>
                <span className="app-writing-author-text">
                  <span className="app-writing-author-name">{w.author}</span>
                  <span className="app-writing-author-sub">
                    {hydrated ? timeAgo(post.published_at, lang) : dateLong(w, post.published_at)}
                  </span>
                </span>
              </span>
              <span className="app-writing-ctas">
                <PressAnchor
                  href={post.url}
                  target="_blank"
                  rel="noopener"
                  className="app-writing-cta"
                  aria-label={fmt(w.readOnBlogLabel, { title: post.title })}
                  data-cursor={w.cursorRead}
                >
                  {w.readOnBlog}
                  <span aria-hidden className="app-writing-cta-arrow">
                    ↗
                  </span>
                </PressAnchor>
                <PressButton className="app-writing-iconbtn" onClick={copy} aria-label={w.copyLink} data-cursor={w.copyLink}>
                  <PixelGlyph cells={G_COPY} size={14} />
                </PressButton>
              </span>
            </m.div>
          </m.div>
        </AnimatePresence>
      </m.div>

      <aside className="app-writing-member" aria-labelledby={`${id}-member`}>
        <span className="app-writing-member-art" aria-hidden>
          <PixelGlyph cells={G_MAIL} size={28} />
        </span>
        <div className="app-writing-member-text">
          <p className="app-writing-member-k">{w.memberKicker}</p>
          <h3 id={`${id}-member`} className="app-writing-member-title">
            {w.memberTitle}
          </h3>
          <p className="app-writing-member-body">{w.memberBody}</p>
        </div>
        <div className="app-writing-member-form">
          <SubscribeForm />
          <a href={RSS_URL} target="_blank" rel="noopener" className="app-writing-member-alt">
            <PixelGlyph cells={G_RSS} size={12} />
            {w.memberRss}
            <span aria-hidden>↗</span>
          </a>
        </div>
      </aside>

      {(older || newer) && (
        <m.nav className="app-writing-pager" aria-label={w.more} style={turnStyle}>
          {newer ? (
            <button type="button" className="app-writing-page app-writing-page--newer" onClick={() => onGo(-1)}>
              <span className="app-writing-page-k">
                <span aria-hidden>←</span> {w.newer}
              </span>
              <span className="app-writing-page-t">{newer.title}</span>
            </button>
          ) : null}
          {older ? (
            <button type="button" className="app-writing-page app-writing-page--older" onClick={() => onGo(1)}>
              <span className="app-writing-page-k">
                {w.older} <span aria-hidden>→</span>
              </span>
              <span className="app-writing-page-t">{older.title}</span>
            </button>
          ) : null}
        </m.nav>
      )}
    </article>
  );
}

/** The edge a page is being turned towards: where it goes, lit once a
    release would get there. */
function TurnHint({ side, target, hint }: { side: Dir; target: GhostPost | null; hint: MotionValue<number> }) {
  const { t } = useI18n();
  const w = t.writing;
  const [armed, setArmed] = useState(false);
  const p = useTransform(hint, (v) => Math.max(0, side * v));
  const opacity = useTransform(p, [0.06, 0.5], [0, 1]);
  const x = useTransform(p, (v) => side * (1 - Math.min(1, v)) * 28);
  useMotionValueEvent(p, "change", (v) => {
    const next = !!target && v >= 1;
    if (next !== armed) setArmed(next);
  });
  return (
    <m.div className="app-writing-turnhint" data-side={side === 1 ? "older" : "newer"} data-armed={armed || undefined} data-end={!target || undefined} style={{ opacity, x }}>
      <span className="app-writing-turnhint-disc">{target ? (side === 1 ? "→" : "←") : "|"}</span>
      {target && (
        <span className="app-writing-turnhint-text">
          <span className="app-writing-turnhint-k">{side === 1 ? w.older : w.newer}</span>
          <span className="app-writing-turnhint-t">{target.title}</span>
        </span>
      )}
    </m.div>
  );
}

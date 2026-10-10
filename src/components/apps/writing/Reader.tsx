"use client";

import { useId } from "react";
import { AnimatePresence, m, type Variants } from "motion/react";
import type { GhostPost } from "@/lib/ghost";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { PixelGlyph } from "@/components/glyphs";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";
import { Plate } from "./Plate";
import { G_BACK, G_COPY, G_MAIL } from "./glyphs";
import { SIGNUP_URL, dateLong, fmt, primaryTag } from "./util";

/* the outgoing copy steps aside fast; the incoming title rises word by
   word out of its own line box, the rest settles in after it */
const copyV: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.026, delayChildren: 0.01 } },
  exit: { opacity: 0, transition: { duration: 0.09, ease: [0.4, 0, 1, 1] } },
};
const wordV: Variants = {
  hidden: { y: "112%" },
  shown: { y: "0%", transition: spring.gentle },
};
const fadeV: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { ...spring.gentle, delay: 0.1 } },
};
const calmCopyV: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
const noneV: Variants = { hidden: {}, shown: {} };

type Props = {
  post: GhostPost;
  /** the visible list, newest first, for older/newer */
  posts: GhostPost[];
  /** a new epoch swaps the copy instantly (pushes, deep links) */
  epoch: number;
  /** dissolve the plate between posts */
  animatePlate: boolean;
  reduced: boolean;
  folderName: string;
  onPick: (slug: string) => void;
  onFilter: (tag: string) => void;
  onBack: () => void;
  titleRef: React.Ref<HTMLHeadingElement>;
  navRef: React.Ref<HTMLDivElement>;
};

export function Reader({ post, posts, epoch, animatePlate, reduced, folderName, onPick, onFilter, onBack, titleRef, navRef }: Props) {
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post.url);
      notify(w.copied, t.shell.apps.writing);
      blip("success");
    } catch {
      notify(w.copyFailed, t.shell.apps.writing);
    }
  };

  return (
    <article className="app-writing-reader" aria-labelledby={`${id}-title`}>
      <div ref={navRef} className="app-writing-navbar">
        <button type="button" className="app-writing-back" onClick={onBack} aria-label={fmt(w.back, { folder: folderName })}>
          <PixelGlyph cells={G_BACK} size={14} />
          <span className="app-writing-back-label">{folderName}</span>
        </button>
        <button type="button" className="app-writing-navbtn" onClick={copy} aria-label={w.copyLink}>
          <PixelGlyph cells={G_COPY} size={14} />
        </button>
      </div>

      <Plate post={post} animate={animatePlate && !reduced} />

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
                <PixelPlanet seed="elliot-moreau" className="app-writing-avatar-px" />
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
              <PressButton className="app-writing-iconbtn" onClick={copy} aria-label={w.copyLink}>
                <PixelGlyph cells={G_COPY} size={14} />
              </PressButton>
            </span>
          </m.div>
          <m.p className="app-writing-note" variants={fv}>
            {w.fullPost}
          </m.p>
        </m.div>
      </AnimatePresence>

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
        <PressAnchor href={SIGNUP_URL} target="_blank" rel="noopener" className="app-writing-member-cta">
          {w.memberCta}
          <span aria-hidden>↗</span>
        </PressAnchor>
      </aside>

      {(older || newer) && (
        <nav className="app-writing-pager" aria-label={w.more}>
          {newer ? (
            <button type="button" className="app-writing-page app-writing-page--newer" onClick={() => onPick(newer.slug)}>
              <span className="app-writing-page-k">
                <span aria-hidden>←</span> {w.newer}
              </span>
              <span className="app-writing-page-t">{newer.title}</span>
            </button>
          ) : (
            <span className="app-writing-page-gap" />
          )}
          {older ? (
            <button type="button" className="app-writing-page app-writing-page--older" onClick={() => onPick(older.slug)}>
              <span className="app-writing-page-k">
                {w.older} <span aria-hidden>→</span>
              </span>
              <span className="app-writing-page-t">{older.title}</span>
            </button>
          ) : (
            <span className="app-writing-page-gap" />
          )}
        </nav>
      )}
    </article>
  );
}

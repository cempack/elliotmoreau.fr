"use client";

import "./writing.css";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { GhostPost } from "@/lib/ghost";
import { SITE_URL } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { PixelGlyph } from "@/components/glyphs";
import { AppWindow } from "@/components/os/AppWindow";
import { Plate } from "./Plate";
import { SubscribeForm } from "./SubscribeForm";
import { G_BACK, G_COPY, G_MAIL, G_RSS } from "./glyphs";
import { RSS_URL, dateLong, fmt, primaryTag } from "./util";

type Neighbour = { slug: string; title: string } | null;

/**
 * A post read in full, in the Writing window: its sky plate, the post as
 * Elliot wrote it (from the blog, cleaned on the server), then a way to
 * answer (Write back opens Mail with the subject filled), the next and
 * previous posts, and the newsletter. The blog stays one link away.
 */
export function Article({
  post,
  html,
  newer,
  older,
  sample,
}: {
  post: GhostPost;
  html: string;
  newer: Neighbour;
  older: Neighbour;
  sample: boolean;
}) {
  const { t, path } = useI18n();
  const w = t.writing;
  const { blip } = useSound();
  const { notify } = useToast();
  const tag = primaryTag(post);
  const here = `${SITE_URL}${path(`/writing/${post.slug}`)}`;
  const back = `${path("/writing")}?p=${encodeURIComponent(post.slug)}`;

  // the floating bar (phones) gets its material once the plate has scrolled under it
  const barRef = useRef<HTMLElement>(null);
  const edgeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const edge = edgeRef.current;
    if (!bar || !edge) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting || e.boundingClientRect.top > 0) delete bar.dataset.stuck;
      else bar.dataset.stuck = "";
    }, { rootMargin: "-120px 0px 0px 0px" });
    io.observe(edge);
    return () => io.disconnect();
  }, []);

  const reply = `${path("/contact")}?${new URLSearchParams({
    subject: fmt(w.writeBackSubject, { title: post.title }),
    body: `${fmt(w.writeBackFirstLine, { title: post.title, url: here })}\n\n`,
  })}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(here);
      blip("success");
      notify(w.copied, t.shell.apps.writing);
    } catch {
      notify(w.copyFailed, t.shell.apps.writing);
    }
  };

  return (
    <AppWindow app="writing" subtitle={<span className="app-writing-article-path">~/writing/{post.slug}</span>}>
      <article className="app-writing-article" aria-labelledby="post-title">
        <nav ref={barRef} className="app-writing-navbar app-writing-article-bar" aria-label={w.list}>
          <Link href={back} className="app-writing-back">
            <PixelGlyph cells={G_BACK} size={14} />
            <span className="app-writing-back-label">{w.allPosts}</span>
          </Link>
          <button type="button" className="app-writing-navbtn" onClick={copy} aria-label={w.copyLink}>
            <PixelGlyph cells={G_COPY} size={14} />
          </button>
        </nav>

        <Plate post={post} animate={false} />
        <span ref={edgeRef} className="app-writing-sentinel" aria-hidden />

        <header className="app-writing-article-head">
          <p className="app-writing-meta tabular">
            {tag && <span className="app-writing-tag">{tag.name}</span>}
            <time dateTime={post.published_at}>{dateLong(w, post.published_at)}</time>
            <span className="app-writing-dot" aria-hidden />
            <span>{fmt(w.minRead, { n: post.reading_time })}</span>
          </p>
          <h2 id="post-title" className="app-writing-title">
            {post.title}
          </h2>
          {post.excerpt && <p className="app-writing-dek">{post.excerpt}</p>}
          <p className="app-writing-article-by">
            <span className="app-writing-author-name">{w.author}</span>
            <a href={post.url} target="_blank" rel="noopener" className="app-writing-article-blog" aria-label={fmt(w.onBlogLabel, { title: post.title })}>
              {w.onBlog} <span aria-hidden>↗</span>
            </a>
          </p>
          {sample && <p className="app-writing-article-sample">{w.sampleBody}</p>}
        </header>

        {/* cleaned on the server (src/lib/postHtml.ts): an allowlist, no scripts or handlers */}
        <div className="app-writing-prose" dangerouslySetInnerHTML={{ __html: html }} />

        <aside className="app-writing-writeback" aria-labelledby="post-writeback">
          <span className="app-writing-member-art" aria-hidden>
            <PixelGlyph cells={G_MAIL} size={28} />
          </span>
          <div className="app-writing-member-text">
            <p className="app-writing-member-k">{w.writeBackKicker}</p>
            <h3 id="post-writeback" className="app-writing-member-title">
              {w.writeBackTitle}
            </h3>
            <p className="app-writing-member-body">{w.writeBackBody}</p>
          </div>
          <Link href={reply} className="app-writing-cta app-writing-writeback-cta">
            {w.writeBackCta}
            <span aria-hidden className="app-writing-cta-arrow">
              →
            </span>
          </Link>
        </aside>

        {(newer || older) && (
          <nav className="app-writing-article-turns" aria-label={`${w.newer} / ${w.older}`}>
            {newer ? (
              <Link href={path(`/writing/${newer.slug}`)} className="app-writing-article-turn" data-side="newer">
                <span className="app-writing-article-turn-k">← {w.newer}</span>
                <span className="app-writing-article-turn-t">{newer.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {older && (
              <Link href={path(`/writing/${older.slug}`)} className="app-writing-article-turn" data-side="older">
                <span className="app-writing-article-turn-k">{w.older} →</span>
                <span className="app-writing-article-turn-t">{older.title}</span>
              </Link>
            )}
          </nav>
        )}

        <aside className="app-writing-member" aria-labelledby="post-member">
          <span className="app-writing-member-art" aria-hidden>
            <PixelGlyph cells={G_RSS} size={24} />
          </span>
          <div className="app-writing-member-text">
            <p className="app-writing-member-k">{w.memberKicker}</p>
            <h3 id="post-member" className="app-writing-member-title">
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
      </article>
    </AppWindow>
  );
}

"use client";

import "./writing.css";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GhostPost } from "@/lib/ghost";
import { AppWindow } from "@/components/os/AppWindow";
import { useSiteData } from "@/components/os/SiteData";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { PixelGlyph } from "@/components/glyphs";
import { EmptyState } from "./EmptyState";
import { Plate } from "./Plate";
import { Letters } from "./Letters";
import { G_LINK } from "./glyphs";
import { BLOG_URL, dateLong, fmt, primaryTag } from "./util";
import { useContextMenu, useCopy } from "@/components/os/context/ContextMenu";

/**
 * Writing: one column, read top to bottom. The newest post (or the one
 * pinned in the admin panel) leads with its sky, its title and a line
 * about it; the earlier ones follow as plain rows; the newsletter closes
 * the page. Every post opens in full at /writing/[slug].
 */
export function WritingApp() {
  const data = useSiteData();
  const { t, path } = useI18n();
  const { blip } = useSound();
  const w = t.writing;
  const router = useRouter();
  const posts = data.posts;
  const lead = posts.find((p) => p.slug === data.live.pinnedPost) ?? posts[0];
  const rest = posts.filter((p) => p !== lead);
  const href = (p: GhostPost) => path(`/blog/${encodeURIComponent(p.slug)}`);
  const copy = useCopy();
  const rootRef = useRef<HTMLDivElement>(null);

  // right-click a post: read it (here or in a new tab), its link, or the blog's own page
  useContextMenu(rootRef, ({ link }) => {
    const slug = link?.pathname.match(/\/writing\/([^/]+)\/?$/)?.[1];
    const post = slug ? posts.find((p) => p.slug === decodeURIComponent(slug)) : undefined;
    if (!link || !post) return null;
    const c = t.shell.context;
    return {
      coversLink: true,
      items: [
        { label: w.read, onSelect: () => link.click() },
        { label: c.newTab, onSelect: () => window.open(link.href, "_blank", "noopener,noreferrer") },
        { label: c.copyLink, onSelect: () => copy(link.href, c.linkCopied) },
        ...(post.url ? [{ label: c.blogPost, onSelect: () => window.open(post.url, "_blank", "noopener") }] : []),
      ],
    };
  });

  // ?p=slug (older links): straight to the post
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("p");
    const hit = slug ? posts.find((p) => p.slug === slug) : undefined;
    if (hit) router.replace(path(`/blog/${encodeURIComponent(hit.slug)}`));
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toolbar = (
    <a href={BLOG_URL} target="_blank" rel="noopener" className="app-writing-tool" aria-label={w.openBlog}>
      <span className="app-writing-tool-label">blog.elliotmoreau.fr</span>
      <PixelGlyph cells={G_LINK} size={10} className="app-writing-tool-glyph" />
    </a>
  );

  if (!lead) {
    const offline = data.sources.posts === "none";
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
            {!offline && <Letters />}
          </EmptyState>
        </div>
      </AppWindow>
    );
  }

  const when = (p: GhostPost) => `${dateLong(w, p.published_at)} · ${fmt(w.minRead, { n: Math.max(1, p.reading_time || 1) })}`;
  const tag = primaryTag(lead);

  return (
    <AppWindow app="writing" toolbar={toolbar}>
      <div ref={rootRef} className="app-writing app-writing-home">
        <header className="app-writing-intro">
          <h2 className="app-writing-h1">{w.title}</h2>
          <p className="app-writing-lede">{w.lede}</p>
        </header>

        <Link href={href(lead)} onClick={() => blip("page")} className="app-writing-lead" aria-label={fmt(w.readLabel, { title: lead.title })}>
          <span className="app-writing-lead-plate">
            <Plate post={lead} animate={false} />
          </span>
          <span className="app-writing-lead-text">
            <span className="app-writing-when">
              {tag && <span className="app-writing-when-tag">{tag.name}</span>}
              <time dateTime={lead.published_at}>{when(lead)}</time>
            </span>
            <span className="app-writing-lead-title">{lead.title}</span>
            {lead.excerpt && <span className="app-writing-lead-dek">{lead.excerpt}</span>}
            <span className="app-writing-lead-cta">
              {w.read}
              <span aria-hidden className="app-writing-lead-arrow">
                →
              </span>
            </span>
          </span>
        </Link>

        {rest.length > 0 && (
          <section className="app-writing-earlier" aria-labelledby="app-writing-earlier">
            <h3 id="app-writing-earlier" className="app-writing-sec">
              {w.earlier}
            </h3>
            <ul className="app-writing-index">
              {rest.map((p) => (
                <li key={p.slug}>
                  <Link href={href(p)} onClick={() => blip("page")} className="app-writing-entry">
                    <span className="app-writing-entry-title">{p.title}</span>
                    {p.excerpt && <span className="app-writing-entry-dek">{p.excerpt}</span>}
                    <time className="app-writing-entry-when" dateTime={p.published_at}>
                      {when(p)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Letters />
      </div>
    </AppWindow>
  );
}

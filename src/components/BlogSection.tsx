"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import type { GhostPost } from "@/lib/ghost";
import { PixelLabel } from "./PixelLabel";
import { Reveal } from "./Reveal";
import { Tilt } from "./Tilt";
import { TtfxText } from "./TtfxText";
import { BackdropWord } from "./BackdropWord";
import { SubscribeForm } from "./SubscribeForm";
import { PixelPlanet } from "./PixelPlanet";
import { GLYPH_MAIL, PixelGlyph } from "./glyphs";

const BLOG_URL = process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.elliotmoreau.fr";

const fmtDate = (iso: string, lang: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** Ghost's stock fallback image is not a real feature image. */
const realImage = (p: GhostPost) =>
  p.feature_image && !p.feature_image.includes("static.ghost.org") ? p.feature_image : null;

function Byline({ post, lang, min }: { post: GhostPost; lang: string; min: string }) {
  return (
    <span className="font-mono text-[11px] text-faint">
      {fmtDate(post.published_at, lang)}
      {post.reading_time > 0 && ` · ${post.reading_time} ${min}`}
    </span>
  );
}

/**
 * 01 / BLOG: the front page — lead story as an editorial spread, further
 * stories as an index, then newsletter signup and the membership button.
 * One lead + index rows reads the same whether the blog holds one post
 * or three, on a phone or a monitor.
 */
export function BlogSection() {
  const { lang, t } = useLang();
  const [posts, setPosts] = useState<GhostPost[] | null | "off">(null);

  useEffect(() => {
    let live = true;
    fetch("/api/posts")
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        setPosts(j?.disabled || !Array.isArray(j?.posts) ? "off" : j.posts);
      })
      .catch(() => live && setPosts("off"));
    return () => {
      live = false;
    };
  }, []);

  const lead = Array.isArray(posts) && posts.length > 0 ? posts[0] : null;
  const more = Array.isArray(posts) && posts.length > 1 ? posts.slice(1) : [];

  return (
    <section id="blog" aria-label={t("blog.title")} className="relative mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <BackdropWord text="01" cell={22} drift={60} top={170} />
      <div data-parallax="0.06">
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4" preset="focus">
          <div>
            <PixelLabel text={t("blog.label")} cell={3} className="mb-3 block text-ember" />
            <h2 className="font-display text-4xl text-bone sm:text-5xl">{t("blog.title")}</h2>
            <p className="mt-2 font-mono text-[11px] text-faint">{t("blog.how")}</p>
          </div>
          <Link
            href={BLOG_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 font-mono text-[13px] text-sage transition-colors hover:text-bone"
        >
            {t("blog.all")}
            <span className="pixel-arrow font-display text-xl" aria-hidden>
              →
            </span>
          </Link>
        </Reveal>
      </div>

      {posts === "off" ? (
        <Reveal>
          <Link
            href={BLOG_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-[12px] border border-line bg-ink-2 p-8 text-center transition-colors hover:border-ember/40"
        >
            <p className="font-mono text-[13px] text-faint">{t("blog.offline")}</p>
            <p className="mt-2 font-display text-3xl text-bone">{t("blog.all")} →</p>
          </Link>
        </Reveal>
      ) : posts === null ? (
        <div className="grid gap-4" aria-hidden>
          <div className="h-80 animate-pulse rounded-[12px] border border-line bg-ink-2" />
          <div className="h-20 animate-pulse rounded-[12px] border border-line bg-ink-2" />
        </div>
      ) : posts.length === 0 ? (
        <Reveal>
          <div className="rounded-[12px] border border-line bg-ink-2 p-8 text-center">
            <p className="font-mono text-[13px] text-faint">{t("blog.empty")}</p>
          </div>
        </Reveal>
      ) : (
        lead && (
          <>
            <Reveal preset="lift">
              <Tilt max={5}>
                <Link
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group grid overflow-hidden rounded-[12px] border border-line bg-ink-2 transition-all hover:-translate-y-1 hover:border-ember/40 lg:grid-cols-[1.15fr_1fr]"
              >
                  <span className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
                    {lead.tags?.[0] && (
                      <span className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ember">
                        {lead.tags[0].name} · {t("blog.featured")}
                      </span>
                    )}
                    <span className="block text-balance font-display text-3xl leading-[1.08] text-bone sm:text-5xl">
                      <TtfxText text={lead.title} effect="decrypt" loop={false} />
                    </span>
                    {lead.excerpt && (
                      <span className="mt-3 line-clamp-3 max-w-2xl font-sans text-[14px] leading-relaxed text-faint">
                        {lead.excerpt}
                      </span>
                    )}
                    <span className="mt-6 flex items-center gap-3">
                      <Byline post={lead} lang={lang} min={t("blog.min")} />
                      <span className="pixel-arrow font-display text-xl text-sage transition-all group-hover:translate-x-1 group-hover:text-bone" aria-hidden>
                        →
                      </span>
                    </span>
                  </span>
                  <span className="relative block min-h-56 overflow-hidden border-t border-line/60 bg-ink lg:border-l lg:border-t-0">
                    {realImage(lead) ? (
                      <>
                        {/* plain img: external Ghost images need no next.config dance */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={realImage(lead) as string}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        />
                      </>
                    ) : (
                      <span className="pixel-dots absolute inset-0 flex items-center justify-center p-8">
                        {lead.tags?.[0] && (
                          <PixelLabel
                            text={lead.tags[0].name}
                            cell={3}
                            className="absolute left-6 top-6 text-ember"
                          />
                        )}
                        <PixelPlanet
                          seed={lead.slug}
                          className="h-40 w-auto drop-shadow-[0_0_24px_rgba(167,192,128,0.25)] transition-transform duration-500 group-hover:scale-[1.04] sm:h-48 lg:h-56"
                        />
                      </span>
                    )}
                  </span>
                </Link>
              </Tilt>
            </Reveal>

            {more.length > 0 && (
              <ol className="mt-4">
                {more.map((p, j) => (
                  <li key={p.slug}>
                    <Reveal delay={j * 70} preset="lift">
                      <Link
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-3 border-t border-line px-2 py-4 transition-colors last:border-b hover:bg-ink-2 sm:gap-4 sm:px-3"
                      >
                        <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-line bg-ink transition-colors group-hover:border-ember/50">
                          <PixelPlanet seed={p.slug} className="h-full w-full p-1.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[15px] text-bone transition-colors group-hover:text-ember">
                            <TtfxText text={p.title} effect="decrypt" loop={false} />
                          </span>
                          {p.excerpt && (
                            <span className="mt-0.5 hidden truncate text-[13px] text-faint min-[420px]:block">
                              {p.excerpt}
                            </span>
                          )}
                          <span className="mt-1 block">
                            <Byline post={p} lang={lang} min={t("blog.min")} />
                          </span>
                        </span>
                        <span className="pixel-arrow shrink-0 font-display text-2xl text-faint" aria-hidden>
                          →
                        </span>
                      </Link>
                    </Reveal>
                  </li>
                ))}
              </ol>
            )}
          </>
        )
      )}

      <Reveal>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-[12px] border border-line bg-ink-2 p-5 sm:p-6">
            <p className="flex items-center gap-2 font-mono text-[13px] text-bone">
              <PixelGlyph cells={GLYPH_MAIL} size={16} className="text-ember" />
              {t("blog.newsletterTitle")}
            </p>
            <p className="mb-4 mt-1 font-mono text-[11px] text-faint">{t("blog.newsletterSub")}</p>
            <SubscribeForm />
          </div>
          <Link
            href={`${BLOG_URL}/#/portal/signup`}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center justify-between gap-6 rounded-[12px] border border-ember/40 bg-ember px-6 py-5 transition-all hover:-translate-y-1 hover:bg-bone sm:px-8"
        >
            <span>
              <span className="block font-display text-2xl text-[#232A2E] sm:text-3xl">{t("blog.support")}</span>
              <span className="mt-1 block font-mono text-[11px] text-[#232A2E]/70">{t("blog.supportSub")}</span>
            </span>
            <span className="pixel-arrow font-display text-4xl text-[#232A2E]" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

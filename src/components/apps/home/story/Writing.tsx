"use client";

import { useState } from "react";
import Link from "next/link";
import { m, useSpring, useTransform, useVelocity } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSiteData } from "@/components/os/SiteData";
import { bounce, isPlainClick, visibleIcon } from "@/components/os/dock/launch";
import { PixelPlanet } from "@/components/PixelPlanet";
import { useFinePointer, useReduced } from "@/hooks/env";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import type { GhostPost } from "@/lib/ghost";
import { ChapterHead } from "./ChapterHead";
import { Arrow } from "./Deck";
import { fill, fmtDate } from "./util";

const BLOG_URL = (process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.elliotmoreau.fr").replace(/\/$/, "");
const FOLLOW = { stiffness: 420, damping: 40, mass: 0.7 };

/** Ghost's placeholder art is not a real cover. */
const realImage = (p: GhostPost) => (p.feature_image && !/static\.ghost\.org/.test(p.feature_image) ? p.feature_image : null);

/**
 * Chapter 5, writing: the three latest posts as large typographic rows
 * (date, title, tag and reading time), each a link to the blog. On a
 * mouse, a plate follows the pointer on a spring, swinging a little with
 * its speed, and slides like a film strip between the posts' covers (or
 * their pixel planets) with the excerpt beneath.
 */
export function WritingChapter() {
  const { t, lang, path } = useI18n();
  const s = t.story.writing;
  const { posts } = useSiteData();
  const { blip } = useSound();
  const list = posts.slice(0, 3);
  const fine = useFinePointer();
  const reduced = useReduced();
  const [hover, setHover] = useState<number | null>(null);
  const [last, setLast] = useState(0);
  const px = useSpring(0, FOLLOW);
  const py = useSpring(0, FOLLOW);
  // the plate hangs right of the pointer and moves to its left near the edge
  const side = useSpring(36, { stiffness: 300, damping: 34 });
  const px2 = useTransform(() => px.get() + side.get());
  const swing = useSpring(useTransform(useVelocity(px), [-2400, 0, 2400], [-6, 0, 6], { clamp: true }), {
    stiffness: 200,
    damping: 26,
  });

  const track = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    side.set(e.clientX > window.innerWidth - 380 ? -356 : 36);
    if (hover === null) {
      px.jump(e.clientX);
      py.jump(e.clientY);
    } else {
      px.set(e.clientX);
      py.set(e.clientY);
    }
  };

  const shown = list[hover ?? last];

  return (
    <section className="app-story-wr" data-veil="0.8" aria-labelledby="story-wr-title">
      <ChapterHead
        n={5}
        kicker={s.kicker}
        titleId="story-wr-title"
        title={s.title}
        aside={
          <div className="app-story-deck-tools">
            <a href={BLOG_URL} target="_blank" rel="noreferrer" className="app-story-pill app-story-pill--quiet">
              {s.blog}
              <Arrow external />
            </a>
            <Link
              href={path("/writing")}
              transitionTypes={["app-open"]}
              className="app-story-pill"
              onClick={(e) => {
                if (!isPlainClick(e)) return;
                blip("open");
                bounce(visibleIcon("writing")?.querySelector("[data-dock-bounce]"));
              }}
            >
              {s.all}
              <Arrow />
            </Link>
          </div>
        }
      />

      {list.length === 0 ? (
        <div className="app-story-deck-empty">
          <p>{s.empty}</p>
          <a href={BLOG_URL} target="_blank" rel="noreferrer" className="app-story-pill">
            {s.emptyLink}
            <Arrow external />
          </a>
        </div>
      ) : (
        <ol
          className="app-story-wr-list"
          onPointerMove={fine ? track : undefined}
          onPointerLeave={() => setHover(null)}
        >
          {list.map((post, i) => (
            <li key={post.slug}>
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="app-story-wr-row"
                data-on={hover === i || undefined}
                data-cursor={s.cursor}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse") return;
                  setHover(i);
                  setLast(i);
                }}
                onFocus={() => setLast(i)}
              >
                <span className="app-story-wr-date tabular">{fmtDate(post.published_at, lang)}</span>
                <span className="app-story-wr-title">{post.title}</span>
                <span className="app-story-wr-meta">
                  {post.tags[0] && <span className="app-story-wr-tag">{post.tags[0].name}</span>}
                  <span className="tabular">{fill(s.read, { n: post.reading_time })}</span>
                </span>
                <span className="app-story-wr-arrow" aria-hidden>
                  <Arrow external />
                </span>
                <span className="sr-only">{` (${s.readOn})`}</span>
              </a>
            </li>
          ))}
        </ol>
      )}

      {fine && list.length > 0 && (
        <m.div
          className="app-story-wr-plate"
          aria-hidden
          style={{ x: px2, y: py, rotate: reduced ? 0 : swing }}
          initial={false}
          animate={hover !== null ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.86 }}
          transition={spring.default}
        >
          <div className="app-story-wr-plate-win">
            <m.div
              className="app-story-wr-strip"
              initial={false}
              animate={{ y: `${(-(hover ?? last) * 100) / list.length}%` }}
              transition={reduced ? { duration: 0 } : spring.default}
            >
              {list.map((post) => {
                const img = realImage(post);
                return (
                  <div key={post.slug} className="app-story-wr-cell">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote cover from the blog
                      <img src={img} alt="" loading="lazy" decoding="async" className="app-story-wr-img" />
                    ) : (
                      <PixelPlanet seed={post.slug} className="app-story-wr-planet" />
                    )}
                  </div>
                );
              })}
            </m.div>
          </div>
          {shown?.excerpt && <p className="app-story-wr-excerpt">{shown.excerpt}</p>}
        </m.div>
      )}
    </section>
  );
}

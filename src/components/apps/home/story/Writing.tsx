"use client";

import { useEffect, useRef, useState } from "react";
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
 * mouse, a plate follows the pointer along the row on a spring, swinging
 * a little with its speed, and docks just under the row being read (over
 * it, near the bottom of the screen), so it never covers that title. It
 * slides like a film strip between the posts' covers (or their pixel
 * planets) with the excerpt beneath.
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
  const [above, setAbove] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const lastX = useRef(0);
  const px = useSpring(0, FOLLOW);
  const py = useSpring(0, FOLLOW);
  const swing = useSpring(useTransform(useVelocity(px), [-2400, 0, 2400], [-6, 0, 6], { clamp: true }), {
    stiffness: 200,
    damping: 26,
  });

  /** where the plate goes for row i: under it, or over it if there's no room */
  const place = (i: number, clientX: number, jump: boolean) => {
    const row = listRef.current?.querySelectorAll<HTMLElement>("[data-wr-row]")[i];
    const plate = plateRef.current;
    if (!row || !plate) return;
    const r = row.getBoundingClientRect();
    const w = plate.offsetWidth;
    const h = plate.offsetHeight;
    const gap = 12;
    // the clear band ends above the Dock (the story's probe measures it)
    const probe = document.querySelector(".app-story-probe");
    const floor = window.innerHeight - (probe ? parseFloat(getComputedStyle(probe).paddingBottom) || 96 : 96);
    const fitsBelow = r.bottom + gap + h <= floor;
    const x = Math.min(Math.max(16, clientX - 56), window.innerWidth - w - 16);
    const y = fitsBelow ? r.bottom + gap : r.top - gap - h;
    setAbove(!fitsBelow);
    if (jump) {
      px.jump(x);
      py.jump(y);
    } else {
      px.set(x);
      py.set(y);
    }
  };

  const track = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const row = (e.target as Element).closest<HTMLElement>("[data-wr-row]");
    if (!row) return;
    lastX.current = e.clientX;
    place(Number(row.dataset.wrRow), e.clientX, hover === null);
  };

  // the rows move under a still pointer when the page scrolls: follow them
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });
  useEffect(() => {
    if (hover === null) return;
    const onScroll = () => placeRef.current(hover, lastX.current, false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hover]);

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
          ref={listRef}
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
                data-wr-row={i}
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
          ref={plateRef}
          className="app-story-wr-plate"
          aria-hidden
          data-above={above || undefined}
          style={{ x: px, y: py, rotate: reduced ? 0 : swing }}
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

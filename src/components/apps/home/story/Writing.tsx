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

type Box = { l: number; t: number; r: number; b: number };
type Dock = "below" | "above" | "beside";
type Spot = { x: number; y: number; fit: number; dock: Dock; follow: boolean; score: number };

const box = (r: DOMRect): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
/** the ink of a title, not its grid cell (titles end where their words do) */
function inkBox(el: Element | null) {
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  return box(range.getBoundingClientRect());
}

/**
 * Where the plate goes for the hovered row: the clear spot nearest the
 * pointer. Candidates: under the row or over it (following the pointer),
 * beside its own title (in the row's empty stretch before the tag), or
 * over/under it but slid right past the neighbouring titles. Each is shrunk
 * a little if that's what it takes to fit between the menu bar and the
 * Dock; the score is what it would cover (a title costs far more than a
 * tag, the row being read most of all), then the shrink, then the
 * distance from the pointer.
 */
function findSpot(rows: HTMLElement[], i: number, px: number, w: number, h: number, floor: number): Spot | null {
  const row = rows[i];
  if (!row) return null;
  const R = box(row.getBoundingClientRect());
  const titles = rows.map((el) => inkBox(el.querySelector(".app-story-wr-title")));
  const metas = rows.map((el) => {
    const m = el.querySelector(".app-story-wr-meta");
    return m ? box(m.getBoundingClientRect()) : null;
  });
  // the chapter's own heading and its links are words to keep clear too
  const head = row.closest("section");
  const heading = inkBox(head?.querySelector(".app-story-title") ?? null);
  const aside = head?.querySelector(".app-story-head-aside")?.getBoundingClientRect();
  const pip = document.querySelector(".os-pip")?.getBoundingClientRect();
  const vw = window.innerWidth;
  const top = parseFloat(getComputedStyle(row).scrollMarginTop) || 56;
  const gap = 12;
  const own = titles[i];
  const spots: Spot[] = [];
  const add = (x: number, y: number, fit: number, dock: Dock, follow: boolean) => {
    const W = w * fit;
    const H = h * fit;
    const cx = Math.min(Math.max(16, x), vw - W - 16);
    if (y < top - 0.5 || y + H > floor + 0.5) return;
    const P = { l: cx, t: y, r: cx + W, b: y + H };
    let score = 0;
    titles.forEach((t, j) => t && (score += overlap(P, t) * (j === i ? 60 : 12)));
    metas.forEach((m, j) => m && (score += overlap(P, m) * (j === i ? 6 : 1)));
    if (heading) score += overlap(P, heading) * 12;
    if (aside && aside.width) score += overlap(P, box(aside)) * 12;
    if (pip && pip.width) score += overlap(P, box(pip)) * 4;
    score += (1 - fit) * 9000 + Math.abs(cx - (px - 56)) * 3;
    spots.push({ x: cx, y, fit, dock, follow, score });
  };
  // slid right past every title the plate would sit over
  const past = (y: number, H: number) =>
    [...titles.filter((_, j) => j !== i), heading].reduce((x, t) => (t && t.b > y && t.t < y + H ? Math.max(x, t.r + 28) : x), 0);
  for (const fit of [1, 0.88, 0.76]) {
    const H = h * fit;
    const below = R.b + gap;
    const above = R.t - gap - H;
    add(px - 56, below, fit, "below", true);
    add(px - 56, above, fit, "above", true);
    add(past(below, H) || px - 56, below, fit, "below", false);
    add(past(above, H) || px - 56, above, fit, "above", false);
    if (own) add(own.r + 32, Math.min(Math.max(top, (R.t + R.b) / 2 - H / 2), floor - H), fit, "beside", false);
  }
  return spots.reduce<Spot | null>((best, sp) => (!best || sp.score < best.score ? sp : best), null);
}

/** Ghost's placeholder art is not a real cover. */
const realImage = (p: GhostPost) => (p.feature_image && !/static\.ghost\.org/.test(p.feature_image) ? p.feature_image : null);

/**
 * Chapter 5, writing: the three latest posts as large typographic rows
 * (date, title, tag and reading time), each a link to the blog. On a
 * mouse, a plate follows the pointer along the row on a spring, swinging
 * a little with its speed. It docks in the clearest spot near the pointer
 * (under the row, over it, beside its title, or slid past the other
 * titles), so it never covers the title being read and keeps off the
 * others where it can. It slides like a film strip between the posts'
 * covers (or their pixel planets) with the excerpt beneath.
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
  const [dock, setDock] = useState<Dock>("below");
  const [fit, setFit] = useState(1);
  const listRef = useRef<HTMLOListElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const lastX = useRef(0);
  const px = useSpring(0, FOLLOW);
  const py = useSpring(0, FOLLOW);
  const swing = useSpring(useTransform(useVelocity(px), [-2400, 0, 2400], [-6, 0, 6], { clamp: true }), {
    stiffness: 200,
    damping: 26,
  });

  /** the spot picked for the row being read (kept while the pointer stays on it) */
  const spot = useRef<{ i: number; sp: Spot } | null>(null);

  /** where the plate goes for row i: the clearest spot near the pointer */
  const place = (i: number, clientX: number, jump: boolean) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-wr-row]") ?? []);
    const plate = plateRef.current;
    if (!rows[i] || !plate) return;
    // the clear band ends above the Dock (the story's probe measures it)
    const probe = document.querySelector(".app-story-probe");
    const floor = window.innerHeight - (probe ? parseFloat(getComputedStyle(probe).paddingBottom) || 96 : 96);
    const next = findSpot(rows, i, clientX, plate.offsetWidth, plate.offsetHeight, floor);
    if (!next) return;
    // a spot that follows the pointer keeps following it along the row;
    // the choice only changes for another row, or for a clearly better one
    const prev = spot.current;
    const keep = prev && prev.i === i && !jump && prev.sp.follow && next.score > prev.sp.score * 0.6 - 2000;
    const sp = keep ? { ...prev.sp, x: Math.min(Math.max(16, clientX - 56), window.innerWidth - plate.offsetWidth * prev.sp.fit - 16) } : next;
    spot.current = { i, sp };
    setDock(sp.dock);
    setFit(sp.fit);
    // the spot is the scaled plate's box; the plate scales about the edge
    // nearest its row (CSS transform-origin per dock), so shift by that
    const ox = sp.dock === "beside" ? 0 : 56;
    const oy = sp.dock === "above" ? plate.offsetHeight : sp.dock === "beside" ? plate.offsetHeight / 2 : 0;
    const x = sp.x - ox * (1 - sp.fit);
    const y = sp.y - oy * (1 - sp.fit);
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
          data-dock={dock}
          style={{ x: px, y: py, rotate: reduced ? 0 : swing }}
          initial={false}
          animate={hover !== null ? { opacity: 1, scale: fit } : { opacity: 0, scale: 0.86 * fit }}
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

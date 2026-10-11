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
import { readPip } from "../../pip";

const BLOG_URL = (process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.elliotmoreau.fr").replace(/\/$/, "");
const FOLLOW = { stiffness: 420, damping: 40, mass: 0.7 };

type Box = { l: number; t: number; r: number; b: number };
type Dock = "below" | "above" | "beside";
type Spot = { x: number; y: number; fit: number; dock: Dock; follow: boolean; score: number };

const box = (r: { left: number; top: number; right: number; bottom: number }): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
/** the ink of some words, line by line (titles end where their words do) */
function lineBoxes(el: Element | null): Box[] {
  if (!el) return [];
  const range = document.createRange();
  range.selectNodeContents(el);
  return Array.from(range.getClientRects())
    .filter((r) => r.width > 0 && r.height > 0)
    .map(box);
}

type Found = {
  best: Spot | null;
  /** the score of the plate at a given spot, or null where it would cover words */
  scoreAt: (x: number, y: number, fit: number) => number | null;
};

/**
 * Where the plate goes for the hovered row: the clear spot nearest the
 * pointer. It never covers words that are read: no post title (the
 * hovered one or its neighbours), nor the chapter's heading and links.
 * Candidates: under or over the row (following the pointer), beside its
 * own title in the row's empty stretch, and slid past whatever words
 * stand in the way, sideways or up and down; each shrunk a little if
 * that is what it takes to fit between the menu bar and the Dock. Among
 * the clear ones the score is the small print it would sit on (dates,
 * tags, the mini player), then the shrink, then the distance from the
 * pointer and from the row. Null when nothing is clear: it stays hidden.
 */
function findSpot(rows: HTMLElement[], i: number, px: number, w: number, h: number, floor: number): Found | null {
  const row = rows[i];
  if (!row) return null;
  const R = box(row.getBoundingClientRect());
  const titles = rows.map((el) => lineBoxes(el.querySelector(".app-story-wr-title")));
  const head = row.closest("section");
  const hard: Box[] = [...titles.flat(), ...lineBoxes(head?.querySelector(".app-story-title") ?? null)];
  const aside = head?.querySelector(".app-story-head-aside")?.getBoundingClientRect();
  if (aside && aside.width) hard.push(box(aside));
  const soft: [Box, number][] = [];
  rows.forEach((el, j) => {
    for (const sel of [".app-story-wr-meta", ".app-story-wr-date"]) {
      const m = el.querySelector(sel);
      if (m) soft.push([box(m.getBoundingClientRect()), j === i ? 6 : 1]);
    }
  });
  const pip = readPip();
  if (pip) soft.push([box(pip), 4]);
  const vw = window.innerWidth;
  // within its own chapter, between the menu bar and the Dock
  const top = Math.max(parseFloat(getComputedStyle(row).scrollMarginTop) || 56, head?.getBoundingClientRect().top ?? 0);
  const gap = 12;
  const mid = (R.t + R.b) / 2;
  const ownRight = titles[i].length ? Math.max(...titles[i].map((b) => b.r)) : R.l;
  const ownMeta = rows[i].querySelector(".app-story-wr-meta")?.getBoundingClientRect();

  const scoreAt = (x: number, y: number, fit: number) => {
    const P = { l: x, t: y, r: x + w * fit, b: y + h * fit };
    if (P.t < top - 0.5 || P.b > floor + 0.5 || P.l < 15.5 || P.r > vw - 15.5) return null;
    if (hard.some((o) => overlap(P, o) > 0)) return null;
    let score = 0;
    for (const [o, k] of soft) score += overlap(P, o) * k;
    // it belongs to its row: any spot touching it beats every spot that
    // drifts away from it, however much smaller it has to be
    const drift = Math.max(0, P.t - R.b - gap, R.t - gap - P.b);
    if (drift > 1) score += 1e6 + drift * 40;
    return score + (1 - fit) * 9000 + Math.abs(x - (px - 56)) * 2 + Math.abs((P.t + P.b) / 2 - mid) * 0.5;
  };

  let best: Spot | null = null;
  for (const fit of [1, 0.88, 0.76, 0.64, 0.56]) {
    const W = w * fit;
    const H = h * fit;
    const below = R.b + gap;
    const above = R.t - gap - H;
    const xs = [px - 56, ownRight + 32, ...hard.map((o) => o.r + 24), vw - W - 16];
    for (const x0 of xs) {
      const x = Math.round(Math.min(Math.max(16, x0), vw - W - 16));
      const ys = [below, above, mid - H / 2];
      // or off the row's own tag and reading time, beside it
      if (ownMeta && ownMeta.left < x + W && ownMeta.right > x) ys.push(ownMeta.bottom + gap, ownMeta.top - gap - H);
      // just clear of every word standing in this column
      for (const o of hard) if (o.l < x + W && o.r > x) ys.push(o.b + gap, o.t - gap - H);
      for (const y0 of ys) {
        const y = Math.round(y0);
        const score = scoreAt(x, y, fit);
        if (score === null || (best && score >= best.score)) continue;
        const dock: Dock = y >= R.b - 1 ? "below" : y + H <= R.t + 1 ? "above" : "beside";
        best = { x, y, fit, dock, follow: x0 === px - 56 && dock !== "beside", score };
      }
    }
  }
  return { best, scoreAt };
}

/** Ghost's placeholder art is not a real cover. */
const realImage = (p: GhostPost) => (p.feature_image && !/static\.ghost\.org/.test(p.feature_image) ? p.feature_image : null);

/**
 * Chapter 5, writing: the three latest posts as large typographic rows
 * (date, title, tag and reading time), each a link to the blog. On a
 * mouse, a plate follows the pointer along the row on a spring, swinging
 * a little with its speed. It docks in the clearest spot near the pointer
 * (under the row, over it, beside its title, or slid past the other
 * titles), and never over a title, the heading or its links. It slides like a film strip between the posts'
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
  const [blocked, setBlocked] = useState(false);
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
  const spot = useRef<{ i: number; sp: Spot; dy: number } | null>(null);

  /** where the plate goes for row i: the clearest spot near the pointer */
  const place = (i: number, clientX: number, jump: boolean) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-wr-row]") ?? []);
    const plate = plateRef.current;
    if (!rows[i] || !plate) return;
    // the clear band ends above the Dock (the story's probe measures it)
    const probe = document.querySelector(".app-story-probe");
    const floor = window.innerHeight - (probe ? parseFloat(getComputedStyle(probe).paddingBottom) || 96 : 96);
    const found = findSpot(rows, i, clientX, plate.offsetWidth, plate.offsetHeight, floor);
    if (!found) return;
    // a spot that follows the pointer keeps following it along the row
    // while it stays clear; the choice only changes for another row, or
    // for a clearly better one
    const prev = spot.current;
    const rowTop = rows[i].getBoundingClientRect().top;
    let sp = found.best;
    if (prev && prev.i === i && !jump && prev.sp.follow) {
      // the same place relative to the row (the page may have scrolled)
      const x = Math.round(Math.min(Math.max(16, clientX - 56), window.innerWidth - plate.offsetWidth * prev.sp.fit - 16));
      const y = Math.round(rowTop + prev.dy);
      const kept = found.scoreAt(x, y, prev.sp.fit);
      if (kept !== null && (!sp || sp.score > kept * 0.6 - 2000)) sp = { ...prev.sp, x, y, score: kept };
    }
    // nowhere clear (a cramped window): it stays out of the way
    setBlocked(!sp);
    if (!sp) {
      spot.current = null;
      return;
    }
    spot.current = { i, sp, dy: sp.y - rowTop };
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
          animate={hover !== null && !blocked ? { opacity: 1, scale: fit } : { opacity: 0, scale: 0.86 * fit }}
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

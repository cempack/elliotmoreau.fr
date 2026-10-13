"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { SOCIALS } from "@/lib/socials";
import { loc } from "@/lib/content";
import { spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { useNowContent } from "@/components/os/SiteData";
import { PixelCava, RollText } from "./bits";
import { fill, parisHM, useClock } from "./lib";
import type { Listen } from "./widgets/Listening";

/**
 * Shorten at a word boundary when there is one past halfway ("Always
 * Somewhere (2015, a remas…" reads as a typo), dropping what would dangle
 * before the ellipsis: a space, a comma, an opening bracket.
 */
function clip(s: string, n: number) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:([{–—-]+$/, "")}…`;
}

/**
 * The headline wants the song, not the edition: "Song (Live in Toulouse) -
 * Remastered 2011" → "Song", and an edition left open ("Song (2015, a
 * remaster") goes too. Falls back to the full title if that leaves
 * nothing. The widget below shows the full title.
 */
export function shortTitle(title: string) {
  const s = title
    .replace(/\s+[-–—]\s+.*$/, "")
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .replace(/\s*[([].*$/, "")
    .trim();
  return clip(s || title, 32);
}

type Word = { key: string; parts: React.ReactNode[] };
/** where a word sat in the last layout (offsets in the headline, transform-free) */
type Spot = { x: number; y: number; el: HTMLElement };

/** a word leaves faster than words arrive */
const LEAVE = { duration: 0.32, ease: [0.55, 0, 0.75, 0.2] as const };
/** the entrance of now.css (app-now-rise, fresh timing), replayed by a word that changed lines */
const RISE: Keyframe[] = [{ transform: "translateY(108%)", opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: "none", opacity: 1 }];
const RISE_TIMING: KeyframeAnimationOptions = { duration: 750, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" };

/** The headline's offset box: every word, measured without its transforms. */
function spots(h2: HTMLElement) {
  const out = new Map<string, Spot>();
  for (const el of h2.querySelectorAll<HTMLElement>("[data-word]")) out.set(el.dataset.word!, { x: el.offsetLeft, y: el.offsetTop, el });
  return out;
}

/** The translation an element is drawn with right now (mid-glide), or 0. */
function drawnAt(el: HTMLElement) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}

/** Everything laid out after the headline, up to the window's content box. */
function below(h2: HTMLElement) {
  const out: HTMLElement[] = [];
  for (let el: Element | null = h2; el && !el.classList.contains("app-now"); el = el.parentElement)
    for (let s = el.nextElementSibling; s; s = s.nextElementSibling) if (s instanceof HTMLElement) out.push(s);
  return out;
}

/** glides in flight, so a word that changes course can stop its own */
const glides = new WeakMap<HTMLElement, AnimationPlaybackControls>();

/** Slide from a translation back to rest, then drop the inline transform. */
function glide(el: HTMLElement, x: number, y: number) {
  glides.get(el)?.stop();
  const a = animate(el, { x: [x, 0], y: [y, 0] }, spring.gentle);
  glides.set(el, a);
  void a.then(() => {
    if (glides.get(el) !== a) return;
    glides.delete(el);
    el.style.transform = "";
  });
}

/** Stop a glide where it is and put the element back at rest. */
function settle(el: HTMLElement) {
  glides.get(el)?.stop();
  glides.delete(el);
  el.style.transform = "";
}

/**
 * The headline is a live sentence: hand-written focus, the song that's
 * actually playing (or paused), the actual time in Toulouse. The sentence
 * is laid out in its final form from the first frame; then its words rise
 * out of their masks, transform and opacity only (in CSS, so it starts at
 * first paint, before hydration). The clock holds its digits' width before
 * it knows the time, so nothing reflows when it does.
 *
 * When the song changes, the new sentence takes its final layout at once:
 * the old title's words rise out of where they were and the new ones rise
 * in; a word nudged along its line glides there, one that changes lines
 * (or would travel past its own width) rises out and back in with the new
 * words, so no word slides across another; whatever sits below the
 * headline glides by the change in its height. Nothing jumps. The time
 * rolls its own digits.
 */
export function NowHero({ listen, updated }: { listen: Listen; updated: string }) {
  const { t, lang } = useI18n();
  const n = t.now;
  const content = useNowContent();
  const reduced = useReduced();
  // checked every second, but the hero renders only when the minute turns
  const clock = useClock(parisHM);
  // before mount, digits of the same width stand in (hidden), so the line
  // doesn't move when the real time arrives
  const time = clock ?? "00:00";
  const h2Ref = useRef<HTMLHeadingElement>(null);
  const outRef = useRef<HTMLSpanElement>(null);

  const { status, track, playing } = listen;
  // honest states only: "listening to" while it plays, "on pause" while
  // Spotify holds a paused track, and nothing about music otherwise (the
  // last-played track, possibly days old, lives in the widget with its age)
  const live = status?.now ? track : null;
  const template = live && playing ? n.sentence.playing : live ? n.sentence.paused : n.sentence.quiet;
  const title = live ? shortTitle(live.title) : "";

  // the plain sentence for assistive tech
  const plain = fill(template, {
    doing: fill(loc(content.focus.doing, lang), { name: content.focus.name }),
    track: live ? `${live.title} (${live.artist})` : "",
    time: clock ?? "--:--",
  });

  // words: live tokens get their own look; a track title becomes one masked
  // word per word so long ones wrap. Each word has a stable key (the clock
  // is "{time}", not its digits; repeats are counted) so a word that stays
  // keeps its element and only real changes mount new ones.
  const expanded = template.replace("{doing}", fill(loc(content.focus.doing, lang), { name: "{focus}" }));
  const words: Word[] = [];
  const seenIds = new Map<string, number>();
  const push = (id: string, parts: React.ReactNode[]) => {
    const k = seenIds.get(id) ?? 0;
    seenIds.set(id, k + 1);
    words.push({ key: `${id}#${k}`, parts });
  };
  for (const word of expanded.split(/\s+/)) {
    const parts = word.split(/(\{\w+\})/g).filter(Boolean);
    const ti = parts.indexOf("{track}");
    if (ti >= 0 && live) {
      const before = parts.slice(0, ti);
      const after = parts.slice(ti + 1);
      const tw = title.split(/\s+/);
      tw.forEach((w, j) => {
        const link = (
          <a
            key="t"
            href={live.url || SOCIALS.spotifyUser}
            target="_blank"
            rel="noopener noreferrer"
            className="app-now-tok app-now-tok--track"
            tabIndex={-1}
          >
            {j === 0 ? (
              <>
                {/* a title too long for its line breaks inside the word, never between the meter and it */}
                <span className="app-now-tok-lead">
                  <PixelCava playing={playing} still cols={4} className="app-now-tok-cava" />
                  {Array.from(w)[0]}
                </span>
                {Array.from(w).slice(1).join("")}
              </>
            ) : (
              w
            )}
          </a>
        );
        const pre = j === 0 ? before : [];
        const post = j === tw.length - 1 ? after : [];
        push(`${pre.join("")}♪${w}${post.join("")}`, [...pre, link, ...post]);
      });
      continue;
    }
    push(
      word,
      parts.map((part) => {
        if (part === "{focus}")
          return (
            <a key="f" href={content.focus.url} target="_blank" rel="noopener noreferrer" className="app-now-tok app-now-tok--focus" tabIndex={-1}>
              {content.focus.name}
            </a>
          );
        if (part === "{time}")
          return (
            <span key="c" className="app-now-tok app-now-tok--time" data-pending={clock ? undefined : ""}>
              <RollText text={time} />
            </span>
          );
        return part;
      })
    );
  }

  // each word's place in its entrance wave, fixed when it mounts (changing
  // it later would restart a running animation). On a change, the wave
  // starts at the first new word. State from the last render, React's
  // documented pattern.
  const sig = words.map((w) => w.key).join("\u0001");
  const [seen, setSeen] = useState(() => ({ sig, wave: new Map(words.map((w, i) => [w.key, { i, fresh: false }])) }));
  let wave = seen.wave;
  if (seen.sig !== sig) {
    const next = new Map<string, { i: number; fresh: boolean }>();
    let from = -1;
    words.forEach((w, i) => {
      const had = seen.wave.get(w.key);
      if (!had && from < 0) from = i;
      next.set(w.key, had ?? { i: i - from, fresh: true });
    });
    wave = next;
    setSeen({ sig, wave });
  }

  // the last layout of the headline: where each word sat and how tall it was
  const last = useRef<{ sig: string; h: number; at: Map<string, Spot> } | null>(null);
  useLayoutEffect(() => {
    const h2 = h2Ref.current;
    if (!h2) return;
    const prev = last.current;
    const at = spots(h2);
    const h = h2.offsetHeight;
    last.current = { sig, h, at };
    if (!prev || prev.sig === sig || reduced) return;
    const box = h2.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return; // nobody is looking
    const out = outRef.current;
    /** a copy of a word rises out of its mask where the word was (aria-hidden) */
    const leave = (el: HTMLElement, was: Spot) => {
      if (!out) return;
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-word");
      ghost.style.cssText = `position:absolute;left:${was.x}px;top:${was.y}px;margin:0;transform:none`;
      // a clock caught mid-roll: keep each digit's incoming character, at rest
      for (const cell of ghost.querySelectorAll(".app-now-roll-cell")) {
        const chs = cell.querySelectorAll<HTMLElement>(".app-now-roll-ch");
        chs.forEach((c, k) => (k < chs.length - 1 ? c.remove() : c.removeAttribute("style")));
      }
      out.appendChild(ghost);
      const inner = ghost.firstElementChild as HTMLElement | null;
      if (!inner) return ghost.remove();
      void animate(inner, { y: ["0%", "-108%"], opacity: [1, 0] }, LEAVE).then(() => ghost.remove());
    };
    // the wave counts from the first new word, like the new words' own entrance
    const keys = [...at.keys()];
    const first = keys.findIndex((k) => !prev.at.has(k));
    keys.forEach((key, i) => {
      const was = prev.at.get(key);
      if (!was) return;
      const s = at.get(key)!;
      const d = drawnAt(s.el);
      const dx = was.x + d.x - s.x;
      if (was.y !== s.y || Math.abs(dx) > s.el.offsetWidth) {
        // it changed lines, or would travel further than its own width:
        // rather than slide across other words, it rises out where it was
        // and back in where it is, in the wave
        leave(s.el, was);
        settle(s.el);
        const inner = s.el.firstElementChild as HTMLElement | null;
        inner?.animate(RISE, { ...RISE_TIMING, delay: 60 + Math.max(0, i - Math.max(0, first)) * 40 });
        return;
      }
      // a nudge along its line: it glides there from where it is drawn now
      if (Math.abs(dx) > 0.5 || Math.abs(d.y) > 0.5) glide(s.el, dx, d.y);
    });
    // words that left rise out of their masks where they were
    for (const [key, was] of prev.at) if (!at.has(key)) leave(was.el, was);
    // the rest of the page follows the headline's new height
    const dh = prev.h - h;
    if (Math.abs(dh) > 0.5) for (const el of below(h2)) glide(el, 0, dh + drawnAt(el).y);
  }, [sig, reduced]);

  // keep the last layout current as the window resizes or fonts settle
  useLayoutEffect(() => {
    const h2 = h2Ref.current;
    if (!h2) return;
    const ro = new ResizeObserver(() => {
      if (last.current) last.current = { ...last.current, h: h2.offsetHeight, at: spots(h2) };
    });
    ro.observe(h2);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="app-now-hero">
      <p className="app-now-kicker">
        <span className="app-now-kicker-live">{n.live}</span>
        <span aria-hidden>·</span>
        <span>{n.kicker}</span>
      </p>
      <h2 ref={h2Ref} className="app-now-sentence">
        <span className="sr-only">{plain}</span>
        <span aria-hidden>
          {words.map((w, i) => {
            const wv = wave.get(w.key) ?? { i, fresh: false };
            return (
              <Fragment key={w.key}>
                {i > 0 && " "}
                <span className="app-now-word" data-word={w.key}>
                  <span
                    className="app-now-word-in"
                    data-fresh={wv.fresh || undefined}
                    style={{ "--i": wv.i } as React.CSSProperties}
                  >
                    {w.parts.map((part, j) => (
                      <Fragment key={j}>{part}</Fragment>
                    ))}
                  </span>
                </span>
              </Fragment>
            );
          })}
        </span>
        <span ref={outRef} className="app-now-sentence-out" aria-hidden />
      </h2>
      <p className="app-now-intro">
        {loc(content.intro, lang)}{" "}
        <a href="https://nownownow.com/about" target="_blank" rel="noopener noreferrer" className="app-now-link">
          {n.whatIs}
        </a>
      </p>
      <p className="app-now-updated">{updated}</p>
    </header>
  );
}

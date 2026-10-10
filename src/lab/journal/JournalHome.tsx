"use client";

import "./journal.css";
import { ViewTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { Cursor } from "@/components/ui/Cursor";
import { IntroGate } from "@/components/ui/IntroGate";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { LabSwitcher } from "@/lab/LabSwitcher";
import { useLabCommands } from "@/lab/commands";
import type { HomeData } from "@/lib/data";
import { Atlas } from "./Atlas";
import { Colophon } from "./Colophon";
import { Cover } from "./Cover";
import { FieldNotes } from "./FieldNotes";
import { JournalIntro } from "./Intro";
import { Listening } from "./Listening";
import { Folio, Masthead, goTo } from "./Masthead";
import { Signals } from "./Signals";
import { Work } from "./Work";
import { CHAPTERS, useJ, type ChapterId } from "./strings";

/**
 * Direction B — Kinetic Journal. An editorial home page you read like a
 * magazine: a cover around the pixel name, chapters that assemble as you
 * scroll, a pinned run of postcards, and a paper chapter the whole page
 * turns into and back out of.
 */
export function JournalHome({ data }: { data: HomeData }) {
  return (
    <ViewTransition
      enter={{ "lab-switch": "journal-wipe-in", default: "none" }}
      exit={{ "lab-switch": "journal-wipe-out", default: "none" }}
      default="none"
    >
      <main data-dir="journal" className="j-root">
        <Journal data={data} />
      </main>
    </ViewTransition>
  );
}

function Journal({ data }: { data: HomeData }) {
  const { c, j } = useJ();

  // marks the document while the Journal is mounted, so the wipe-in can
  // hold the previous page underneath instead of fading it to nothing
  // (set during the commit, before the transition snapshots the new page)
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.add("journal-vt");
    return () => html.classList.remove("journal-vt");
  }, []);
  const { status, track, playing } = useSpotifyStatus(data.spotify);

  const extra = useMemo<Command[]>(
    () =>
      CHAPTERS.filter((ch) => ch.id !== "cover").map((ch) => ({
        id: `j-ch-${ch.id}`,
        group: c.palette.go,
        label: `${j.chapter} ${ch.n} — ${j.chapters[ch.id]}`,
        hint: `§${ch.n}`,
        keywords: ch.id,
        perform: () => goTo(ch.id),
      })),
    [c.palette.go, j],
  );
  const commands = useLabCommands(data, extra);

  // running head + folio: the chapter crossing the reading line
  const [active, setActive] = useState<ChapterId>("cover");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.chapter as ChapterId);
        }
      },
      { rootMargin: "-45% 0px -54% 0px" },
    );
    const watch = () => root.querySelectorAll("[data-chapter]").forEach((el) => io.observe(el));
    watch();
    // a chapter can swap its element after mount (the Atlas picks pin,
    // swipe or grid on the client), so keep observing whatever is there
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  // the paper chapter: as Work crosses into view the page turns to paper,
  // and back to ink as it leaves — one scroll-scrubbed variable, every
  // colour derives from it in CSS
  const workRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: inP } = useScroll({
    target: workRef,
    offset: ["start 85%", "start 35%"],
  });
  const { scrollYProgress: outP } = useScroll({
    target: workRef,
    offset: ["end 75%", "end 30%"],
  });
  const paper = useTransform(() => inP.get() * (1 - outP.get()));
  const paint = (v: number) => {
    const host = rootRef.current?.closest<HTMLElement>("[data-dir]");
    if (!host) return;
    const e = v * v * (3 - 2 * v); // smoothstep: settle into each end
    host.style.setProperty("--paper", e.toFixed(4));
    host.dataset.tone = e > 0.5 ? "paper" : "ink";
  };
  useMotionValueEvent(paper, "change", paint);
  useEffect(() => {
    paint(paper.get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CommandPalette commands={commands} placeholder={c.palette.placeholder} empty={c.palette.empty}>
      <div ref={rootRef} className="j-page">
        <IntroGate maxMs={1800}>
          <JournalIntro />
        </IntroGate>
        <Cursor variant="ring" />
        <Masthead active={active} />

        <Cover track={track} playing={playing} />
        <Signals track={track} playing={playing} activity={data.activity} />
        <FieldNotes posts={data.posts} />
        <Atlas />
        <div ref={workRef}>
          <Work repos={data.repos} activity={data.activity} />
        </div>
        <Listening status={status} track={track} playing={playing} />
        <Colophon />

        <Folio active={active} />
        <LabSwitcher data={data} />
      </div>
    </CommandPalette>
  );
}

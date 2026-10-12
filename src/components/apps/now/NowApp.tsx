"use client";

import "./now.css";
import { useEffect, useRef, useState } from "react";
import { AppWindow } from "@/components/os/AppWindow";
import { PixelGlyph } from "@/components/glyphs";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useFinePointer, useHydrated } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { Board, useBoard, type BoardWidget } from "./board/Board";
import { NowHero } from "./Hero";
import { G_BOOK, G_BUILD, G_CHECK, G_NOTE, G_PEN, G_PULSE, G_RESET } from "./bits";
import { fill, useNow } from "./lib";
import { TodaySky } from "./Day";
import type { DayData } from "@/lib/data";
import { Listening, ListeningMeta } from "./widgets/Listening";
import { Building, BuildingMeta } from "./widgets/Building";
import { Pulse } from "./widgets/Pulse";
import { Reading } from "./widgets/Reading";
import { Writing } from "./widgets/Writing";
import { useSiteData } from "@/components/os/SiteData";
import type { PushHistory } from "@/lib/github";

/** default arrangements: each packs the 4-column grid, and the 2-column
    one, with no holes: Listening, Building and Writing on top, Pulse as a
    wide strip below (or Listening, Building and Reading on top, then
    Writing beside Pulse). A saved layout that still lists a widget that's
    gone simply drops it. */
const ORDER_READING: readonly string[] = ["listening", "building", "reading", "writing", "pulse"];
const ORDER: readonly string[] = ["listening", "building", "writing", "pulse"];

/** "2026-10-10" → a long date in the page language (UTC: no off-by-one). */
function longDate(iso: string, lang: "en" | "fr") {
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/**
 * Now (Activity): a /now page as a live dashboard. A live headline on
 * top, then widgets you can rearrange by hand (the signature: lift, throw,
 * reflow, snap, persisted on this device), each fed by real data or by
 * hand-written content (the database, edited in the admin panel). Nothing
 * here is a made-up metric. The push history comes from the page itself
 * (the shell's data leaves it out).
 */
export function NowApp({ pushes, day }: { pushes: PushHistory | null; day: DayData }) {
  const data = useSiteData();
  const { t, lang } = useI18n();
  const n = t.now;
  const { blip } = useSound();
  const fine = useFinePointer();
  const mounted = useHydrated();
  const listen = useSpotifyStatus(data.spotify);
  const content = data.now;
  // the reading tile only exists once there is something on the nightstand
  const hasReading = content.reading.length > 0 || content.learning.length > 0;
  const board = useBoard(hasReading ? ORDER_READING : ORDER);
  const { arrange, setArrange } = board;
  const arrangeRef = useRef<HTMLButtonElement>(null);
  const [said, setSaid] = useState("");

  // Escape leaves Arrange mode. A carried widget handles its own Escape
  // first, and an Escape meant for something else (Spotlight, a dialog, the
  // Terminal) only closes that one thing.
  useEffect(() => {
    if (!arrange) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const from = e.target instanceof Element ? e.target : null;
      if (from?.closest("dialog,[role=dialog],[role=alertdialog],[aria-modal=true],.os-term")) return;
      if (document.querySelector("dialog[open],[aria-modal=true]")) return;
      setArrange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrange, setArrange]);

  // "today / yesterday / 6 days ago", by calendar day in Toulouse
  const now = useNow(60_000);
  let updatedAgo = "";
  if (now) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
    const days = Math.round((Date.parse(today) - Date.parse(content.updated)) / 86_400_000);
    updatedAgo = days <= 0 ? n.today : days === 1 ? n.yesterday : fill(n.daysAgo, { n: days });
  }
  const updated = fill(n.updated, { date: longDate(content.updated, lang) });

  const widgets: BoardWidget[] = [
    {
      id: "listening",
      size: "L",
      label: n.widgets.listening,
      accent: "var(--color-ion)",
      glyph: G_NOTE,
      meta: <ListeningMeta {...listen} />,
      children: <Listening {...listen} />,
    },
    {
      id: "building",
      size: "T",
      label: n.widgets.building,
      accent: "var(--color-signal)",
      glyph: G_BUILD,
      meta: <BuildingMeta />,
      children: <Building activity={data.activity} />,
    },
    ...(hasReading
      ? [
          {
            id: "reading",
            size: "T",
            label: n.widgets.reading,
            accent: "var(--color-ember)",
            glyph: G_BOOK,
            children: <Reading />,
          } satisfies BoardWidget,
        ]
      : []),
    {
      id: "writing",
      size: hasReading ? "L" : "T",
      label: n.widgets.writing,
      accent: "var(--color-ion)",
      glyph: G_PEN,
      children: <Writing posts={data.posts} />,
    },
    {
      id: "pulse",
      size: hasReading ? "L" : "W",
      label: n.widgets.pulse,
      accent: "var(--color-flare)",
      glyph: G_PULSE,
      meta: <span className="app-now-status app-now-status--mono">GitHub</span>,
      children: <Pulse pushes={pushes} />,
    },
  ];

  const toolbar = (
    <div className="app-now-tools">
      {!board.isDefault && (
        <button
          type="button"
          className="app-now-tool app-now-tool--icon"
          aria-label={n.board.reset}
          title={n.board.reset}
          onClick={() => {
            board.reset();
            blip("toggle");
            setSaid(n.board.resetDone);
            // this button is about to disappear: keep focus in the toolbar
            arrangeRef.current?.focus();
          }}
        >
          <PixelGlyph cells={G_RESET} size={14} />
        </button>
      )}
      <button
        ref={arrangeRef}
        type="button"
        className="app-now-tool"
        aria-pressed={arrange}
        data-on={arrange || undefined}
        onClick={() => {
          setArrange(!arrange);
          blip("toggle");
        }}
      >
        {arrange ? n.board.done : n.board.arrange}
      </button>
    </div>
  );

  return (
    <AppWindow app="now" toolbar={toolbar}>
      <div className="app-now">
        <NowHero listen={listen} updated={updatedAgo ? `${updated} · ${updatedAgo}` : updated} />
        <TodaySky day={day} />

        <div className="app-now-hintrow">
          <p className="app-now-hint" aria-hidden>
            {arrange ? n.board.hintArrange : mounted && !fine ? n.board.hintTouch : n.board.hintFine}
          </p>
          {!board.isDefault && (
            <p className="app-now-hint app-now-hint--saved">
              <PixelGlyph cells={G_CHECK} size={8} />
              {n.board.saved}
            </p>
          )}
        </div>

        <Board
          board={board}
          widgets={widgets}
          strings={{
            label: n.board.label,
            move: n.board.move,
            grab: n.board.grab,
            instructions: n.board.instructions,
            picked: n.board.picked,
            moved: n.board.moved,
            dropped: n.board.dropped,
            cancelled: n.board.cancelled,
          }}
        />
        <p className="sr-only" aria-live="polite">
          {said}
        </p>

        <footer className="app-now-foot">
          <p>{n.footer.sources}</p>
        </footer>
      </div>
    </AppWindow>
  );
}

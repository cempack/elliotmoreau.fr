"use client";

import "./now.css";
import { useEffect, useRef, useState } from "react";
import type { SiteData } from "@/lib/data";
import { AppWindow } from "@/components/os/AppWindow";
import { PixelGlyph } from "@/components/glyphs";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useFinePointer, useHydrated } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { NOW } from "@/content/now";
import { Board, useBoard, type BoardWidget } from "./board/Board";
import { NowHero } from "./Hero";
import { G_BOOK, G_BUILD, G_CHECK, G_CLOCK, G_FETCH, G_NOTE, G_PEN, G_PULSE, G_RESET } from "./bits";
import { fill, useNow } from "./lib";
import { Listening, ListeningMeta } from "./widgets/Listening";
import { HereMeta, HereNow } from "./widgets/HereNow";
import { Building, BuildingMeta } from "./widgets/Building";
import { Pulse, PulseMeta } from "./widgets/Pulse";
import { Setup, SetupMeta } from "./widgets/Setup";
import { Reading } from "./widgets/Reading";
import { Writing } from "./widgets/Writing";

/** default arrangement: it packs the 4-column grid with no holes */
const DEFAULT_ORDER = ["listening", "here", "building", "pulse", "setup", "reading", "writing"] as const;

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
 * hand-written content (src/content/now.ts). Nothing here is a made-up
 * metric.
 */
export function NowApp({ data }: { data: SiteData }) {
  const { t, lang } = useI18n();
  const n = t.now;
  const { blip } = useSound();
  const fine = useFinePointer();
  const mounted = useHydrated();
  const listen = useSpotifyStatus(data.spotify);
  const board = useBoard(DEFAULT_ORDER);
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

  // "today / yesterday / 6 days ago", by calendar day in Paris
  const now = useNow(60_000);
  let updatedAgo = "";
  if (now) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
    const days = Math.round((Date.parse(today) - Date.parse(NOW.updated)) / 86_400_000);
    updatedAgo = days <= 0 ? n.today : days === 1 ? n.yesterday : fill(n.daysAgo, { n: days });
  }
  const updated = fill(n.updated, { date: longDate(NOW.updated, lang) });

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
      id: "here",
      size: "T",
      label: n.widgets.here,
      accent: "var(--color-ember)",
      glyph: G_CLOCK,
      meta: <HereMeta />,
      children: <HereNow />,
    },
    {
      id: "building",
      size: "T",
      label: n.widgets.building,
      accent: "var(--color-signal)",
      glyph: G_BUILD,
      meta: <BuildingMeta />,
      children: <Building activity={data.activity} repos={data.repos} />,
    },
    {
      id: "pulse",
      size: "W",
      label: n.widgets.pulse,
      accent: "var(--color-flare)",
      glyph: G_PULSE,
      meta: <PulseMeta />,
      children: <Pulse repos={data.repos} posts={data.posts} activity={data.activity} />,
    },
    {
      id: "setup",
      size: "L",
      label: n.widgets.setup,
      accent: "var(--color-lilac)",
      glyph: G_FETCH,
      meta: <SetupMeta />,
      children: <Setup repos={data.repos} />,
    },
    {
      id: "reading",
      size: "T",
      label: n.widgets.reading,
      accent: "var(--color-ember)",
      glyph: G_BOOK,
      children: <Reading />,
    },
    {
      id: "writing",
      size: "T",
      label: n.widgets.writing,
      accent: "var(--color-ion)",
      glyph: G_PEN,
      children: <Writing posts={data.posts} />,
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

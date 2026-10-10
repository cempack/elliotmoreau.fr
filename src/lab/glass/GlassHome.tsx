"use client";

import "./glass.css";
import { useMemo, useState, ViewTransition } from "react";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { Cursor } from "@/components/ui/Cursor";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { LabSwitcher } from "@/lab/LabSwitcher";
import { useLabCommands } from "@/lab/commands";
import type { HomeData } from "@/lib/data";
import { Backdrop } from "./Backdrop";
import { Bento } from "./Bento";
import { RootCtx } from "./Expand";
import { GlassFooter } from "./GlassFooter";
import { GlassNav, jumpTo } from "./GlassNav";
import { Hero } from "./Hero";
import { GlassIntro } from "./Intro";
import { GlassCtx } from "./LiquidGlass";
import { Lens } from "./Lens";
import { useChromium, useMedia } from "./env";
import { SpotifyCtx } from "./live";
import { useGlassCopy } from "./strings";

/**
 * Direction A — Liquid Glass. Elliot's pixel night, seen through slabs of
 * glass that bend light, answer the instant you touch them, and carry
 * momentum when you let go.
 */
export function GlassHome({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const chromium = useChromium();
  const opaque = useMedia("(prefers-reduced-transparency: reduce)");
  const refract = chromium && !opaque;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const spotify = useSpotifyStatus(data.spotify);
  const glass = useMemo(() => ({ refract }), [refract]);

  const extra = useMemo<Command[]>(
    () => [
      { id: "g-writing", group: c.palette.go, label: c.writing, hint: "↓", perform: () => jumpTo("g-writing") },
      { id: "g-work", group: c.palette.go, label: c.work, hint: "↓", perform: () => jumpTo("g-work") },
      { id: "g-listen", group: c.palette.go, label: c.listening, hint: "↓", perform: () => jumpTo("g-now") },
      { id: "g-atlas", group: c.palette.go, label: c.atlas, hint: "↓", perform: () => jumpTo("g-atlas") },
      { id: "g-contact", group: c.palette.go, label: c.nav.contact, hint: "↓", perform: () => jumpTo("g-contact") },
    ],
    [c.palette.go, c.writing, c.work, c.listening, c.atlas, c.nav.contact]
  );
  const commands = useLabCommands(data, extra);

  return (
    <ViewTransition enter={{ "lab-switch": "lab-fade", default: "none" }} exit={{ "lab-switch": "lab-fade", default: "none" }}>
      <div ref={setRoot} data-dir="glass" data-refract={refract ? "" : undefined} className="g-root">
        <GlassCtx.Provider value={glass}>
          <RootCtx.Provider value={root}>
            <SpotifyCtx.Provider value={spotify}>
              <CommandPalette commands={commands} placeholder={c.palette.placeholder} empty={c.palette.empty}>
                <Backdrop />
                <GlassIntro />
                <GlassNav />
                <main className="g-page">
                  <Hero data={data} />
                  <Bento data={data} />
                </main>
                <GlassFooter />
                <Lens />
                <LabSwitcher data={data} />
                <Cursor variant="glass" />
              </CommandPalette>
            </SpotifyCtx.Provider>
          </RootCtx.Provider>
        </GlassCtx.Provider>
      </div>
    </ViewTransition>
  );
}

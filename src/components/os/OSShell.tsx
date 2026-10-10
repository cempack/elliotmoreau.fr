"use client";

import { useI18n } from "@/i18n/client";
import type { SiteData } from "@/lib/data";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { Cursor } from "@/components/ui/Cursor";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { SiteDataProvider } from "./SiteData";
import { SkyProvider } from "./sky";
import { TerminalProvider, Terminal } from "./Terminal";
import { useSpotlightCommands } from "./commands";
import { Wallpaper } from "./Wallpaper";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { MiniPlayer } from "./MiniPlayer";
import { Intro } from "./Intro";

function Spotlight({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const commands = useSpotlightCommands();
  return (
    <CommandPalette commands={commands} placeholder={t.shell.spotlight.placeholder} empty={t.shell.spotlight.empty}>
      {children}
    </CommandPalette>
  );
}

/**
 * emOS: the persistent chrome around every app. Order matters for
 * stacking: wallpaper (z0) → app content → dock/menu bar (z50) →
 * mini player → terminal → intro (z100) → cursor.
 */
export function OSShell({ data, children }: { data: SiteData; children: React.ReactNode }) {
  return (
    <SiteDataProvider data={data}>
      <SkyProvider>
        <TerminalProvider>
          <Spotlight>
            <SmoothScroll />
            <Wallpaper />
            <MenuBar />
            <div className="relative z-10 flex min-h-svh flex-col">{children}</div>
            <Dock />
            <MiniPlayer />
            <Terminal />
            <Intro />
            <Cursor variant="glass" />
          </Spotlight>
        </TerminalProvider>
      </SkyProvider>
    </SiteDataProvider>
  );
}

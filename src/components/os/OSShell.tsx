"use client";

import { useI18n } from "@/i18n/client";
import type { SiteData } from "@/lib/data";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { SiteDataProvider } from "./SiteData";
import { SkyProvider } from "./sky";
import { TerminalProvider, Terminal } from "./Terminal";
import { useSpotlightCommands, useSpotlightFallback } from "./commands";
import { useNow } from "./menubar/util";
import { Wallpaper } from "./Wallpaper";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { Intro } from "./Intro";

function Spotlight({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const commands = useSpotlightCommands();
  const fallback = useSpotlightFallback();
  const now = useNow("minute");
  const clock = now ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(now) : "--:--";
  return (
    <CommandPalette
      commands={commands}
      placeholder={t.shell.spotlight.placeholder}
      empty={t.shell.spotlight.empty}
      board={{ title: t.shell.spotlight.board.title, code: "TLS", clock }}
      fallback={fallback}
    >
      {children}
    </CommandPalette>
  );
}

/**
 * emOS: the persistent chrome around every app. Order matters for
 * stacking: wallpaper (z0) → app content → dock/menu bar (z50) →
 * terminal → intro (z100).
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
            <div className="relative z-10 flex min-h-svh flex-col overflow-x-clip">{children}</div>
            <Dock />
            <Terminal />
            <Intro />
          </Spotlight>
        </TerminalProvider>
      </SkyProvider>
    </SiteDataProvider>
  );
}

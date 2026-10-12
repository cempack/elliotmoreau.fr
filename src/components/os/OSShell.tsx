"use client";

import type { SiteData } from "@/lib/data";
import { PaletteProvider } from "@/components/ui/palette";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { SiteDataProvider } from "./SiteData";
import { SkyProvider } from "./sky";
import { TerminalProvider, Terminal } from "./Terminal";
import { Wallpaper } from "./Wallpaper";
import { MenuBar } from "./MenuBar";
import { Dock } from "./Dock";
import { Intro } from "./Intro";
import { IdlePrefetch } from "./IdlePrefetch";
import { Suspense } from "react";
import { TrailRecorder } from "./trail";

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
          <PaletteProvider>
            <SmoothScroll />
            <IdlePrefetch />
            {/* useSearchParams: kept out of the static render's way */}
            <Suspense fallback={null}>
              <TrailRecorder />
            </Suspense>
            <Wallpaper />
            <MenuBar />
            <div className="relative z-10 flex min-h-svh flex-col overflow-x-clip">{children}</div>
            <Dock />
            <Terminal />
            <Intro />
          </PaletteProvider>
        </TerminalProvider>
      </SkyProvider>
    </SiteDataProvider>
  );
}

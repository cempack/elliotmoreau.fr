"use client";

import "./desktop.css";
import type { PushHistory } from "@/lib/github";
import { DesktopScene } from "./desktop/DesktopScene";
import { PushesProvider } from "./desktop/BrickWall";

/** `/`: one screen, like a real desktop. Nothing scrolls. */
export function Desktop({ pushes }: { pushes: PushHistory | null }) {
  return (
    <PushesProvider value={pushes}>
      <DesktopScene />
    </PushesProvider>
  );
}

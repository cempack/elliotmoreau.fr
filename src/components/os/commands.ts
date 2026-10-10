"use client";

import { useMemo } from "react";
import type { Command } from "@/components/ui/CommandPalette";

/**
 * CONTRACT (owner: menubar agent)
 * Spotlight command set: apps (localized paths), actions (copy email,
 * switch language, toggle sound, sky phases, restart, open terminal, back
 * to top), posts, repos, socials. Returns Command[] for <CommandPalette>.
 */
export function useSpotlightCommands(): Command[] {
  return useMemo(() => [], []);
}

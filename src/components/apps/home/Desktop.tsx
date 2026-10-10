"use client";

import "./desktop.css";
import type { SiteData } from "@/lib/data";
import { DesktopScene } from "./desktop/DesktopScene";
import { Story } from "./story/Story";

/**
 * `/`: the Desktop. The first screen is the desktop scene (wordmark,
 * hello.txt, widgets, icons); the scroll story continues below it.
 * Live data comes from the shell's SiteDataProvider, so the scene reads
 * it where it's needed.
 */
// `data` is the same payload the shell's SiteDataProvider holds
export function Desktop(props: { data: SiteData }) {
  void props;
  return (
    <>
      <DesktopScene />
      <Story />
    </>
  );
}

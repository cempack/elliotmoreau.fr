"use client";

import "./desktop.css";
import type { SiteData } from "@/lib/data";
import { DesktopScene } from "./desktop/DesktopScene";

/** `/`: one screen, like a real desktop. Nothing scrolls. */
export function Desktop(props: { data: SiteData }) {
  void props;
  return <DesktopScene />;
}

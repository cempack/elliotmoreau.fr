"use client";

import { createContext, useContext } from "react";
import type { SiteData } from "@/lib/data";

const Ctx = createContext<SiteData | null>(null);

/** Server-fetched live data (posts, repos, spotify, activity) and the
    database content (places, status, /now, overrides) for any client component. */
export function SiteDataProvider({ data, children }: { data: SiteData; children: React.ReactNode }) {
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useSiteData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSiteData outside SiteDataProvider");
  return v;
}

/** The Atlas places: home first, then been, then want. */
export const usePlaces = () => useSiteData().places;
/** Away, working hours and reply days. */
export const useStatus = () => useSiteData().status;
/** The /now page's hand-written content. */
export const useNowContent = () => useSiteData().now;
/** Featured repo, pinned post, Spotify on or off (hidden repos are already filtered out). */
export const useLive = () => useSiteData().live;
/** Who's away today (resolved on the server for this render), or null. */
export const useAway = () => useSiteData().away;

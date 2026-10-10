"use client";

import { createContext, useContext } from "react";
import type { SiteData } from "@/lib/data";

const Ctx = createContext<SiteData | null>(null);

/** Server-fetched live data (posts, repos, spotify, activity) for any client component. */
export function SiteDataProvider({ data, children }: { data: SiteData; children: React.ReactNode }) {
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useSiteData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSiteData outside SiteDataProvider");
  return v;
}

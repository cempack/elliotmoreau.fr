"use client";

import type { SiteData } from "@/lib/data";
import { HeroNameFx } from "@/components/HeroNameFx";

/** Placeholder — replaced by the home/desktop builder. */
export function Desktop({ data }: { data: SiteData }) {
  return (
    <div className="pt-[var(--menubar-h)]">
      <HeroNameFx className="h-[80svh] min-h-[420px]" />
      <p className="px-6 pb-40 text-body text-label-2">{data.posts[0]?.title}</p>
    </div>
  );
}

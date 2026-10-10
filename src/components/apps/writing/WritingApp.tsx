"use client";

import type { SiteData } from "@/lib/data";
import { AppWindow } from "@/components/os/AppWindow";

/** Placeholder — replaced by the writing app builder. */
export function WritingApp({ data }: { data: SiteData }) {
  return (
    <AppWindow app="writing">
      <div className="p-8 text-body text-label-2">{data.repos.length} repos · {data.posts.length} posts</div>
    </AppWindow>
  );
}

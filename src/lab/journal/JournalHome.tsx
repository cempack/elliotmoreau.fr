"use client";

import type { HomeData } from "@/lib/data";

export function JournalHome({ data }: { data: HomeData }) {
  return <main data-dir="journal">{data.posts.length} posts</main>;
}

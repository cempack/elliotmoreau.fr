"use client";

import type { HomeData } from "@/lib/data";

export function GlassHome({ data }: { data: HomeData }) {
  return <main data-dir="glass">{data.posts.length} posts</main>;
}

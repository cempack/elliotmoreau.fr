"use client";

import type { HomeData } from "@/lib/data";

export function RiceHome({ data }: { data: HomeData }) {
  return <main data-dir="rice">{data.posts.length} posts</main>;
}

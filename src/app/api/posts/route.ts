import { NextResponse } from "next/server";
import { getLatestPosts, ghostConfigured } from "@/lib/ghost";

export const revalidate = 3600;

export async function GET() {
  if (!ghostConfigured()) return NextResponse.json({ disabled: true });
  const posts = await getLatestPosts(3);
  if (posts === null) return NextResponse.json({ disabled: true });
  return NextResponse.json(
    { posts },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
  );
}

import { NextResponse } from "next/server";
import { getSpotifyStatus, spotifyConfigured } from "@/lib/spotify";

export const revalidate = 30;

export async function GET() {
  if (!spotifyConfigured()) {
    // tokens missing: stay quiet, the section hides itself
    return NextResponse.json({ disabled: true });
  }
  const status = await getSpotifyStatus();
  if (!status) return NextResponse.json({ disabled: true });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}

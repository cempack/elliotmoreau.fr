import { NextResponse } from "next/server";
import { getSpotifyStatus, spotifyConfigured } from "@/lib/spotify";
import { getLive, markContent } from "@/server/content";

export const revalidate = 30;

export async function GET() {
  // switching the music off in the admin panel reaches this cached answer at once
  await markContent();
  // tokens missing, or the music switched off in the admin panel: stay
  // quiet, the sections hide themselves
  if (!spotifyConfigured() || !getLive().showSpotify) {
    return NextResponse.json({ disabled: true });
  }
  // Spotify down or slow: the same quiet answer, never an error page
  const status = await getSpotifyStatus().catch(() => null);
  if (!status) return NextResponse.json({ disabled: true });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}

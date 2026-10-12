import { NextResponse } from "next/server";
import { getSpotifyStatus, spotifyConfigured } from "@/lib/spotify";
import { getLive } from "@/server/content";

export const revalidate = 30;

export async function GET() {
  // tokens missing, or the music switched off in the admin panel: stay
  // quiet, the sections hide themselves
  if (!spotifyConfigured() || !getLive().showSpotify) {
    return NextResponse.json({ disabled: true });
  }
  const status = await getSpotifyStatus();
  if (!status) return NextResponse.json({ disabled: true });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}

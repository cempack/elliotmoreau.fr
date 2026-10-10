import "server-only";
// Server-only Spotify helper: refresh-token flow, short cache.

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

let tokenCache: { access: string; expiresAt: number } | null = null;

export function spotifyConfigured() {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.SPOTIFY_REFRESH_TOKEN
  );
}

async function accessToken(): Promise<string | null> {
  if (!spotifyConfigured()) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.access;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN as string,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  tokenCache = {
    access: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return tokenCache.access;
}

async function sp<T>(path: string): Promise<{ status: number; json: T | null }> {
  const token = await accessToken();
  if (!token) return { status: 401, json: null };
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 204) return { status: 204, json: null };
  if (!res.ok) return { status: res.status, json: null };
  return { status: 200, json: (await res.json()) as T };
}

type SpTrack = {
  name?: string;
  artists?: { name?: string }[];
  album?: { name?: string; images?: { url?: string }[] };
  external_urls?: { spotify?: string };
  duration_ms?: number;
};
type SpNow = { is_playing?: boolean; progress_ms?: number; item?: SpTrack | null };
type SpRecent = { items?: { track?: SpTrack; played_at?: string }[] };
type SpArtists = { items?: { name?: string; images?: { url?: string }[]; external_urls?: { spotify?: string } }[] };

export type TrackInfo = {
  title: string;
  artist: string;
  album: string;
  image: string;
  url: string;
  progressMs: number;
  durationMs: number;
  playedAt?: string;
};

function toTrack(t: SpTrack | undefined, extra?: Partial<TrackInfo>): TrackInfo | null {
  if (!t?.name) return null;
  return {
    title: t.name,
    artist: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
    album: t.album?.name ?? "",
    image: t.album?.images?.[0]?.url ?? "",
    url: t.external_urls?.spotify ?? "",
    progressMs: 0,
    durationMs: t.duration_ms ?? 0,
    ...extra,
  };
}

export type SpotifyStatus = {
  now: (TrackInfo & { playing: boolean }) | null;
  recent: TrackInfo | null;
  artists: { name: string; image: string; url: string }[];
};

export async function getSpotifyStatus(): Promise<SpotifyStatus | null> {
  if (!spotifyConfigured()) return null;
  const [nowRes, recentRes, artistsRes] = await Promise.all([
    sp<SpNow>("/me/player/currently-playing"),
    sp<SpRecent>("/me/player/recently-played?limit=1"),
    sp<SpArtists>("/me/top/artists?limit=6&time_range=medium_term"),
  ]);
  if (nowRes.status === 401 || recentRes.status === 401 || artistsRes.status === 401) return null;

  let now: SpotifyStatus["now"] = null;
  if (nowRes.json?.item) {
    const track = toTrack(nowRes.json.item, {
      progressMs: nowRes.json.progress_ms ?? 0,
    });
    if (track) now = { ...track, playing: nowRes.json.is_playing !== false };
  }
  const recentItem = recentRes.json?.items?.[0];
  const recent = toTrack(recentItem?.track, { playedAt: recentItem?.played_at });
  const artists = (artistsRes.json?.items ?? [])
    .filter((a) => a.name)
    .slice(0, 5)
    .map((a) => ({
      name: a.name as string,
      image: a.images?.[0]?.url ?? "",
      url: a.external_urls?.spotify ?? "",
    }));
  return { now, recent, artists };
}

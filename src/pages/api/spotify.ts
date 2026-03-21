import type { APIRoute } from 'astro';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

async function getAccessToken(): Promise<string | null> {
  const clientId = import.meta.env.SPOTIFY_CLIENT_ID;
  const clientSecret = import.meta.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = import.meta.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function spotifyFetch(endpoint: string, token: string) {
  const res = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) return null;
  return res.json();
}

export const GET: APIRoute = async () => {
  const token = await getAccessToken();
  if (!token) {
    return new Response(JSON.stringify({ error: 'No Spotify token available' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [currentlyPlaying, topArtists, recentlyPlayed] = await Promise.all([
    spotifyFetch('/me/player/currently-playing', token),
    spotifyFetch('/me/top/artists?time_range=short_term&limit=8', token),
    spotifyFetch('/me/player/recently-played?limit=5', token),
  ]);

  return new Response(JSON.stringify({ currentlyPlaying, topArtists, recentlyPlayed }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
};

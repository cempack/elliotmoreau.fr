import type { APIRoute } from 'astro';

const DEEZER_API_BASE = 'https://api.deezer.com';
const USER_ID = '4673221262';

async function deezerFetch(endpoint: string) {
  const res = await fetch(`${DEEZER_API_BASE}${endpoint}`);
  if (!res.ok) return null;
  return res.json();
}

export const GET: APIRoute = async () => {
  try {
    // Fetch user's flow (recent tracks) - this is Deezer's equivalent of recently played
    const flow = await deezerFetch(`/user/${USER_ID}/flow?limit=5`);
    
    // Fetch user's top artists
    const topArtists = await deezerFetch(`/user/${USER_ID}/artists?limit=8`);
    
    // Fetch user's saved tracks (favorites)
    const savedTracks = await deezerFetch(`/user/${USER_ID}/tracks?limit=5`);

    // Get user profile info
    const userProfile = await deezerFetch(`/user/${USER_ID}`);

    return new Response(
      JSON.stringify({
        flow: flow?.data || [],
        topArtists: topArtists?.data || [],
        savedTracks: savedTracks?.data || [],
        user: userProfile || null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch Deezer data' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

import type { APIRoute } from 'astro';
import { fetchGithubRepos } from '../../lib/github';

export const GET: APIRoute = async () => {
  try {
    const repos = await fetchGithubRepos();

    return new Response(JSON.stringify({ repos }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    return new Response(JSON.stringify({ repos: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

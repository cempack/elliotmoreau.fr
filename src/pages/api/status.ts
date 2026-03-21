import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    // To get the actual GitHub custom status (emoji + text) without an auth token,
    // we scrape the public profile HTML.
    const res = await fetch('https://github.com/cempack', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; elliotmoreau.fr)',
      },
    });
    
    let statusText = '';
    
    if (res.ok) {
      const html = await res.text();
      // Look for the status message div in GitHub's profile HTML
      // Typically: <div class="user-status-message-wrapper..."><div ...><div>Status Text</div></div></div>
      // Or looking for the g-emoji and the text following it.
      // A safe regex that matches the status text block:
      const statusMatch = html.match(/class="user-status-message-wrapper[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/);
      
      if (statusMatch && statusMatch[1]) {
        // The inner content might have an emoji tag or just text.
        // Let's strip any HTML tags to just get the raw text + emoji characters.
        const rawStatus = statusMatch[1].replace(/<[^>]*>?/gm, '').trim();
        if (rawStatus) {
          statusText = rawStatus;
        }
      }
    }

    if (!statusText) {
      // Fallback to recent activity if no custom status is set
      const eventsRes = await fetch('https://api.github.com/users/cempack/events/public?per_page=1', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'elliotmoreau.fr',
        },
      });
      if (eventsRes.ok) {
        const events = await eventsRes.json();
        if (events.length > 0) {
          const diff = Date.now() - new Date(events[0].created_at).getTime();
          const hours = Math.floor(diff / 3600000);
          if (hours < 1) statusText = 'Active now';
          else if (hours < 24) statusText = `Active ${hours}h ago`;
        }
      }
    }

    return new Response(JSON.stringify({ status: statusText || 'Available' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    return new Response(JSON.stringify({ status: 'Available' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

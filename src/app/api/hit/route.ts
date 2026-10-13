import { env } from "@/server/env";
import { recordHit } from "@/server/stats";

/**
 * POST /api/hit: the page-view beacon (Beacon.tsx). A small text/plain JSON
 * body from this site only; always answers 204, counted or not, so a
 * visitor's browser learns nothing from it.
 */

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

function sameSite(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    if (origin === new URL(env.siteUrl).origin) return true;
  } catch {}
  const host = req.headers.get("host");
  return !!host && (origin === `https://${host}` || (process.env.NODE_ENV !== "production" && origin === `http://${host}`));
}

export async function POST(req: Request) {
  if (!sameSite(req)) return done();
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > 2048) return done();
  try {
    const body = JSON.parse(raw) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) recordHit(req, body as Record<string, unknown>);
  } catch {
    // unreadable, or the database is out of reach: not counted
  }
  return done();
}

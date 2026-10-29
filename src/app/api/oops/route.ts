import { sameSite } from "@/server/sameSite";

/**
 * POST /api/oops: a crash in a visitor's browser (lib/oops.ts), written to
 * the server log as one JSON line, so something that only breaks on
 * someone's phone can be read in the server's logs (Coolify) and fixed. What is kept:
 * the error, the first lines of its stack, the page, the last navigation
 * and the browser. No address, no identifier. Always 204.
 */

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
const clip = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : undefined);

// a broken release must not flood the log: 30 reports a minute at most
let windowStart = 0;
let count = 0;

export async function POST(req: Request) {
  if (!sameSite(req)) return done();
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > 4096) return done();
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  if (++count > 30) return done();
  try {
    const b = JSON.parse(raw) as Record<string, unknown>;
    if (!b || typeof b !== "object" || Array.isArray(b)) return done();
    console.error(
      JSON.stringify({
        event: "client_error",
        message: clip(b.m, 300),
        where: clip(b.w, 24),
        page: clip(b.p, 200),
        nav: clip(b.n, 200),
        digest: clip(b.d, 40),
        browser: clip(b.u, 200),
        stack: clip(b.s, 1800),
      })
    );
  } catch {}
  return done();
}

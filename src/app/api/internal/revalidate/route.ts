import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { revalidateContent } from "@/server/content";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Equal-length digests, so the comparison takes the same time whatever the input. */
const digest = (s: string) => createHash("sha256").update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * POST with `Authorization: Bearer <INTERNAL_SECRET>`: marks every page
 * stale so its next visit renders from the database. Called by the server
 * itself at boot (src/server/boot.ts); also handy by hand after editing the
 * database directly. Anything else gets a bare 401.
 */
export async function POST(request: Request) {
  const secret = env.internalSecret;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!secret || !token || !sameSecret(token, secret)) {
    return Response.json({ ok: false }, { status: 401, headers: NO_STORE });
  }
  revalidateContent();
  return Response.json({ ok: true }, { headers: NO_STORE });
}

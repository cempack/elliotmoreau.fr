import { db } from "@/server/db";
import { adminReady, imapReady, smtpReady } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * The deploy healthcheck (Coolify's, or any): 200 once the database opens (migrated and
 * readable), 503 otherwise, so a deploy with a broken volume never goes
 * live. The other flags say which integrations are configured. Booleans
 * only: no paths, counts or versions.
 */
export function GET() {
  let ok = false;
  try {
    db().prepare(`SELECT 1 FROM kv LIMIT 1`).get();
    ok = true;
  } catch (err) {
    console.error("[health] database:", err instanceof Error ? err.message : err);
  }
  return Response.json(
    { ok, db: ok, smtp: smtpReady(), imap: imapReady(), admin: adminReady() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}

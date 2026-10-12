import { markVisitorRead, visitorThread } from "@/server/mail";
import { json, readJson } from "@/server/mail/http";

/**
 * POST /api/mail/thread: the visitor's own threads, by token (a POST, so
 * tokens stay out of URLs and logs). Same-origin JSON only.
 * { tokens: string[] (up to 20), read?: string } → { ok, threads: { [token]: thread | null } }
 * `read` names a token whose replies the visitor has just opened.
 */
const MAX = 20;

export async function POST(req: Request) {
  const input = await readJson(req);
  if (input instanceof Response) return input;
  const tokens = Array.isArray(input.tokens) ? input.tokens.filter((t): t is string => typeof t === "string").slice(0, MAX) : [];
  if (!tokens.length) return json({ ok: false, error: "invalid" }, 400);
  if (typeof input.read === "string" && tokens.includes(input.read)) markVisitorRead(input.read);
  const threads: Record<string, ReturnType<typeof visitorThread>> = {};
  for (const t of tokens) threads[t] = visitorThread(t);
  return json({ ok: true, threads });
}

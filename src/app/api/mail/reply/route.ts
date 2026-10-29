import { visitorReply } from "@/server/mail";
import { STATUS, json, readJson, senderOf } from "@/server/mail/http";

/**
 * POST /api/mail/reply: the visitor answers in their thread on the site.
 * Same-origin JSON only. { token, body, tz?, clues? } → { ok } or { ok: false, error }.
 */
export async function POST(req: Request) {
  const input = await readJson(req);
  if (input instanceof Response) return input;
  const token = typeof input.token === "string" ? input.token : "";
  const body = typeof input.body === "string" ? input.body : "";
  const sender = senderOf(req, input);
  const res = await visitorReply(token, body, sender.ip, sender);
  if (!res.ok) return json({ ok: false, error: res.error }, STATUS[res.error] ?? 400);
  return json({ ok: true });
}

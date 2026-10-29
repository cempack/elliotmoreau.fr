import { sendFromVisitor } from "@/server/mail";
import { STATUS, json, readJson, senderOf } from "@/server/mail/http";

/**
 * POST /api/mail/send: the Mail app's Send. Same-origin JSON only.
 * { email, name?, subject, body, lang, elapsed, hp, ts?, tz?, clues? } → { ok, token } or { ok: false, error }.
 * `elapsed` is how long the letter took to write (ms, measured in the
 * browser, so a wrong clock doesn't matter); `hp` is the hidden field only
 * bots fill in; `ts` the Turnstile token; `tz` the browser's time zone and
 * `clues` what it says about itself and the visit. Who sent it (IP, every
 * header, Cloudflare's location, the clues) is kept for the admin.
 */
export async function POST(req: Request) {
  const input = await readJson(req);
  if (input instanceof Response) return input;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const elapsed = typeof input.elapsed === "number" && Number.isFinite(input.elapsed) ? input.elapsed : 0;
  const sender = senderOf(req, input);
  const res = await sendFromVisitor({
    email: str("email") ?? "",
    name: str("name"),
    subject: str("subject") ?? "",
    body: str("body") ?? "",
    lang: input.lang === "fr" ? "fr" : "en",
    ip: sender.ip,
    sender,
    turnstile: input.ts,
    startedAt: Date.now() - Math.max(0, elapsed),
    honeypot: str("hp"),
  });
  if (!res.ok) return json({ ok: false, error: res.error }, STATUS[res.error] ?? 400);
  return json({ ok: true, token: res.token });
}

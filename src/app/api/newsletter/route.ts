import { subscribeEmail } from "@/lib/ghost";
import { saltedHash } from "@/server/mail/crypto";
import { clientIp, json, readJson } from "@/server/mail/http";
import { takeRate } from "@/server/mail/rate";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOUR = 3_600_000;

/**
 * POST /api/newsletter: the Blog's Subscribe. Same-origin JSON only.
 * { email } → { ok, already? } or { ok: false, reason }. The Ghost member
 * is created straight away (the Admin API sends no confirmation), so
 * sign-ups are held to five an hour from one address and fifty a day in
 * all: nobody can script the list full of other people's email.
 */
export async function POST(req: Request) {
  const input = await readJson(req);
  if (input instanceof Response) return input;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_RE.test(email)) return json({ ok: false, reason: "invalid" }, 400);
  try {
    const allowed = takeRate([
      { key: `news:ip:${saltedHash(clientIp(req))}`, max: 5, windowMs: HOUR },
      { key: "news:all", max: 50, windowMs: 24 * HOUR },
    ]);
    if (!allowed) return json({ ok: false, reason: "rate" }, 429);
  } catch {
    return json({ ok: false, reason: "error" }, 503);
  }
  const result = await subscribeEmail(email);
  if (result === "subscribed") return json({ ok: true });
  if (result === "exists") return json({ ok: true, already: true });
  if (result === "misconfigured") return json({ ok: false, reason: "misconfigured" }, 503);
  return json({ ok: false, reason: "error" }, 502);
}

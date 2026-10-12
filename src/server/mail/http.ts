import "server-only";
import { env } from "../env";

/**
 * Guards shared by the /api/mail route handlers: same-origin POSTs only,
 * JSON only, small bodies, and the client's IP as Railway's edge reports
 * it. Errors are generic on purpose.
 */

const MAX_BODY = 32 * 1024;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** the page's origin, or (outside production) whatever host the request came to */
function allowedOrigins(req: Request) {
  const out = new Set<string>();
  try {
    out.add(new URL(env.siteUrl).origin);
  } catch {}
  if (process.env.NODE_ENV !== "production") {
    const host = req.headers.get("host");
    if (host) {
      out.add(`http://${host}`);
      out.add(`https://${host}`);
    }
  }
  return out;
}

/**
 * Reads a same-origin JSON POST. Returns the parsed object, or a Response
 * to send back as is (403 foreign origin, 415 not JSON, 413 too big, 400
 * unreadable).
 */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(req).has(origin)) return json({ ok: false, error: "forbidden" }, 403);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return json({ ok: false, error: "invalid" }, 415);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ ok: false, error: "invalid" }, 413);
  let text: string;
  try {
    text = await req.text();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (text.length > MAX_BODY) return json({ ok: false, error: "invalid" }, 413);
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return json({ ok: false, error: "invalid" }, 400);
    return v as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
}

/** Railway's edge sets X-Real-IP (and replaces any copy a client sends) */
export function clientIp(req: Request) {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

/** HTTP status for each error the mail API can return */
export const STATUS: Record<string, number> = { invalid: 400, notfound: 404, rate: 429, unavailable: 503, failed: 502 };

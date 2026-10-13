/**
 * Whether a POST comes from this site's own pages (the beacons: /api/hit,
 * /api/oops). Browsers send Origin on POSTs; without it, Sec-Fetch-Site.
 */
import { env } from "@/server/env";

export function sameSite(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    if (origin === new URL(env.siteUrl).origin) return true;
  } catch {}
  const host = req.headers.get("host");
  return !!host && (origin === `https://${host}` || (process.env.NODE_ENV !== "production" && origin === `http://${host}`));
}

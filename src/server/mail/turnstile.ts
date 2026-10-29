import "server-only";
import crypto from "node:crypto";
import { env, turnstileReady } from "../env";

/**
 * Cloudflare Turnstile, checked server-side before a visitor's letter is
 * stored: the page gets a token from the widget (invisible for almost
 * everyone, a checkbox only when Cloudflare isn't sure) and Siteverify says
 * whether it is real, unused, for this site and for the Mail app's Send.
 * Off until both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** the widget's `action` (Compose's useTurnstile) */
export const TURNSTILE_ACTION = "contact";

/** Cloudflare's test secrets (1x…AA passes, 2x… fails, 3x… spent): they answer for any host and action */
const TEST_SECRET = /^[123]x0{30,}A{2}$/;

type Verdict = { success: boolean; hostname?: string; action?: string; "error-codes"?: string[] };

const state = globalThis as unknown as { __emosTurnstileTest?: (token: string) => Verdict };

/** tests only: answer Siteverify's question without the network */
export function useTestVerifier(fn: ((token: string) => Verdict) | null) {
  if (process.env.EMOS_MAIL_TEST !== "1") throw new Error("useTestVerifier is for tests only");
  state.__emosTurnstileTest = fn ?? undefined;
}

function siteHost() {
  try {
    return new URL(env.siteUrl).hostname;
  } catch {
    return "";
  }
}

export const turnstileOn = () => Boolean(state.__emosTurnstileTest) || turnstileReady();

/**
 * "passed", "off" (not set up), or why it was refused: "verify" (no token,
 * a bad or spent one, another site's) or "unreachable" (Cloudflare didn't answer).
 */
export async function checkTurnstile(token: unknown, ip: string): Promise<"passed" | "off" | "verify" | "unreachable"> {
  if (!turnstileOn()) return "off";
  if (typeof token !== "string" || !token || token.length > 2048) return "verify";
  let v: Verdict;
  if (state.__emosTurnstileTest) v = state.__emosTurnstileTest(token);
  else {
    try {
      const res = await fetch(SITEVERIFY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.turnstile.secret,
          response: token,
          ...(ip && ip !== "unknown" ? { remoteip: ip } : {}),
          idempotency_key: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      v = (await res.json()) as Verdict;
    } catch (e) {
      console.error("[mail] Turnstile siteverify:", (e as Error)?.message ?? e);
      return "unreachable";
    }
  }
  if (!v.success) {
    const codes = v["error-codes"] ?? [];
    // a wrong secret is the site's fault, not the visitor's: say so in the log
    if (codes.some((c) => c.includes("secret"))) console.error("[mail] Turnstile:", codes.join(", "), "(check TURNSTILE_SECRET_KEY)");
    return "verify";
  }
  // test answers may leave the action and host out
  const real = !state.__emosTurnstileTest && !TEST_SECRET.test(env.turnstile.secret ?? "");
  if ((real || v.action) && v.action !== TURNSTILE_ACTION) return "verify";
  // a token solved on another site that uses the same widget
  if (real && v.hostname !== siteHost()) return "verify";
  return "passed";
}

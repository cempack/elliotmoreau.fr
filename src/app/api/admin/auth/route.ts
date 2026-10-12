import {
  authState,
  currentSession,
  loginOptions,
  loginVerify,
  logout,
  readAdminJson,
  registerOptions,
  registerVerify,
} from "@/server/auth";
import { json } from "@/server/mail/http";

/**
 * POST /api/admin/auth: signing in and out of the admin panel.
 * { op: "state" | "login.options" | "login.verify" | "register.options" |
 *   "register.verify" | "logout", … } → { ok, … }. Same-origin JSON only;
 * errors stay generic.
 */
const STATUS: Record<string, number> = { forbidden: 403, invalid: 400, locked: 429, setup: 409, failed: 401, unavailable: 503 };

export async function POST(req: Request) {
  const body = await readAdminJson(req);
  if (body instanceof Response) return body;
  try {
    const session = await currentSession();
    let res: { ok: boolean; error?: string } & Record<string, unknown>;
    switch (body.op) {
      case "state":
        return json({ ok: true, ...authState(session) });
      case "login.options":
        res = await loginOptions(req);
        break;
      case "login.verify":
        res = await loginVerify(req, body.response);
        break;
      case "register.options":
        res = await registerOptions(req, session, { setupToken: body.setupToken, recoveryCode: body.recoveryCode });
        break;
      case "register.verify":
        res = await registerVerify(req, session, body.response);
        break;
      case "logout":
        await logout(session, req);
        return json({ ok: true });
      default:
        return json({ ok: false, error: "invalid" }, 400);
    }
    return json(res, res.ok ? 200 : (STATUS[res.error ?? ""] ?? 400));
  } catch (err) {
    console.error("[admin] auth failed", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}

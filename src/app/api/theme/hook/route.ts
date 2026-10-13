import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { THEME_TAG } from "@/lib/theme-source";
import { warmPages } from "@/server/warm";

/**
 * GitHub webhook for the Dos Moos theme repo: a push re-reads the palette
 * now instead of within ten minutes. Set it up in the theme repo →
 * Settings → Webhooks: payload URL https://elliotmoreau.fr/api/theme/hook,
 * content type application/json, secret = THEME_WEBHOOK_SECRET, "Just the
 * push event". Without the secret set, the hook is off (404).
 */
export async function POST(req: Request) {
  const secret = process.env.THEME_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  const body = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const want = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const ok = sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  if (!ok) return new Response("bad signature", { status: 401 });
  const event = req.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true, pong: true });
  if (event !== "push") return Response.json({ ok: true, ignored: event });
  revalidateTag(THEME_TAG, { expire: 0 });
  revalidatePath("/", "layout");
  warmPages();
  return Response.json({ ok: true, revalidated: true });
}

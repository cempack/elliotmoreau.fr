import { createHmac } from "node:crypto";

// Server-only Ghost wiring: latest posts over the public Content API,
// newsletter signup over the Admin API (the admin key must never leave
// the server — this module is only imported by server components/routes).

const API_URL = (process.env.GHOST_API_URL ?? "").replace(/\/$/, "");
const CONTENT_KEY = process.env.GHOST_CONTENT_KEY ?? "";
const ADMIN_KEY = process.env.GHOST_ADMIN_KEY ?? "";
export const BLOG_URL = (process.env.NEXT_PUBLIC_BLOG_URL ?? API_URL).replace(/\/$/, "");

export type GhostPost = {
  title: string;
  slug: string;
  excerpt: string;
  published_at: string;
  reading_time: number;
  feature_image: string | null;
  url: string;
  tags: { name: string; slug: string }[];
};

export function ghostConfigured() {
  return Boolean(API_URL && CONTENT_KEY);
}

export async function getLatestPosts(limit = 3): Promise<GhostPost[] | null> {
  if (!ghostConfigured()) return null;
  try {
    const u =
      `${API_URL}/ghost/api/content/posts/` +
      `?key=${encodeURIComponent(CONTENT_KEY)}&limit=${limit}` +
      `&fields=title,slug,excerpt,published_at,reading_time,feature_image,url` +
      `&include=tags&order=${encodeURIComponent("published_at desc")}`;
    const res = await fetch(u, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { posts?: GhostPost[] };
    return json.posts ?? [];
  } catch {
    return null;
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url");

// Ghost Admin API auth: short-lived HS256 JWT, `Ghost <token>`.
function adminToken(): string | null {
  const sep = ADMIN_KEY.indexOf(":");
  if (sep < 1) return null;
  const id = ADMIN_KEY.slice(0, sep);
  const secret = ADMIN_KEY.slice(sep + 1);
  if (!id || !secret) return null;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id })));
  const payload = b64url(
    Buffer.from(JSON.stringify({ iat, exp: iat + 5 * 60, aud: "/admin/" }))
  );
  const sig = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export type SubscribeResult = "subscribed" | "exists" | "misconfigured" | "error";

export async function subscribeEmail(email: string): Promise<SubscribeResult> {
  if (!API_URL) return "misconfigured";
  const token = adminToken();
  if (!token) return "misconfigured";
  try {
    const res = await fetch(`${API_URL}/ghost/api/admin/members/`, {
      method: "POST",
      headers: {
        Authorization: `Ghost ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ members: [{ email, subscribed: true }] }),
    });
    if (res.status === 201) return "subscribed";
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as {
        errors?: { context?: string; message?: string }[];
      } | null;
      const ctx = `${body?.errors?.[0]?.context ?? ""} ${body?.errors?.[0]?.message ?? ""}`;
      if (/already|exists|member/i.test(ctx)) return "exists";
      return "error";
    }
    return "error";
  } catch {
    return "error";
  }
}

import { NextResponse } from "next/server";
import { subscribeEmail } from "@/lib/ghost";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const result = await subscribeEmail(email);
  if (result === "subscribed") return NextResponse.json({ ok: true });
  if (result === "exists") return NextResponse.json({ ok: true, already: true });
  if (result === "misconfigured") {
    return NextResponse.json({ ok: false, reason: "misconfigured" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, reason: "error" }, { status: 502 });
}

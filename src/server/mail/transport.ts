import "server-only";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { db } from "../db";
import { env, smtpReady } from "../env";
import { MSGID_DOMAIN, tlsFor } from "./config";

/**
 * Outgoing mail through SMTP (Proton Mail Bridge on the server's private
 * network). One transporter for the process, built on first use; a send
 * that fails is reported to the caller, never retried silently, so the
 * site only ever says "delivered" for mail the server accepted.
 */

type State = { transporter?: Transporter; key?: string; testTransport?: Transporter };
const g = globalThis as unknown as { __emosSmtp?: State };
const state = (g.__emosSmtp ??= {});

function transporter(): Transporter | null {
  if (state.testTransport) return state.testTransport;
  if (!smtpReady()) return null;
  const { host, port, user, pass, secure } = env.smtp;
  const key = `${host}:${port}:${user}:${secure}`;
  if (state.transporter && state.key === key) return state.transporter;
  state.transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: user!, pass: pass! },
    tls: tlsFor(host!),
    // our name in EHLO, rather than the container's
    name: MSGID_DOMAIN,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  state.key = key;
  return state.transporter;
}

export type Delivery = { ok: true } | { ok: false; error: string };

/** a short, secret-free reason for logs and the admin panel */
function reason(e: unknown) {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const msg = (err.message ?? String(e)).replace(/\s+/g, " ").slice(0, 200);
  return [err.code, err.responseCode, msg].filter(Boolean).join(" ");
}

/**
 * How the last send went, kept in the database so the admin panel sees it
 * from any process and after a restart; a success clears the error.
 */
function record(ok: boolean, message?: string) {
  try {
    db()
      .prepare(`INSERT INTO mail_kv (key, value) VALUES ('smtp_last', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
      .run(JSON.stringify({ at: new Date().toISOString(), ok, message: message ?? null }));
  } catch {}
}

export async function deliver(mail: SendMailOptions): Promise<Delivery> {
  const t = transporter();
  if (!t) return { ok: false, error: "unavailable" };
  try {
    await t.sendMail(mail);
    record(true);
    return { ok: true };
  } catch (e) {
    const message = reason(e);
    record(false, message);
    console.error("[mail] send failed:", message);
    return { ok: false, error: message };
  }
}

/** the last send's error, while it is the latest outcome */
export function lastSmtpError(): { at: string; message: string } | undefined {
  try {
    const row = db().prepare(`SELECT value FROM mail_kv WHERE key = 'smtp_last'`).get() as { value: string } | undefined;
    if (!row) return undefined;
    const v = JSON.parse(row.value) as { at: string; ok: boolean; message: string | null };
    return v.ok ? undefined : { at: v.at, message: v.message ?? "send failed" };
  } catch {
    return undefined;
  }
}

/**
 * Tests only: send through an in-memory transport (nodemailer's
 * streamTransport) instead of SMTP. Refused unless EMOS_MAIL_TEST=1.
 */
export function useTestTransport(t: Transporter | null) {
  if (process.env.EMOS_MAIL_TEST !== "1") throw new Error("useTestTransport is for tests only");
  state.testTransport = t ?? undefined;
}

/** whether the site can send at all (configured, or a test transport) */
export function canSend() {
  return Boolean(state.testTransport) || smtpReady();
}

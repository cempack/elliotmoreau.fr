import "server-only";
import { env } from "../env";

/** the domain in every Message-ID we mint: <m.<id>@elliotmoreau.fr> */
export const MSGID_DOMAIN = "elliotmoreau.fr";

/** field limits (characters) */
export const LIMITS = { name: 80, email: 254, subject: 160, body: 10_000 } as const;

/** a letter written faster than this is a script */
export const MIN_COMPOSE_MS = 3_000;

/**
 * Abuse limits. Windows are fixed (an hour, a day); a send counts against
 * every limit it touches, and is refused if any is already full.
 */
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const RATE = {
  sendPerIpHour: 5,
  sendPerIpDay: 15,
  sendPerEmailDay: 5,
  replyPerIpHour: 10,
  replyPerIpDay: 30,
  replyPerThreadDay: 20,
  globalDay: 200,
} as const;

/** the visitor's private link to their thread (also what admin replies carry) */
export function threadLink(token: string, lang: "en" | "fr") {
  return `${env.siteUrl}${lang === "fr" ? "/fr" : ""}/contact?thread=${token}`;
}

/** the thread in the admin panel, for the email Elliot gets */
export function adminLink(threadId: string) {
  return `${env.siteUrl}/admin?thread=${encodeURIComponent(threadId)}`;
}

/** Elliot's own addresses: a visitor can't write "from" one, and mail from them is never a visitor's */
export function elliotAddresses() {
  return new Set([env.mailTo, env.mailFrom].map((a) => a.toLowerCase()));
}

/**
 * TLS for SMTP/IMAP. Proton Mail Bridge presents a self-signed
 * certificate, which can't be verified; that is expected on Railway's
 * private network (WireGuard-encrypted, `*.railway.internal`) and on
 * localhost, so verification is off there and on everywhere else.
 * MAIL_TLS_INSECURE=true forces it off (another private host name).
 */
export function tlsFor(host: string) {
  const privateHost =
    /\.railway\.internal$/i.test(host) || /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/i.test(host) || process.env.MAIL_TLS_INSECURE === "true";
  return privateHost ? { rejectUnauthorized: false } : { rejectUnauthorized: true, servername: host };
}

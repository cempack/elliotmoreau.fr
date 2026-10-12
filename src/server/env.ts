import "server-only";
import path from "node:path";

/**
 * Server configuration, read from the environment once. Nothing here is
 * ever sent to the browser. Every integration is optional: without its
 * variables the site keeps working and the feature reports "not set up".
 *
 * Railway sets these on the web service (see docs/RAILWAY.md); locally,
 * put them in .env.local.
 */
const str = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};
const int = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};

export const env = {
  /** the SQLite file: a Railway volume in production (/data/emos.db), ./.data locally */
  databasePath: str("DATABASE_PATH") ?? path.join(process.cwd(), ".data", "emos.db"),

  /** public origin, e.g. https://elliotmoreau.fr (passkeys and mail links are bound to it) */
  siteUrl: (str("SITE_URL") ?? "http://localhost:3000").replace(/\/$/, ""),

  /** admin: signs session cookies; 32+ random bytes, base64 */
  sessionSecret: str("SESSION_SECRET"),
  /** admin: one-time token that allows registering the first passkey */
  adminSetupToken: str("ADMIN_SETUP_TOKEN"),

  /** outgoing mail (Proton Mail Bridge's SMTP on Railway's private network) */
  smtp: {
    host: str("SMTP_HOST"),
    port: int("SMTP_PORT", 1025),
    user: str("SMTP_USER"),
    pass: str("SMTP_PASS"),
    /** "true" for implicit TLS (465); Bridge uses STARTTLS on 1025 */
    secure: str("SMTP_SECURE") === "true",
  },
  /** incoming mail (Bridge's IMAP), read to pick up replies */
  imap: {
    host: str("IMAP_HOST"),
    port: int("IMAP_PORT", 1143),
    user: str("IMAP_USER"),
    pass: str("IMAP_PASS"),
    secure: str("IMAP_SECURE") === "true",
    /** folder names differ by provider; Bridge uses these */
    inbox: str("IMAP_INBOX") ?? "INBOX",
    sent: str("IMAP_SENT") ?? "Sent",
    pollSeconds: int("IMAP_POLL_SECONDS", 120),
  },
  /** the address visitors write to, and send-as */
  mailTo: str("MAIL_TO") ?? "hello@elliotm.fr",
  mailFrom: str("MAIL_FROM") ?? str("MAIL_TO") ?? "hello@elliotm.fr",

  /** shared secret for internal calls (boot-time revalidation) */
  internalSecret: str("INTERNAL_SECRET") ?? str("SESSION_SECRET"),
};

export const smtpReady = () => Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
export const imapReady = () => Boolean(env.imap.host && env.imap.user && env.imap.pass);
export const adminReady = () => Boolean(env.sessionSecret);

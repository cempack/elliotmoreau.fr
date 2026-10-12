import "server-only";
import type { SendMailOptions } from "nodemailer";
import { env } from "../env";
import { MSGID_DOMAIN, adminLink, threadLink } from "./config";
import { replySubject } from "./strip";

/**
 * The emails the site sends, as nodemailer messages. Plain text only.
 * Every one carries our Message-ID and two headers (X-Emos-Thread,
 * X-Emos-Message) so the copies Proton files in Sent and Inbox are
 * recognised as ours when the IMAP poller reads them back.
 */

export type MailThread = { id: string; name: string; email: string; subject: string; lang: "en" | "fr" };

export const messageIdFor = (rowId: string) => `<m.${rowId}@${MSGID_DOMAIN}>`;

/** the subject on the wire: a letter without one still needs something to thread on */
export function mailSubject(t: Pick<MailThread, "subject" | "lang">) {
  return t.subject || (t.lang === "fr" ? "(sans objet)" : "(no subject)");
}

/** References stay short: the first letter and the latest ones (RFC 5322 allows trimming the middle) */
export function referencesFor(ids: string[]) {
  return ids.length <= 20 ? ids : [ids[0], ...ids.slice(-19)];
}

const who = (t: Pick<MailThread, "name" | "email">) => (t.name ? `${t.name} <${t.email}>` : t.email);

/** a visitor's letter (new, or a reply written on the site), to Elliot; Reply-To is the visitor */
export function visitorMail(t: MailThread, msg: { id: string; body: string }, prior: string[]): SendMailOptions {
  const messageId = messageIdFor(msg.id);
  const text = [
    msg.body,
    "",
    "-- ",
    `${who(t)} · elliotmoreau.fr · ${t.lang.toUpperCase()}`,
    "Reply to this email to answer: the reply shows on the site too.",
    `Thread: ${adminLink(t.id)}`,
  ].join("\n");
  return {
    from: { name: `emOS · ${t.name || t.email}`, address: env.mailFrom },
    to: env.mailTo,
    replyTo: t.name ? { name: t.name, address: t.email } : t.email,
    subject: prior.length ? replySubject(mailSubject(t)) : mailSubject(t),
    messageId,
    inReplyTo: prior.length ? prior[prior.length - 1] : undefined,
    references: prior.length ? referencesFor(prior) : undefined,
    headers: { "X-Emos-Thread": t.id, "X-Emos-Message": messageId },
    text,
  };
}

function attribution(at: string, name: string, lang: "en" | "fr") {
  const date = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Paris",
  }).format(new Date(at));
  return lang === "fr" ? `Le ${date}, ${name} a écrit\u00a0:` : `On ${date}, ${name} wrote:`;
}

/**
 * Elliot's reply from the admin panel, to the visitor: his text, a footer
 * with the visitor's private link back to the thread, and the letter he
 * is answering quoted underneath, as any mail app would.
 */
export function adminMail(
  t: MailThread,
  msg: { id: string; body: string },
  prior: string[],
  token: string | null,
  quoted?: { body: string; at: string }
): SendMailOptions {
  const messageId = messageIdFor(msg.id);
  const fr = t.lang === "fr";
  const lines = [msg.body, "", "-- ", "Elliot Moreau · elliotmoreau.fr"];
  if (token) lines.push(`${fr ? "Lire et répondre sur le site\u00a0:" : "Read and reply on the site:"} ${threadLink(token, t.lang)}`);
  if (quoted) {
    lines.push("", attribution(quoted.at, who(t), t.lang), ...quoted.body.split("\n").map((l) => (l ? `> ${l}` : ">")));
  }
  return {
    from: { name: "Elliot Moreau", address: env.mailFrom },
    to: t.name ? { name: t.name, address: t.email } : t.email,
    subject: replySubject(mailSubject(t)),
    messageId,
    inReplyTo: prior.length ? prior[prior.length - 1] : undefined,
    references: prior.length ? referencesFor(prior) : undefined,
    headers: { "X-Emos-Thread": t.id, "X-Emos-Message": messageId },
    text: lines.join("\n"),
  };
}

/** the admin panel's "Send test email" */
export function testMail(): SendMailOptions {
  const at = new Date().toISOString();
  return {
    from: { name: "emOS", address: env.mailFrom },
    to: env.mailTo,
    subject: "emOS test email",
    messageId: `<test.${Date.now().toString(36)}@${MSGID_DOMAIN}>`,
    text: `If you can read this, elliotmoreau.fr can send mail.\n\nSent ${at} from ${env.siteUrl}.`,
  };
}

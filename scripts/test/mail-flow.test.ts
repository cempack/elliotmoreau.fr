/**
 * The mail module end to end, minus the network: a visitor's letter, its
 * email to Elliot, the visitor's view, an admin reply and the visitor's
 * answer, then the IMAP side, with fixture messages (raw RFC 5322, parsed
 * by mailparser as the poller does) for every case the matcher handles.
 * Mail goes to an in-memory transport (EMOS_MAIL_TEST=1 only).
 *
 *   npx tsx --conditions=react-server --test scripts/test/mail-flow.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleParser, type ParsedMail } from "mailparser";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emos-mail-"));
Object.assign(process.env, {
  DATABASE_PATH: path.join(dir, "test.db"),
  SITE_URL: "https://elliotmoreau.fr",
  SESSION_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
  MAIL_TO: "hello@elliotm.fr",
  MAIL_FROM: "hello@elliotm.fr",
  EMOS_MAIL_TEST: "1",
});
for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "IMAP_HOST", "IMAP_USER", "IMAP_PASS"]) delete process.env[k];

type Mail = typeof import("../../src/server/mail");
type Match = typeof import("../../src/server/mail/match");
type Crypto = typeof import("../../src/server/mail/crypto");
type Outbox = typeof import("../../src/server/mail/outbox");
let mail: Mail;
let outboxMod: Outbox;
let match: Match;
let crypto: Crypto;
const outbox: string[] = [];
let failNext = false;

before(async () => {
  mail = await import("../../src/server/mail");
  match = await import("../../src/server/mail/match");
  crypto = await import("../../src/server/mail/crypto");
  outboxMod = await import("../../src/server/mail/outbox");
  const nodemailer = (await import("nodemailer")).default;
  const { useTestTransport } = await import("../../src/server/mail/transport");
  // a custom nodemailer transport that keeps each built message
  const capture = {
    name: "capture",
    version: "1",
    send(m: { message: { build(cb: (err: Error | null, msg: Buffer) => void): void } }, cb: (err: Error | null, info?: unknown) => void) {
      if (failNext) {
        failNext = false;
        return cb(new Error("421 try again later"));
      }
      m.message.build((err, msg) => {
        if (err) return cb(err);
        outbox.push(msg.toString("utf8"));
        cb(null, { messageId: "x" });
      });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useTestTransport(nodemailer.createTransport(capture as any));
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

/** letters are stored first and emailed from the outbox: wait for it */
const settle = () => outboxMod.settled();
const last = async (): Promise<ParsedMail> => {
  await settle();
  return simpleParser(outbox[outbox.length - 1]);
};
const raw = () => outbox[outbox.length - 1];
const OLD = Date.now() - 60_000;
let ipCounter = 0;
const ip = () => `203.0.113.${++ipCounter}`;

const letter = (over: Partial<Parameters<Mail["sendFromVisitor"]>[0]> = {}) => ({
  name: "Jane Doe",
  email: "jane@example.com",
  subject: "A project idea",
  body: "Hi Elliot,\n\nI'm building a small atlas app. Could we talk?\n\nJane",
  lang: "en" as const,
  ip: ip(),
  startedAt: OLD,
  ...over,
});

let token = "";
let threadId = "";
let firstMessageId = "";

test("refuses what it should, generically", async () => {
  const bad = [
    letter({ honeypot: "http://spam" }),
    letter({ startedAt: Date.now() - 500 }),
    letter({ email: "not-an-email" }),
    letter({ email: "jane@example.com\r\nBcc: x@y.z" }),
    letter({ name: "Jane\nBcc: x@y.z" }),
    letter({ subject: "Hi\r\nBcc: x@y.z" }),
    letter({ body: "   " }),
    letter({ body: "x".repeat(10_001) }),
    letter({ subject: "s".repeat(161) }),
    letter({ name: "n".repeat(81) }),
    letter({ email: "hello@elliotm.fr" }),
  ];
  for (const b of bad) {
    const r = await mail.sendFromVisitor(b);
    assert.deepEqual(r, { ok: false, error: "invalid" }, JSON.stringify(b).slice(0, 120));
  }
  assert.equal(outbox.length, 0, "nothing was sent");
});

test("a visitor's letter is stored, then emailed to Elliot with the right headers", async () => {
  const r = await mail.sendFromVisitor(letter());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  token = r.token;
  threadId = r.threadId;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const m = await last();
  assert.equal(m.from?.value[0].address, "hello@elliotm.fr");
  assert.equal(m.from?.value[0].name, "emOS · Jane Doe");
  assert.equal(m.to && !Array.isArray(m.to) ? m.to.value[0].address : "", "hello@elliotm.fr");
  assert.equal(m.replyTo?.value[0].address, "jane@example.com");
  assert.equal(m.subject, "A project idea");
  assert.match(m.messageId ?? "", /^<m\.[0-9a-f]{20}@elliotmoreau\.fr>$/);
  firstMessageId = m.messageId!;
  assert.equal(m.headers.get("x-emos-thread"), threadId);
  assert.equal(m.headers.get("x-emos-message"), firstMessageId);
  assert.ok(m.text?.includes("I'm building a small atlas app."));
  assert.ok(m.text?.includes(`https://elliotmoreau.fr/admin?thread=${threadId}`));
  assert.ok(!m.html, "plain text only");

  const t = mail.getThread(threadId)!;
  assert.equal(t.status, "open");
  assert.equal(t.adminUnread, 1);
  assert.equal(t.messages?.length, 1);
  assert.equal(t.messages?.[0].source, "site");
});

test("the visitor's view never includes their address", () => {
  const v = mail.visitorThread(token)!;
  assert.ok(v);
  assert.equal(v.subject, "A project idea");
  assert.equal("email" in v, false);
  assert.equal("adminUnread" in v, false);
  assert.equal(v.messages.length, 1);
  assert.equal(v.messages[0].direction, "in");
  assert.equal(mail.visitorThread("x".repeat(43)), null);
  assert.equal(mail.visitorThread("short"), null);
});

test("tokens are stored hashed and encrypted, never in the clear", async () => {
  const { db } = await import("../../src/server/db");
  const row = db().prepare(`SELECT token_hash, token_enc FROM threads WHERE id = ?`).get(threadId) as { token_hash: string; token_enc: string };
  assert.equal(row.token_hash, crypto.hashToken(token));
  assert.notEqual(row.token_enc, token);
  assert.equal(crypto.decryptToken(row.token_enc), token);
  const [v, iv, ct, tag] = row.token_enc.split(".");
  assert.equal(crypto.decryptToken([v, iv, ct.slice(0, -2) + "AA", tag].join(".")), null, "tampering is detected");
});

test("listThreads and admin helpers", () => {
  const inbox = mail.listThreads({ status: "inbox" });
  assert.ok(inbox.some((t) => t.id === threadId));
  mail.markThreadRead(threadId);
  assert.equal(mail.getThread(threadId)?.adminUnread, 0);
});

let adminMessageId = "";
test("adminReply emails the visitor, threaded, with their link and the quote", async () => {
  const r = await mail.adminReply(threadId, "Hi Jane,\n\nHappy to. Thursday at 10?\n\nElliot");
  assert.deepEqual(r, { ok: true });
  const m = await last();
  assert.equal(m.to && !Array.isArray(m.to) ? m.to.value[0].address : "", "jane@example.com");
  assert.equal(m.from?.value[0].address, "hello@elliotm.fr");
  assert.equal(m.from?.value[0].name, "Elliot Moreau");
  assert.equal(m.subject, "Re: A project idea");
  assert.equal(m.inReplyTo, firstMessageId);
  assert.deepEqual([m.references].flat(), [firstMessageId]);
  adminMessageId = m.messageId!;
  assert.ok(m.text?.includes(`Read and reply on the site: https://elliotmoreau.fr/contact?thread=${token}`));
  assert.ok(m.text?.includes("> I'm building a small atlas app."));
  assert.match(raw(), /wrote:/);

  const t = mail.getThread(threadId)!;
  assert.equal(t.status, "answered");
  const v = mail.visitorThread(token)!;
  assert.equal(v.messages.length, 2);
  assert.equal(v.messages[1].direction, "out");
  assert.equal(v.messages[1].source, "admin");
  assert.equal(v.messages[1].body, "Hi Jane,\n\nHappy to. Thursday at 10?\n\nElliot");
  assert.equal(v.visitorUnread, 1);
  mail.markVisitorRead(token);
  assert.equal(mail.visitorThread(token)?.visitorUnread, 0);
});

test("our own admin email, read back through IMAP, strips to what Elliot wrote", async () => {
  const { stripQuoted } = await import("../../src/server/mail/strip");
  await settle();
  const m = await simpleParser(raw());
  assert.equal(stripQuoted(m.text ?? ""), "Hi Jane,\n\nHappy to. Thursday at 10?\n\nElliot");
});

test("a reply written on the site goes to Elliot, threaded, and reopens the thread", async () => {
  const r = await mail.visitorReply(token, "Thursday at 10 works. Talk then!", ip());
  assert.deepEqual(r, { ok: true });
  const m = await last();
  assert.equal(m.to && !Array.isArray(m.to) ? m.to.value[0].address : "", "hello@elliotm.fr");
  assert.equal(m.replyTo?.value[0].address, "jane@example.com");
  assert.equal(m.subject, "Re: A project idea");
  assert.equal(m.inReplyTo, adminMessageId);
  assert.deepEqual([m.references].flat(), [firstMessageId, adminMessageId]);
  const t = mail.getThread(threadId)!;
  assert.equal(t.status, "open");
  assert.equal(t.adminUnread, 1);
  assert.equal(t.messages?.length, 3);
  assert.deepEqual(await mail.visitorReply("y".repeat(43), "hi", ip()), { ok: false, error: "notfound" });
  assert.deepEqual(await mail.visitorReply(token, "  ", ip()), { ok: false, error: "invalid" });
});

test("a failed SMTP send keeps the letter, shows the error, and goes on the retry", async () => {
  const before = mail.listThreads().length;
  failNext = true;
  const r = await mail.sendFromVisitor(letter({ email: "fail@example.com" }));
  assert.equal(r.ok, true, "stored: the visitor hears it's sent");
  if (!r.ok) return;
  await settle();
  assert.equal(mail.listThreads().length, before + 1);
  const msg = mail.getThread(r.threadId)!.messages![0];
  assert.match(msg.error ?? "", /421/);
  assert.match(mail.mailHealth().lastError ?? "", /smtp: .*421/);
  const sentBefore = outbox.length;
  assert.equal(await outboxMod.deliverStored(msg.id), true, "the retry goes");
  assert.equal(outbox.length, sentBefore + 1);
  assert.equal(mail.getThread(r.threadId)!.messages![0].error, undefined, "and the error clears");
  assert.equal(await outboxMod.deliverStored(msg.id), true, "a sent letter isn't sent twice");
  assert.equal(outbox.length, sentBefore + 1);
});

test("rate limits: 5 an hour per IP, 5 a day per address", async () => {
  const sameIp = "198.51.100.7";
  for (let i = 0; i < 5; i++) assert.equal((await mail.sendFromVisitor(letter({ ip: sameIp, email: `r${i}@example.com` }))).ok, true);
  assert.deepEqual(await mail.sendFromVisitor(letter({ ip: sameIp, email: "r9@example.com" })), { ok: false, error: "rate" });
  for (let i = 0; i < 4; i++) assert.equal((await mail.sendFromVisitor(letter({ email: "same@example.com" }))).ok, true);
  assert.equal((await mail.sendFromVisitor(letter({ email: "SAME@example.com" }))).ok, true);
  assert.deepEqual(await mail.sendFromVisitor(letter({ email: "same@example.com" })), { ok: false, error: "rate" });
});

test("an address marked as spam can't write again", async () => {
  const r = await mail.sendFromVisitor(letter({ email: "spammer@example.com" }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  mail.setThreadStatus(r.threadId, "spam");
  assert.deepEqual(await mail.sendFromVisitor(letter({ email: "spammer@example.com" })), { ok: false, error: "rate" });
  assert.equal(mail.listThreads().some((t) => t.id === r.threadId), false, "spam is out of the default list");
  assert.equal(mail.listThreads({ status: "spam" })[0].id, r.threadId);
});

/* ───────────── IMAP: fixture messages through mailparser → ingest ───────────── */

function eml(h: Record<string, string>, body: string) {
  const head = Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  return `${head}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body.replace(/\n/g, "\r\n")}`;
}
async function incoming(h: Record<string, string>, body: string) {
  return match.toIncoming(await simpleParser(eml(h, body)), "<fallback@test>");
}
const rfcDate = (d = new Date()) => d.toUTCString().replace("GMT", "+0000");

let protonReplyId = "";

test("IMAP: the Sent copy of an admin reply (same Message-ID) is a duplicate", async () => {
  const m = await incoming(
    { From: "Elliot Moreau <hello@elliotm.fr>", To: "Jane Doe <jane@example.com>", Subject: "Re: A project idea", "Message-ID": adminMessageId, Date: rfcDate() },
    "Hi Jane,\n\nHappy to. Thursday at 10?\n\nElliot"
  );
  assert.equal(match.ingest("sent", m), "duplicate");
});

test("IMAP: a copy of our mail under a Proton-given id teaches that id (X-Emos-Message)", async () => {
  const protonId = "<rewritten-1@protonmail.com>";
  const m = await incoming(
    {
      From: "emOS · Jane Doe <hello@elliotm.fr>",
      To: "hello@elliotm.fr",
      Subject: "A project idea",
      "Message-ID": protonId,
      "X-Emos-Thread": threadId,
      "X-Emos-Message": firstMessageId,
      Date: rfcDate(),
    },
    "Hi Elliot..."
  );
  assert.equal(match.ingest("inbox", m), "ours");
  // Elliot answers that copy in Proton: In-Reply-To is the id Proton gave it
  const reply = await incoming(
    {
      From: "Elliot Moreau <hello@elliotm.fr>",
      To: "Jane Doe <jane@example.com>",
      Subject: "Re: A project idea",
      "Message-ID": "<proton-reply-1@protonmail.com>",
      "In-Reply-To": protonId,
      References: protonId,
      Date: rfcDate(),
    },
    [
      "One more thing: bring the sketches.",
      "",
      "Sent with Proton Mail secure email.",
      "",
      "On Monday, October 12th, 2026 at 2:03 PM, Jane Doe <jane@example.com> wrote:",
      "",
      "> Hi Elliot...",
    ].join("\n")
  );
  assert.equal(match.ingest("sent", reply), "stored");
  protonReplyId = "<proton-reply-1@protonmail.com>";
  const t = mail.getThread(threadId)!;
  const got = t.messages!.find((x) => x.source === "imap")!;
  assert.equal(got.direction, "out");
  assert.equal(got.body, "One more thing: bring the sketches.");
  // it answers the first letter, so it sorts after it
  assert.ok(t.messages!.indexOf(got) > 0);
  assert.equal(t.status, "answered");
  assert.equal(mail.visitorThread(token)?.visitorUnread, 1);
  // seen again on the next poll: nothing new
  assert.equal(match.ingest("sent", reply), "duplicate");
});

test("IMAP: Elliot's reply straight to our Message-ID is stored", async () => {
  const r = await mail.sendFromVisitor(letter({ email: "max@example.fr", name: "Max", subject: "Une idée", lang: "fr" }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const notif = await last();
  const m = await incoming(
    {
      From: "Elliot Moreau <hello@elliotm.fr>",
      To: "Max <max@example.fr>",
      Subject: "RE : Une idée",
      "Message-ID": "<fr-reply@protonmail.com>",
      "In-Reply-To": notif.messageId!,
      Date: rfcDate(),
    },
    "Bonjour Max,\n\nAvec plaisir.\n\nEnvoyé avec la messagerie sécurisée Proton Mail.\n\nLe lundi 12 octobre 2026 à 14:03, Max <max@example.fr> a écrit :\n\n> Bonjour"
  );
  assert.equal(match.ingest("sent", m), "stored");
  const v = mail.visitorThread(r.token)!;
  assert.equal(v.messages.length, 2);
  assert.equal(v.messages[1].body, "Bonjour Max,\n\nAvec plaisir.");
  assert.equal(v.status, "answered");
});

test("IMAP: the visitor answering Elliot's email is stored as theirs", async () => {
  const m = await incoming(
    {
      From: "Jane Doe <jane@example.com>",
      To: "Elliot Moreau <hello@elliotm.fr>",
      Subject: "Re: A project idea",
      "Message-ID": "<CAJane123@mail.gmail.com>",
      "In-Reply-To": protonReplyId,
      References: `${firstMessageId} ${protonReplyId}`,
      Date: rfcDate(),
    },
    "Will do!\n\nJane\n\nOn Mon, Oct 12, 2026 at 2:03 PM Elliot Moreau <hello@elliotm.fr>\nwrote:\n\n> One more thing: bring the sketches."
  );
  assert.equal(match.ingest("inbox", m), "stored");
  const t = mail.getThread(threadId)!;
  const got = t.messages!.find((x) => x.source === "imap" && x.direction === "in")!;
  assert.equal(got.body, "Will do!\n\nJane");
  assert.ok(t.messages!.indexOf(got) > t.messages!.findIndex((x) => x.body.startsWith("One more thing")), "after the letter it answers");
  assert.equal(t.status, "open");
});

test("IMAP: someone else replying into the thread is not the visitor", async () => {
  const m = await incoming(
    { From: "Boss <boss@example.com>", To: "hello@elliotm.fr", Subject: "Re: A project idea", "Message-ID": "<boss@x>", "In-Reply-To": protonReplyId, Date: rfcDate() },
    "Who is this?"
  );
  assert.equal(match.ingest("inbox", m), "ignored");
});

test("IMAP: an unrelated email is ignored", async () => {
  const m = await incoming({ From: "News <news@example.org>", To: "hello@elliotm.fr", Subject: "Weekly digest", "Message-ID": "<news@x>", Date: rfcDate() }, "Hello");
  assert.equal(match.ingest("inbox", m), "ignored");
  assert.equal(match.worthFetching("inbox", { from: "news@example.org", to: ["hello@elliotm.fr"], emos: false, refs: [] }), false);
  assert.equal(match.worthFetching("inbox", { from: "jane@example.com", to: [], emos: false, refs: [] }), true);
});

test("IMAP: without references, same address and subject still find the thread", async () => {
  const m = await incoming(
    { From: "jane@example.com", To: "hello@elliotm.fr", Subject: "Re: A project idea", "Message-ID": "<noref@x>", Date: rfcDate() },
    "Sent from my phone, no threading. See you Thursday."
  );
  assert.equal(match.ingest("inbox", m), "stored");
  const other = await incoming(
    { From: "Elliot <hello@elliotm.fr>", To: "jane@example.com", Subject: "Something else", "Message-ID": "<else@x>", Date: rfcDate() },
    "A different conversation."
  );
  assert.equal(match.ingest("sent", other), "ignored");
});

test("IMAP: a Sent copy with a new id and no X-Emos headers is caught by its text", async () => {
  const r = await mail.adminReply(threadId, "Bring a laptop too.");
  assert.deepEqual(r, { ok: true });
  await settle();
  const ours = await simpleParser(raw());
  const m = await incoming(
    { From: "Elliot Moreau <hello@elliotm.fr>", To: "jane@example.com", Subject: ours.subject!, "Message-ID": "<stripped-headers@protonmail.com>", "In-Reply-To": ours.inReplyTo!, Date: rfcDate() },
    ours.text!
  );
  assert.equal(match.ingest("sent", m), "duplicate");
  const count = mail.getThread(threadId)!.messages!.filter((x) => x.body === "Bring a laptop too.").length;
  assert.equal(count, 1);
});

test("IMAP: our notification sitting in Sent is never taken for a reply", async () => {
  const m = await incoming(
    { From: "emOS · Jane Doe <hello@elliotm.fr>", To: "hello@elliotm.fr", Subject: "Re: A project idea", "Message-ID": "<notif-copy@protonmail.com>", "In-Reply-To": protonReplyId, Date: rfcDate() },
    "Thursday at 10 works."
  );
  assert.equal(match.ingest("sent", m), "ignored");
});

test("IMAP: spam threads take nothing in", async () => {
  const spam = mail.listThreads({ status: "spam" })[0];
  const m = await incoming({ From: "spammer@example.com", To: "hello@elliotm.fr", Subject: "Re: A project idea", "Message-ID": "<spam2@x>", Date: rfcDate() }, "Buy now");
  assert.equal(match.ingest("inbox", m), "ignored");
  assert.equal(mail.getThread(spam.id)!.messages!.length, 1);
});

test("mailHealth reports configuration without secrets", () => {
  const h = mail.mailHealth();
  assert.equal(h.smtp, true);
  assert.equal(h.imap, false);
  assert.equal(JSON.stringify(h).includes("test-secret"), false);
});

test("IMAP: a letter to the site's mailto address starts a thread; other inbox mail stays out", async () => {
  const m = await incoming(
    { From: "Bob Martin <bob@example.com>", To: "hello+site@elliotm.fr", Subject: "Saw your atlas", "Message-ID": "<bob.1@example.com>", Date: rfcDate() },
    "Bonjour Elliot, j'ai vu ton atlas, très joli !"
  );
  assert.equal(match.worthFetching("inbox", { from: "bob@example.com", to: ["hello+site@elliotm.fr"], emos: false, refs: [] }), true);
  assert.equal(match.ingest("inbox", m), "stored");
  const t = mail.listThreads().find((x) => x.email === "bob@example.com")!;
  assert.ok(t, "a thread for Bob");
  assert.equal(t.name, "Bob Martin");
  assert.equal(t.subject, "Saw your atlas");
  assert.equal(t.lang, "fr");
  assert.equal(t.adminUnread, 1);
  assert.equal(mail.getThread(t.id)!.messages?.[0].body, "Bonjour Elliot, j'ai vu ton atlas, très joli !");

  const other = await incoming(
    { From: "Newsletter <news@shop.example>", To: "hello@elliotm.fr", Subject: "Sale!", "Message-ID": "<n.1@shop.example>", Date: rfcDate() },
    "50% off"
  );
  assert.equal(match.worthFetching("inbox", { from: "news@shop.example", to: ["hello@elliotm.fr"], emos: false, refs: [] }), false);
  assert.equal(match.ingest("inbox", other), "ignored");
  assert.equal(mail.listThreads().some((x) => x.email === "news@shop.example"), false);
});

/* ───────────── who sent it: the visitor's IP behind Cloudflare, Turnstile, sender details ───────────── */

const req = (headers: Record<string, string>) => new Request("https://elliotmoreau.fr/api/mail/send", { method: "POST", headers });

test("the visitor's IP: Cloudflare's word only when the request came through Cloudflare", async () => {
  const { clientIp, senderOf } = await import("../../src/server/mail/http");
  // Coolify's proxy saw Cloudflare's edge: the visitor is CF-Connecting-IP
  assert.equal(clientIp(req({ "x-real-ip": "172.70.1.2", "x-forwarded-for": "172.70.1.2", "cf-connecting-ip": "198.51.100.7" })), "198.51.100.7");
  assert.equal(clientIp(req({ "x-forwarded-for": "2a06:98c0:3600::103", "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
  // a Cloudflare Tunnel reaches the proxy from the Docker network
  assert.equal(clientIp(req({ "x-real-ip": "10.0.1.5", "cf-connecting-ip": "198.51.100.8" })), "198.51.100.8");
  // straight to the server, faking the header: the real peer
  assert.equal(clientIp(req({ "x-real-ip": "192.0.2.66", "cf-connecting-ip": "1.1.1.1" })), "192.0.2.66");
  assert.equal(clientIp(req({ "x-forwarded-for": "1.1.1.1, 192.0.2.67" })), "192.0.2.67", "the last hop, not what the client wrote first");
  assert.equal(clientIp(req({})), "unknown");

  const s = senderOf(
    req({
      "x-real-ip": "172.70.1.2",
      "cf-connecting-ip": "198.51.100.7",
      "cf-ipcountry": "fr",
      "cf-ipcity": "Toulouse",
      "cf-ray": "8f2a1b3c4d5e6f70-CDG",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0",
      cookie: "secret=1",
      authorization: "Bearer x",
      "accept-language": "fr-FR,fr;q=0.9",
    }),
    { tz: "Europe/Paris", elapsed: 42_000, clues: { screen: "1920×1080", cores: 8, pasted: true, evil: "<script>", languages: ["fr-FR", 3], dark: "yes" } }
  );
  assert.equal(s.ip, "198.51.100.7");
  assert.equal(s.country, "FR");
  assert.equal(s.city, "Toulouse");
  assert.equal(s.colo, "CDG");
  assert.equal(s.timeZone, "Europe/Paris");
  assert.equal(s.viaCloudflare, true);
  assert.equal(s.headers?.cookie, undefined, "never the visitor's cookies");
  assert.equal(s.headers?.authorization, undefined);
  assert.equal(s.headers?.["accept-language"], "fr-FR,fr;q=0.9");
  assert.deepEqual(s.clues, { screen: "1920×1080", languages: ["fr-FR"], cores: 8, pasted: true, writingMs: 42_000 });

  // not through Cloudflare: its headers aren't believed
  const direct = senderOf(req({ "x-real-ip": "192.0.2.66", "cf-ipcountry": "US", "cf-connecting-ip": "1.1.1.1" }));
  assert.equal(direct.ip, "192.0.2.66");
  assert.equal(direct.country, undefined);
  assert.equal(direct.viaCloudflare, false);
});

test("Turnstile: once set up, a letter needs a good token, for the contact action", async () => {
  const { useTestVerifier } = await import("../../src/server/mail/turnstile");
  useTestVerifier((t) =>
    t === "good" ? { success: true, action: "contact" } : t === "elsewhere" ? { success: true, action: "login" } : { success: false, "error-codes": ["invalid-input-response"] }
  );
  try {
    const before = mail.listThreads().length;
    assert.deepEqual(await mail.sendFromVisitor(letter({ email: "t1@example.com" })), { ok: false, error: "verify" }, "no token");
    assert.deepEqual(await mail.sendFromVisitor(letter({ email: "t2@example.com", turnstile: "forged" })), { ok: false, error: "verify" });
    assert.deepEqual(await mail.sendFromVisitor(letter({ email: "t3@example.com", turnstile: "elsewhere" })), { ok: false, error: "verify" });
    assert.equal(mail.listThreads().length, before, "nothing stored");
    const r = await mail.sendFromVisitor(letter({ email: "t4@example.com", turnstile: "good" }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(mail.getThread(r.threadId)!.messages![0].sender?.turnstile, "passed");
  } finally {
    useTestVerifier(null);
  }
});

test("sender details: kept with each letter for the admin, never shown to the visitor, forgotten after 90 days", async () => {
  const { senderOf } = await import("../../src/server/mail/http");
  const { pruneSenders } = await import("../../src/server/mail/senders");
  const headers = { "x-real-ip": "162.158.1.1", "cf-connecting-ip": "198.51.100.42", "cf-ipcountry": "DE", "user-agent": "curl/8.5.0" };
  const sender = senderOf(req(headers), { clues: { ref: "https://news.ycombinator.com/item?id=1", landing: "/", pages: ["/", "/contact"] } });
  const r = await mail.sendFromVisitor(letter({ email: "who@example.com", ip: sender.ip, sender }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const again = senderOf(req(headers));
  assert.equal((await mail.visitorReply(r.token, "One more thing.", again.ip, again)).ok, true);

  const t = mail.getThread(r.threadId)!;
  assert.equal(t.country, "DE");
  assert.equal(mail.listThreads().find((x) => x.id === t.id)?.country, "DE", "the inbox list shows it too");
  const [first, reply] = t.messages!;
  assert.equal(first.sender?.ip, "198.51.100.42");
  assert.equal(first.sender?.userAgent, "curl/8.5.0");
  assert.equal(first.sender?.clues?.ref, "https://news.ycombinator.com/item?id=1");
  assert.equal(first.sender?.turnstile, "off");
  assert.equal(reply.sender?.ip, "198.51.100.42");

  // another conversation from the same IP is counted
  const r2 = await mail.sendFromVisitor(letter({ email: "who2@example.com", ip: sender.ip, sender }));
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  assert.deepEqual(mail.getThread(r2.threadId)!.messages![0].sender?.sameIp, { threads: 1, spam: 0 });

  const visitor = mail.visitorThread(r.token)!;
  assert.equal(JSON.stringify(visitor).includes("198.51.100.42"), false, "the visitor's view has none of it");
  assert.equal(JSON.stringify(visitor).includes("curl"), false);

  pruneSenders(Date.now() + 91 * 86_400_000);
  assert.equal(mail.getThread(r.threadId)!.messages![0].sender, undefined, "gone after 90 days");
  assert.equal(mail.getThread(r.threadId)!.messages![0].body.length > 0, true, "the letter stays");
});

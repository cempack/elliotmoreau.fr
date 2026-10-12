/**
 * Quoted-reply stripping, on replies as real mail clients write them
 * (Proton, Gmail, Apple Mail, Outlook, Thunderbird), in English and French.
 *
 *   npx tsx --conditions=react-server --test scripts/test/mail-strip.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBody, normalizeSubject, replySubject, stripQuoted } from "../../src/server/mail/strip";

const strip = (lines: string[]) => stripQuoted(lines.join("\n"));

test("Proton (EN): footer and attribution", () => {
  const got = strip([
    "Thanks Jane, Thursday works for me.",
    "",
    "Elliot",
    "",
    "Sent with Proton Mail secure email.",
    "",
    "On Monday, October 12th, 2026 at 2:03 PM, Jane Doe <jane@example.com> wrote:",
    "",
    "> Hi Elliot,",
    ">",
    "> Would Thursday work for a call?",
  ]);
  assert.equal(got, "Thanks Jane, Thursday works for me.\n\nElliot");
});

test("Proton (EN): footer with its markdown link, no blank lines", () => {
  const got = strip([
    "Sounds good, talk soon.",
    "Sent with [Proton Mail](https://proton.me/mail/home) secure email.",
    "On Monday, October 12th, 2026 at 14:03, Jane <jane@example.com> wrote:",
    "> Can we talk?",
  ]);
  assert.equal(got, "Sounds good, talk soon.");
});

test("Proton (FR): signature française et attribution", () => {
  const got = strip([
    "Merci Jane, jeudi me va très bien.",
    "",
    "Elliot",
    "",
    "Envoyé avec la messagerie sécurisée [Proton Mail](https://proton.me/mail/home).",
    "",
    "Le lundi 12 octobre 2026 à 14:03, Jane Doe <jane@example.com> a écrit :",
    "",
    "> Bonjour Elliot,",
  ]);
  assert.equal(got, "Merci Jane, jeudi me va très bien.\n\nElliot");
});

test("Proton (older): ‐‐‐ Original Message ‐‐‐ with U+2010 dashes", () => {
  const got = strip([
    "Sounds good!",
    "",
    "‐‐‐‐‐‐‐ Original Message ‐‐‐‐‐‐‐",
    "On Monday, October 12, 2026 2:03 PM, Jane Doe <jane@example.com> wrote:",
    "",
    "> Hi",
  ]);
  assert.equal(got, "Sounds good!");
});

test("Proton (older, FR): Message d’origine", () => {
  const got = strip(["Avec plaisir.", "", "------- Message d'origine -------", "Le lundi 12 octobre 2026 14:03, Jane <jane@example.com> a écrit :", "> Salut"]);
  assert.equal(got, "Avec plaisir.");
});

test("Gmail (EN): attribution wrapped over two lines", () => {
  const got = strip([
    "Hi Elliot,",
    "",
    "Yes, happy to share more details next week.",
    "",
    "Best,",
    "Jane",
    "",
    "On Mon, Oct 12, 2026 at 2:03 PM Elliot Moreau <hello@elliotm.fr>",
    "wrote:",
    "",
    "> Thanks for the note! Could you tell me more?",
    ">",
  ]);
  assert.equal(got, "Hi Elliot,\n\nYes, happy to share more details next week.\n\nBest,\nJane");
});

test("Gmail (FR): « a écrit : » coupé en fin de ligne", () => {
  const got = strip([
    "Bonjour Elliot,",
    "",
    "Avec plaisir, je vous envoie ça demain.",
    "",
    "Jane",
    "",
    "Le lun. 12 oct. 2026 à 14:03, Elliot Moreau <hello@elliotm.fr> a",
    "écrit :",
    "",
    "> Merci pour votre message !",
  ]);
  assert.equal(got, "Bonjour Elliot,\n\nAvec plaisir, je vous envoie ça demain.\n\nJane");
});

test("Gmail (EN): one-line attribution with a 24h time", () => {
  const got = strip(["Great, thanks.", "", "On Mon, 12 Oct 2026 at 14:03, Elliot Moreau <hello@elliotm.fr> wrote:", "", "> Hello"]);
  assert.equal(got, "Great, thanks.");
});

test("Apple Mail (iOS, EN): Sent from my iPhone, quoted attribution", () => {
  const got = strip([
    "Perfect, see you then.",
    "",
    "Sent from my iPhone",
    "",
    "> On 12 Oct 2026, at 14:03, Elliot Moreau <hello@elliotm.fr> wrote:",
    "> ",
    "> See you Thursday.",
  ]);
  assert.equal(got, "Perfect, see you then.");
});

test("Apple Mail (macOS, FR): attribution citée", () => {
  const got = strip([
    "Super, merci !",
    "",
    "Jane",
    "",
    "> Le 12 oct. 2026 à 14:03, Elliot Moreau <hello@elliotm.fr> a écrit :",
    "> ",
    "> Bonjour Jane,",
  ]);
  assert.equal(got, "Super, merci !\n\nJane");
});

test("Apple Mail (macOS, EN): unquoted attribution", () => {
  const got = strip(["Will do.", "", "On 12 Oct 2026, at 14:03, Elliot Moreau <hello@elliotm.fr> wrote:", "", "> Could you send it?"]);
  assert.equal(got, "Will do.");
});

test("Apple Mail (iOS, FR): Envoyé de mon iPhone", () => {
  const got = strip(["D’accord !", "", "Envoyé de mon iPhone", "", "> Le 12 oct. 2026 à 14:03, Elliot <hello@elliotm.fr> a écrit :", ">", "> Ok ?"]);
  assert.equal(got, "D’accord !");
});

test("Outlook (EN): rule and header block", () => {
  const got = strip([
    "Hi Elliot,",
    "",
    "Thanks, that works.",
    "",
    "Jane",
    "",
    "________________________________",
    "From: Elliot Moreau <hello@elliotm.fr>",
    "Sent: Monday, October 12, 2026 2:03 PM",
    "To: Jane Doe <jane@example.com>",
    "Subject: Re: A project idea",
    "",
    "Hi Jane, here's what I had in mind.",
  ]);
  assert.equal(got, "Hi Elliot,\n\nThanks, that works.\n\nJane");
});

test("Outlook (FR): bloc d’en-têtes sans filet", () => {
  const got = strip([
    "Bonjour,",
    "",
    "Parfait pour moi.",
    "",
    "Jane",
    "",
    "De : Elliot Moreau <hello@elliotm.fr>",
    "Envoyé : lundi 12 octobre 2026 14:03",
    "À : Jane Doe <jane@example.com>",
    "Objet : Re: Une idée de projet",
    "",
    "Bonjour Jane, voici mon idée.",
  ]);
  assert.equal(got, "Bonjour,\n\nParfait pour moi.\n\nJane");
});

test("Outlook (EN, desktop): -----Original Message-----", () => {
  const got = strip(["Noted.", "", "-----Original Message-----", "From: Elliot Moreau <hello@elliotm.fr>", "Sent: Monday", "To: Jane"]);
  assert.equal(got, "Noted.");
});

test("Outlook (FR, desktop): -----Message d'origine-----", () => {
  const got = strip(["C’est noté.", "", "-----Message d'origine-----", "De : Elliot Moreau", "Envoyé : lundi"]);
  assert.equal(got, "C’est noté.");
});

test("Outlook (mobile): Get Outlook for iOS / Obtenir Outlook pour Android", () => {
  assert.equal(strip(["Sure.", "", "Get Outlook for iOS<https://aka.ms/o0ukef>", "________________________________", "From: Elliot"]), "Sure.");
  assert.equal(strip(["Bien sûr.", "", "Obtenir Outlook pour Android<https://aka.ms/AAb9ysg>", "De : Elliot"]), "Bien sûr.");
});

test("Thunderbird (FR): Le 12/10/2026 à 14:03, Jane a écrit :", () => {
  const got = strip(["Merci !", "", "Le 12/10/2026 à 14:03, Jane Doe a écrit :", "> Bonjour"]);
  assert.equal(got, "Merci !");
});

test("Thunderbird (EN): -------- Original Message --------", () => {
  const got = strip(["Thanks!", "", "-------- Original Message --------", "Subject: Hi", "Date: Mon, 12 Oct 2026 14:03:00 +0200"]);
  assert.equal(got, "Thanks!");
});

test("interleaved answers keep their quoted questions; the trailing history goes", () => {
  const got = strip([
    "> Do you like Toulouse?",
    "",
    "Very much.",
    "",
    "> And Lisbon?",
    "",
    "Haven't been yet.",
    "",
    "On Mon, Oct 12, 2026 at 2:03 PM Jane <jane@example.com> wrote:",
    "> Do you like Toulouse?",
    "> And Lisbon?",
  ]);
  assert.equal(got, "> Do you like Toulouse?\n\nVery much.\n\n> And Lisbon?\n\nHaven't been yet.");
});

test("a bare trailing quote block (no attribution) goes", () => {
  assert.equal(strip(["Yes!", "", "> Shall we?", "> -- E."]), "Yes!");
});

test("an RFC 3676 signature near the end goes", () => {
  assert.equal(strip(["Thanks!", "", "-- ", "Jane Doe", "Studio Doe · Lyon"]), "Thanks!");
});

test("ordinary text that starts like an attribution is kept", () => {
  const text = "On Monday I'll call you.\nLe projet avance bien.\nDe temps en temps : oui.";
  assert.equal(stripQuoted(text), text);
});

test("a reply that is only quoted history comes out empty", () => {
  assert.equal(strip(["On Mon, Oct 12, 2026 at 2:03 PM Jane <jane@example.com> wrote:", "> Hello"]), "");
});

test("CRLF line endings and trailing spaces are normalised", () => {
  assert.equal(stripQuoted("Hello   \r\n\r\n\r\n\r\nWorld\r\n\r\nOn Mon, 12 Oct 2026, Jane <j@x.fr> wrote:\r\n> hi"), "Hello\n\nWorld");
});

test("subjects: reply and forward prefixes in both languages", () => {
  assert.equal(normalizeSubject("Re: A project idea"), "a project idea");
  assert.equal(normalizeSubject("RE : Re: Une idée de projet"), "une idée de projet");
  assert.equal(normalizeSubject("TR: Fwd: [External] Re[2]: Hello  there"), "hello there");
  assert.equal(normalizeSubject("Réf : Bonjour"), "bonjour");
  assert.equal(normalizeSubject("Recipe ideas"), "recipe ideas");
  assert.equal(replySubject("A project idea"), "Re: A project idea");
  assert.equal(replySubject("re: A project idea"), "re: A project idea");
});

test("bodies compare without case, spacing or wraps", () => {
  assert.equal(normalizeBody("Hello  Jane,\nSee you\r\nThursday."), normalizeBody("hello jane, see you thursday."));
});

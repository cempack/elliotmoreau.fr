import "server-only";

/**
 * Plain-text helpers for mail read back over IMAP: cut a reply down to
 * what its author actually wrote (no quoted history, attribution line,
 * forwarded header block or "Sent with" footer), and normalise subjects
 * and bodies so the same letter seen twice can be recognised.
 *
 * Mail clients mark quoted history differently, in both languages:
 *   Gmail       On Mon, Oct 12, 2026 at 2:03 PM Jane <jane@x.fr> wrote:   (often wrapped over 2 lines)
 *               Le lun. 12 oct. 2026 à 14:03, Jane <jane@x.fr> a écrit :
 *   Apple Mail  On 12 Oct 2026, at 14:03, Jane <jane@x.fr> wrote:
 *               Le 12 oct. 2026 à 14:03, Jane <jane@x.fr> a écrit :
 *   Proton      Sent with Proton Mail secure email. / Envoyé avec la messagerie sécurisée Proton Mail.
 *               On Monday, October 12th, 2026 at 14:03, Jane <jane@x.fr> wrote:
 *               ------- Original Message ------- (older versions, with U+2010 dashes)
 *   Outlook     -----Original Message----- / -----Message d'origine-----
 *               ________________________________  then  From: / Sent: / To: / Subject:
 *                                                       De : / Envoyé : / À : / Objet :
 *   Thunderbird -------- Original Message -------- / Le 12/10/2026 à 14:03, Jane a écrit :
 * and every client may prefix quoted lines with ">".
 */

const DASHES = /[\u2010-\u2015\u2212\u2500\u2501]/g;

/** "------ Original Message ------" and friends (dashes normalised first) */
const SEPARATOR =
  /^-{2,}\s*(?:original message|forwarded message|message d['’]origine|message original|message transféré|message transfere|mensaje original|ursprüngliche nachricht)\s*-*\s*$/i;

/** forwarded-message openers */
const FORWARD = /^(?:begin forwarded message|début du message (?:réexpédié|transféré)|debut du message (?:reexpedie|transfere))\s*:?\s*$/i;

/** client footers that sit between the reply and the quote */
const FOOTERS = [
  /^(?:sent|envoyé|envoye)\s+(?:with|from|avec|depuis|de)\b.{0,80}proton\s*mail\b/i,
  /^(?:sent from my|envoyé de mon|envoyé depuis mon|envoye de mon|envoye depuis mon)\s+(?:iphone|ipad|android|mobile|smartphone|samsung|galaxy|pixel)/i,
  /^(?:get|obtenir|télécharger|telecharger)\s+outlook\s+(?:for|pour)\s+(?:ios|android)/i,
];

/** a header line in a quoted block ("From: …", "De : …"), optionally bolded by an HTML conversion */
const H_FROM = /^\*?(?:from|de|von|de la part de)\s*:\*?\s*\S/i;
const H_OTHER = /^\*?(?:sent|date|envoyé|envoye|to|à|a|subject|objet|cc|gesendet|an|betreff)\s*:\*?\s*/i;

/** attribution lines, once joined into one string */
const ATTRIBUTION = [
  /^(?:>\s*)?on\s.{4,}?\s(?:wrote|writes)\s*:\s*$/i,
  /^(?:>\s*)?le\s.{4,}?\sa\s+(?:écrit|ecrit)\s*:\s*$/i,
  /^(?:>\s*)?el\s.{4,}?\sescribió\s*:\s*$/i,
  /^(?:>\s*)?am\s.{4,}?\sschrieb\s.{0,80}:\s*$/i,
];
const ATTRIBUTION_START = /^(?:>\s*)?(?:on|le|el|am)\s/i;

function attributionAt(lines: string[], i: number) {
  const first = lines[i].trim();
  if (!ATTRIBUTION_START.test(first)) return false;
  // wrapped clients split it over up to three lines
  let joined = "";
  for (let k = 0; k < 3 && i + k < lines.length; k++) {
    const part = lines[i + k].trim();
    if (k > 0 && !part) break;
    joined = joined ? `${joined} ${part}` : part;
    if (joined.length > 400) return false;
    if (/\d/.test(joined) && ATTRIBUTION.some((re) => re.test(joined))) return true;
  }
  return false;
}

function headerBlockAt(lines: string[], i: number) {
  if (!H_FROM.test(lines[i].trim())) return false;
  let seen = 0;
  for (let k = 1; k <= 5 && i + k < lines.length; k++) {
    const l = lines[i + k].trim();
    if (!l) continue;
    if (H_OTHER.test(l)) seen++;
    else break;
  }
  return seen >= 2;
}

function cutsAt(lines: string[], i: number) {
  const line = lines[i].replace(DASHES, "-").trim();
  if (!line) return false;
  if (SEPARATOR.test(line) || FORWARD.test(line)) return true;
  if (FOOTERS.some((re) => re.test(line))) return true;
  // Outlook's rule above the header block
  if (/^_{10,}$/.test(line)) {
    for (let k = 1; k <= 2 && i + k < lines.length; k++) if (headerBlockAt(lines, i + k)) return true;
    return false;
  }
  if (headerBlockAt(lines, i)) return true;
  return attributionAt(lines, i);
}

const isQuote = (l: string) => /^\s*>/.test(l);

/**
 * The part of a reply its author wrote. Interleaved answers keep their
 * quoted context; only the history after the last line of new text goes.
 */
export function stripQuoted(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .split("\n");
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (cutsAt(lines, i)) {
      end = i;
      break;
    }
  }
  let kept = lines.slice(0, end);
  // a trailing quote block (and the blank lines around it) goes
  let last = kept.length - 1;
  while (last >= 0 && (!kept[last].trim() || isQuote(kept[last]))) last--;
  kept = kept.slice(0, last + 1);
  // a signature ("-- " on its own line) near the end goes too
  for (let k = kept.length - 1; k >= Math.max(0, kept.length - 12); k--) {
    if (kept[k] === "-- " || kept[k].trim() === "--") {
      kept = kept.slice(0, k);
      break;
    }
  }
  return kept
    .join("\n")
    .replace(/[ \t\u00a0]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SUBJECT_PREFIX =
  /^(?:\[[^\]]{1,40}\]\s*)?(?:re|fw|fwd|tr|réf|ref|aw|wg|sv|antw|rv|enc)\s*(?:\[\d+\]|\(\d+\))?\s*:\s*/i;

/** "RE : Re: [Fwd] Une idée" → "une idée" */
export function normalizeSubject(subject: string) {
  let s = subject.normalize("NFC").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 10; i++) {
    const next = s.replace(SUBJECT_PREFIX, "");
    if (next === s) break;
    s = next.trim();
  }
  return s.toLowerCase();
}

/** "Re: …" once, however many times it was already there */
export function replySubject(subject: string) {
  const s = subject.trim();
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/** for comparing two copies of one letter: case, spacing and line wraps ignored */
export function normalizeBody(body: string) {
  return body.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

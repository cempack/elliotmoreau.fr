/**
 * Plain helpers for the Mail app: the mailto link, the draft kept in this
 * browser, the letter's pixel "text lines", copying, and launching the
 * viewer's mail app.
 */

export type Draft = { subject: string; body: string };

const DRAFT_KEY = "em-mail-draft";

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Draft>;
    if (typeof v.subject !== "string" || typeof v.body !== "string") return null;
    return { subject: v.subject, body: v.body };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    if (!d.subject.trim() && !d.body.trim()) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {}
}

/** Who the letter is from (sending from the site): remembered in this browser for the next one. */
export type From = { email: string; name: string };

const FROM_KEY = "em-mail-from";

export function loadFrom(): From | null {
  try {
    const raw = localStorage.getItem(FROM_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<From>;
    if (typeof v.email !== "string" || typeof v.name !== "string") return null;
    return { email: v.email, name: v.name };
  } catch {
    return null;
  }
}

export function saveFrom(f: From) {
  try {
    if (!f.email.trim() && !f.name.trim()) localStorage.removeItem(FROM_KEY);
    else localStorage.setItem(FROM_KEY, JSON.stringify(f));
  } catch {}
}

/** the same check the server makes (one @, a dotted domain, no spaces or separators) */
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"'_]+\.[^\s@<>()[\]\\,;:"'_]{2,}$/;

/** the longest letter the site sends (characters) */
export const LETTER_MAX = 10_000;

/** RFC 6068: spaces as %20, line breaks as CRLF. */
export function mailtoHref(email: string, { subject, body }: Draft) {
  const q: string[] = [];
  if (subject.trim()) q.push(`subject=${encodeURIComponent(subject.trim())}`);
  if (body.trim()) q.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`);
  return `mailto:${email}${q.length ? `?${q.join("&")}` : ""}`;
}

/** Past this, some mail apps truncate the link. */
export const MAILTO_SAFE = 1900;

export function wordCount(text: string) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** "{n} word" / "{n} words" by the language's own plural rule (French: 0 and 1 are singular). */
export function plural(lang: string, n: number, one: string, other: string) {
  const rule = new Intl.PluralRules(lang === "fr" ? "fr" : "en").select(n);
  return fill(rule === "one" ? one : other, { n });
}

/**
 * The saved draft's file name, for the window subtitle. A tiny external
 * store so typing re-renders only the subtitle, never the window around it.
 */
let fileSlug = "";
const fileSubs = new Set<() => void>();
export const draftFile = {
  get: () => fileSlug,
  server: () => "",
  set(next: string) {
    if (next === fileSlug) return;
    fileSlug = next;
    for (const f of fileSubs) f();
  },
  subscribe(f: () => void) {
    fileSubs.add(f);
    return () => {
      fileSubs.delete(f);
    };
  },
};

/** "A project idea" → "a-project-idea" (ASCII, ≤ 28 chars). */
export function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/, "");
}

/**
 * The letter in miniature: wraps the body at `cols` characters and returns
 * each line's length in cells (of `cells` across), 0 for a blank line.
 */
export function letterLines(body: string, max: number, cols = 34, cells = 16) {
  const out: number[] = [];
  for (const para of body.replace(/\r/g, "").split("\n")) {
    if (out.length >= max) break;
    if (!para.trim()) {
      if (out.length && out[out.length - 1] !== 0) out.push(0);
      continue;
    }
    let line = 0;
    for (const word of para.trim().split(/\s+/)) {
      const w = Math.min(word.length, cols);
      if (line && line + 1 + w > cols) {
        out.push(line);
        if (out.length >= max) break;
        line = w;
      } else line += line ? 1 + w : w;
    }
    if (line && out.length < max) out.push(line);
  }
  return out.map((n) => (n === 0 ? 0 : Math.max(2, Math.round((n / cols) * cells))));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

type UA = { userActivation?: { isActive: boolean; hasBeenActive: boolean } };

/**
 * Browsers only launch an external app close to a user gesture (about five
 * seconds in Chromium; a mouse drag starts the clock at pointer-down). False
 * once that window has passed, so the UI can offer a button instead of
 * pretending. True where the platform can't tell.
 */
export function activationFresh() {
  return (navigator as Navigator & UA).userActivation?.isActive !== false;
}

/** Hand the message to the viewer's mail app; false when the browser wouldn't allow it now. */
export function launchMail(href: string): boolean {
  if (!activationFresh()) return false;
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/** Fill a {placeholder} template. */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

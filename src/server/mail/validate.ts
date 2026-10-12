import "server-only";
import { LIMITS } from "./config";

/**
 * Input checks for anything a visitor sends. Header fields (name, email,
 * subject) must be one line: a CR or LF there is refused outright, never
 * cleaned, since it can only be an attempt to add headers.
 */

/** one @, a dot in the domain, no spaces, quotes, angle brackets or separators */
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"'_]+\.[^\s@<>()[\]\\,;:"'_]{2,}$/;

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** a single-line header value: trimmed, inner runs of spaces collapsed; null when invalid */
export function cleanLine(v: unknown, max: number, { required = false } = {}): string | null {
  if (v == null) return required ? null : "";
  if (typeof v !== "string") return null;
  if (CONTROL.test(v)) return null;
  const s = v.normalize("NFC").replace(/\s+/g, " ").trim();
  if (required && !s) return null;
  if (s.length > max) return null;
  return s;
}

export function cleanEmail(v: unknown): string | null {
  const s = cleanLine(v, LIMITS.email, { required: true });
  if (!s || !EMAIL_RE.test(s) || s.includes("..")) return null;
  return s;
}

/** a letter: line breaks normalised, stray control characters dropped, not empty, not too long */
export function cleanBody(v: unknown, max: number = LIMITS.body): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").replace(/\r\n?/g, "\n").replace(BODY_CONTROL, "").replace(/[ \t]+$/gm, "").trim();
  if (!s || s.length > max) return null;
  return s;
}

export function cleanLang(v: unknown): "en" | "fr" {
  return v === "fr" ? "fr" : "en";
}

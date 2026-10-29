/**
 * The Mail app's calls to /api/mail/*: send a letter, read the visitor's
 * own threads (by their private tokens), and reply in one. JSON POSTs,
 * same origin. A network failure reads as "failed".
 */

import { currentVisit } from "@/lib/visit";

/** "verify": Turnstile couldn't tell the sender is a person */
export type SendError = "invalid" | "verify" | "rate" | "unavailable" | "failed";
export type ApiMessage = { id: string; direction: "in" | "out"; body: string; source: "site" | "admin" | "imap"; createdAt: string };
export type ApiThread = {
  id: string;
  name: string;
  subject: string;
  lang: "en" | "fr";
  status: "open" | "answered" | "archived" | "spam";
  createdAt: string;
  lastAt: string;
  visitorUnread: number;
  messages: ApiMessage[];
};

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

async function post<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {}
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

type Res<E extends string, OK = object> = ({ ok: true } & OK) | { ok: false; error: E };

const asError = <E extends string>(data: { error?: string } | null, allowed: readonly E[], fallback: E): E =>
  data && allowed.includes(data.error as E) ? (data.error as E) : fallback;

const SEND_ERRORS = ["invalid", "verify", "rate", "unavailable", "failed"] as const;

/** the browser's time zone, sent with a letter (the admin sees it beside where the IP is) */
const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

/**
 * What the browser says about itself and this visit, sent with a letter for
 * Elliot's eyes only (the admin's Mail): the device, its settings, where the
 * visit came from and what it looked at, and whether the message was pasted.
 * The server keeps only the fields it knows (src/server/mail/http cleanClues).
 */
export function clues(pasted?: boolean) {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
    userAgentData?: { platform?: string; mobile?: boolean; brands?: { brand: string; version: string }[] };
  };
  const mq = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return undefined;
    }
  };
  const visit = currentVisit();
  return {
    languages: [...(nav.languages ?? [])].slice(0, 8),
    platform: nav.userAgentData?.platform ?? nav.platform,
    mobile: nav.userAgentData?.mobile,
    brands: nav.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`).slice(0, 6),
    screen: `${screen.width}×${screen.height}`,
    window: `${window.innerWidth}×${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    colorDepth: screen.colorDepth,
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    touch: nav.maxTouchPoints,
    dark: mq("(prefers-color-scheme: dark)"),
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    connection: nav.connection?.effectiveType,
    saveData: nav.connection?.saveData,
    cookies: nav.cookieEnabled,
    webdriver: nav.webdriver,
    dnt: nav.doNotTrack === "1" || undefined,
    ...(visit ? { ref: visit.ref || undefined, landing: visit.landing, pages: visit.pages, onSiteMs: Date.now() - visit.at } : {}),
    pasted,
  };
}

export async function sendLetter(input: {
  email: string;
  name: string;
  subject: string;
  body: string;
  lang: "en" | "fr";
  elapsed: number;
  hp: string;
  /** the Turnstile token, when the site checks one */
  ts?: string;
  clues?: ReturnType<typeof clues>;
}): Promise<Res<SendError, { token: string }>> {
  const { data } = await post<{ ok: boolean; token?: string; error?: string }>("/api/mail/send", { ...input, tz: timeZone() });
  if (data?.ok && data.token && TOKEN_RE.test(data.token)) return { ok: true, token: data.token };
  return { ok: false, error: asError(data, SEND_ERRORS, "failed") };
}

/** the threads for these tokens (null = not on file); `read` marks one as opened. null when unreachable. */
export async function fetchThreads(tokens: string[], read?: string): Promise<Record<string, ApiThread | null> | null> {
  if (!tokens.length) return {};
  const { data } = await post<{ ok: boolean; threads?: Record<string, ApiThread | null> }>("/api/mail/thread", { tokens, read });
  return data?.ok && data.threads ? data.threads : null;
}

export async function sendReply(token: string, body: string): Promise<Res<SendError | "notfound">> {
  const { data } = await post<{ ok: boolean; error?: string }>("/api/mail/reply", { token, body, tz: timeZone(), clues: clues() });
  if (data?.ok) return { ok: true };
  return { ok: false, error: asError(data, [...SEND_ERRORS, "notfound"] as const, "failed") };
}

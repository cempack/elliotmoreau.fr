/**
 * The Mail app's calls to /api/mail/*: send a letter, read the visitor's
 * own threads (by their private tokens), and reply in one. JSON POSTs,
 * same origin. A network failure reads as "failed".
 */

export type SendError = "invalid" | "rate" | "unavailable" | "failed";
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

const SEND_ERRORS = ["invalid", "rate", "unavailable", "failed"] as const;

export async function sendLetter(input: {
  email: string;
  name: string;
  subject: string;
  body: string;
  lang: "en" | "fr";
  elapsed: number;
  hp: string;
}): Promise<Res<SendError, { token: string }>> {
  const { data } = await post<{ ok: boolean; token?: string; error?: string }>("/api/mail/send", input);
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
  const { data } = await post<{ ok: boolean; error?: string }>("/api/mail/reply", { token, body });
  if (data?.ok) return { ok: true };
  return { ok: false, error: asError(data, [...SEND_ERRORS, "notfound"] as const, "failed") };
}

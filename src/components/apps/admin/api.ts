import type { CurrentAway, LiveOverrides, NowContent, PlaceRow, Status } from "@/lib/content";

/**
 * The admin panel's calls: /api/admin/auth (passkeys, sessions) and
 * /api/admin/rpc (everything else). Same-origin JSON POSTs; a network
 * failure reads as { ok: false, error: "offline" }, a lost session as
 * "expired" (the panel locks itself).
 */

export type Fail = { ok: false; error: string; message?: string; field?: string; retryIn?: number };
export type Res<T> = ({ ok: true } & T) | Fail;

async function post<T>(url: string, body: unknown): Promise<Res<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.status === 401 && url.endsWith("/rpc")) {
      window.dispatchEvent(new Event("emos-admin-expired"));
      return { ok: false, error: "expired" };
    }
    const data = (await res.json().catch(() => null)) as Res<T> | null;
    return data ?? { ok: false, error: res.ok ? "failed" : "unavailable" };
  } catch {
    return { ok: false, error: "offline" };
  }
}

export const auth = <T = object>(op: string, args: Record<string, unknown> = {}) => post<T>("/api/admin/auth", { op, ...args });
export const rpc = <T = object>(op: string, args: Record<string, unknown> = {}) => post<T>("/api/admin/rpc", { op, ...args });

export type AuthState = { signedIn: boolean; setup: boolean; setupReady: boolean };

export type Passkey = { id: string; name: string; createdAt: string; lastUsedAt?: string; synced: boolean };
export type SessionRow = { id: string; createdAt: string; lastSeenAt: string; device: string; current: boolean; passkey?: string };
export type AuditRow = { id: number; at: string; action: string; ok: boolean; detail: string };
export type MailHealth = { smtp: boolean; imap: boolean; lastSync?: string; lastError?: string };

export type ThreadStatus = "open" | "answered" | "archived" | "spam";
export type Message = { id: string; direction: "in" | "out"; body: string; source: "site" | "admin" | "imap"; createdAt: string; error?: string };
export type Thread = {
  id: string;
  name: string;
  email: string;
  subject: string;
  lang: "en" | "fr";
  status: ThreadStatus;
  createdAt: string;
  lastAt: string;
  adminUnread: number;
  messages?: Message[];
};

export type Overview = {
  places: PlaceRow[];
  status: Status;
  now: NowContent;
  live: LiveOverrides;
  away: CurrentAway | null;
  mail: { unread: number; health: MailHealth; addresses: { to: string; from: string } };
  system: {
    passkeys: Passkey[];
    sessions: SessionRow[];
    recoveryLeft: number;
    session: { createdAt: string; expiresAt: number; hardExpiresAt: number };
    integrations: {
      database: "volume" | "local";
      smtp: boolean;
      imap: boolean;
      github: boolean;
      ghost: boolean;
      spotify: boolean;
      siteUrl: string;
    };
  };
};

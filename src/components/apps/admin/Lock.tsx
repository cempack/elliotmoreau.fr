"use client";

import { useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { AppIcon } from "@/components/os/icons";
import { auth, type AuthState } from "./api";
import { Btn, fill } from "./ui";

type View = "locked" | "setup" | "recovery";

const noop = () => () => {};

/** "45 s" / "3 min" */
const wait = (ms: number) => (ms < 60_000 ? `${Math.ceil(ms / 1000)} s` : `${Math.ceil(ms / 60_000)} min`);

/** a WebAuthn ceremony's failure, as one of the dictionary's errors */
function ceremonyError(err: unknown): string {
  const name = (err as { name?: string; code?: string })?.name;
  const code = (err as { code?: string })?.code;
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError") return "exists";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  return "failed";
}

/**
 * The locked window: one button and a passkey. First run (no passkey
 * anywhere) asks for the setup token instead; "Lost every device?" takes
 * a recovery code. A new key from setup shows its recovery codes once.
 */
export function Lock({ state, onUnlocked, onCodes }: { state: AuthState; onUnlocked: () => void; onCodes: (codes: string[]) => void }) {
  const { t } = useI18n();
  const l = t.admin.lock;
  const { blip } = useSound();
  const [view, setView] = useState<View>(state.setup ? "setup" : "locked");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const supported = useSyncExternalStore(noop, browserSupportsWebAuthn, () => true);

  const say = (e: string, retryIn?: number) => {
    const msg = (l.errors as Record<string, string>)[e] ?? l.errors.failed;
    setError(fill(msg, { time: wait(retryIn ?? 0) }));
    blip("error");
  };

  const unlock = async () => {
    setBusy(true);
    setError("");
    try {
      const opts = await auth<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("login.options");
      if (!opts.ok) return say(opts.error, opts.retryIn);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: opts.options });
      } catch (err) {
        return say(ceremonyError(err));
      }
      const res = await auth("login.verify", { response });
      if (!res.ok) return say(res.error, res.retryIn);
      blip("success");
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  const register = async (grant: { setupToken?: string; recoveryCode?: string }) => {
    setBusy(true);
    setError("");
    try {
      const opts = await auth<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("register.options", grant);
      if (!opts.ok) return say(opts.error, opts.retryIn);
      let response;
      try {
        response = await startRegistration({ optionsJSON: opts.options });
      } catch (err) {
        return say(ceremonyError(err));
      }
      const res = await auth<{ recoveryCodes?: string[] }>("register.verify", { response });
      if (!res.ok) return say(res.error, res.retryIn);
      blip("success");
      if (res.recoveryCodes?.length) onCodes(res.recoveryCodes);
      else onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  const title = view === "setup" ? l.setupTitle : view === "recovery" ? l.recoveryTitle : l.locked;

  return (
    <div className="app-admin-lock">
      <div className="app-admin-lock-card">
        <div className="app-admin-lock-key" data-busy={busy || undefined} aria-hidden>
          <AppIcon app="admin" size={88} />
        </div>
        <h2 className="app-admin-lock-title">{title}</h2>

        {!supported ? (
          <p className="app-admin-lock-lede">{l.errors.unsupported}</p>
        ) : view === "locked" ? (
          <>
            <p className="app-admin-lock-lede">{l.lede}</p>
            <Btn kind="primary" onClick={unlock} disabled={busy} autoFocus>
              {busy ? l.waiting : l.unlock}
            </Btn>
            <button type="button" className="app-admin-link" onClick={() => (setView("recovery"), setError(""))}>
              {l.lost}
            </button>
          </>
        ) : view === "setup" ? (
          state.setupReady ? (
            <form
              className="app-admin-lock-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (token.trim()) register({ setupToken: token.trim() });
              }}
            >
              <p className="app-admin-lock-lede">{l.setupLede}</p>
              <label className="app-admin-label" htmlFor="admin-setup-token">
                {l.setupToken}
              </label>
              <input
                id="admin-setup-token"
                className="app-admin-input"
                data-mono=""
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
              />
              <Btn kind="primary" type="submit" disabled={busy || !token.trim()}>
                {busy ? l.waiting : l.register}
              </Btn>
            </form>
          ) : (
            <p className="app-admin-lock-lede">{l.setupMissing}</p>
          )
        ) : (
          <form
            className="app-admin-lock-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) register({ recoveryCode: code.trim() });
            }}
          >
            <p className="app-admin-lock-lede">{l.recoveryLede}</p>
            <label className="app-admin-label" htmlFor="admin-recovery">
              {l.recoveryCode}
            </label>
            <input
              id="admin-recovery"
              className="app-admin-input"
              data-mono=""
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <Btn kind="primary" type="submit" disabled={busy || !code.trim()}>
              {busy ? l.waiting : l.useCode}
            </Btn>
            <button type="button" className="app-admin-link" onClick={() => (setView("locked"), setError(""))}>
              {l.back}
            </button>
          </form>
        )}

        <p className="app-admin-lock-error" role="alert">
          {error}
        </p>
      </div>
    </div>
  );
}

/** the recovery codes, shown once after the first key (or on regenerate) */
export function Codes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const l = t.admin.lock;
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`emOS admin recovery codes\n${new Date().toISOString().slice(0, 10)}\n\n${text}\n`], { type: "text/plain" }));
    a.download = "emos-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="app-admin-lock">
      <div className="app-admin-lock-card app-admin-codes">
        <h2 className="app-admin-lock-title">{l.codesTitle}</h2>
        <p className="app-admin-lock-lede">{l.codesLede}</p>
        <ol className="app-admin-codes-list">
          {codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ol>
        <div className="app-admin-row">
          <Btn
            onClick={() =>
              navigator.clipboard
                .writeText(text)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            {copied ? l.copied : l.copy}
          </Btn>
          <Btn onClick={download}>{l.download}</Btn>
          <Btn kind="primary" onClick={onDone}>
            {l.saved}
          </Btn>
        </div>
      </div>
    </div>
  );
}

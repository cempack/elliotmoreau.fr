"use client";

import { useId, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { PressButton } from "@/components/ui/Pressable";
import { SIGNUP_URL } from "./util";

type State = "idle" | "sending" | "done" | "exists" | "invalid" | "error";

/** same shape check as the route, so obvious typos never leave the page */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Newsletter signup (adapted from components/SubscribeForm): posts
 * { email } to /api/newsletter, which creates the Ghost member and answers
 * { ok, already, reason }.
 */
export function SubscribeForm({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const w = t.writing;
  const { blip } = useSound();
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending" || state === "done" || state === "exists") return;
    if (!EMAIL_RE.test(email.trim())) {
      setState("invalid");
      blip("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; already?: boolean; reason?: string } | null;
      if (json?.ok) {
        setState(json.already ? "exists" : "done");
        blip("success");
      } else if (json?.reason === "invalid") {
        setState("invalid");
        blip("error");
      } else {
        setState("error");
        blip("error");
      }
    } catch {
      setState("error");
      blip("error");
    }
  };

  const status = state === "done" ? w.newsDone : state === "exists" ? w.newsExists : state === "invalid" ? w.newsInvalid : state === "error" ? w.newsError : "";
  const ok = state === "done" || state === "exists";
  const bad = state === "invalid" || state === "error";

  return (
    <form onSubmit={submit} className={`app-writing-news-form ${className}`} noValidate data-state={state}>
      {!ok && (
        <div className="app-writing-news-row">
          <label htmlFor={`${id}-email`} className="sr-only">
            {w.newsLabel}
          </label>
          <input
            id={`${id}-email`}
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (bad) setState("idle");
            }}
            placeholder={w.newsPlaceholder}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={state === "invalid" || undefined}
            aria-describedby={`${id}-status`}
            className="app-writing-news-input"
          />
          <PressButton type="submit" disabled={state === "sending"} className="app-writing-news-btn">
            {state === "sending" ? w.newsSending : w.newsSubscribe}
          </PressButton>
        </div>
      )}
      <p id={`${id}-status`} className="app-writing-news-status" data-tone={ok ? "ok" : bad ? "bad" : undefined} aria-live="polite">
        {status}
        {state === "error" && (
          <>
            {" "}
            <a href={SIGNUP_URL} target="_blank" rel="noopener" className="app-writing-news-fallback">
              {w.newsFallback}
              <span aria-hidden> ↗</span>
            </a>
          </>
        )}
      </p>
    </form>
  );
}

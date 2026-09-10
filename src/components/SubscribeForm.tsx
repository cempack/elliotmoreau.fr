"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { useSound } from "@/lib/sound";

/** Newsletter signup: posts to /api/newsletter, which talks to Ghost. */
export function SubscribeForm() {
  const { t } = useLang();
  const { blip } = useSound();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "exists" | "invalid" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending" || state === "done") return;
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        already?: boolean;
        reason?: string;
      } | null;
      if (json?.ok) {
        setState(json.already ? "exists" : "done");
        blip("page");
      } else if (json?.reason === "invalid") {
        setState("invalid");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  if (state === "done" || state === "exists") {
    return (
      <p className="font-mono text-[13px] text-ember" aria-live="polite">
        {state === "done" ? t("blog.done") : t("blog.exists")}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "invalid" || state === "error") setState("idle");
          }}
          placeholder={t("blog.emailPh")}
          aria-label={t("blog.newsletterTitle")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full flex-1 rounded-[10px] border border-line bg-ink px-4 py-3 font-mono text-[13px] text-bone outline-none transition-colors placeholder:text-faint/50 focus:border-ember/60"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="shrink-0 rounded-[10px] bg-ember px-5 py-3 font-mono text-[13px] font-medium text-[#232A2E] transition-all hover:-translate-y-0.5 hover:bg-bone disabled:translate-none disabled:opacity-60"
        >
          {state === "sending" ? t("blog.sending") : t("blog.subscribe")}
        </button>
      </div>
      {(state === "invalid" || state === "error") && (
        <p className="mt-2 font-mono text-[12px] text-rust" aria-live="polite">
          {state === "invalid" ? t("blog.invalid") : t("blog.error")}
        </p>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { useToast } from "./Toasts";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useLang();
  const { notify } = useToast();
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    notify(t("contact.copied"));
    setTimeout(() => setDone(false), 1600);
  };

  return (
    <button
      onClick={copy}
      className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-line bg-panel px-4 py-2 font-mono text-xs text-sage transition-colors hover:border-ember hover:text-bone"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" />
        <path d="M8.5 3.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1" stroke="currentColor" />
      </svg>
      {done ? t("contact.copied") : label ?? t("contact.copy")}
    </button>
  );
}

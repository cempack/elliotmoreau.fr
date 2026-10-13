"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toasts";
import { useSound } from "@/lib/sound";
import { announceContentChange } from "@/lib/contentSync";
import { rpc } from "./api";
import { fill } from "./ui";

/**
 * One section's save: calls the op, toasts on success and hands back the
 * server's message (and the field it names) on failure.
 */
export function useSave(onSaved: () => void) {
  const { t } = useI18n();
  const c = t.admin.common;
  const { notify } = useToast();
  const { blip } = useSound();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const run = async (op: string, args: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    const res = await rpc(op, args);
    setSaving(false);
    if (res.ok) {
      blip("success");
      notify(c.saved, t.shell.apps.admin);
      // every open page shows it now, not on the next visit
      announceContentChange();
      onSaved();
      return true;
    }
    const message = res.error === "offline" ? c.offline : res.error === "expired" ? c.expired : (res.message ?? res.error);
    blip("error");
    setError({ message: fill(c.failed, { message }), field: res.field });
    return false;
  };

  /** the message for one field, when the server named it (prefix match: "away" covers "away.city") */
  const fieldError = (field: string) =>
    error?.field && (error.field === field || error.field.startsWith(`${field}.`) || error.field.startsWith(`${field}[`))
      ? error.message.replace(/^[^:]*:\s*/, "")
      : undefined;

  return { saving, error: error?.message, run, fieldError, clear: () => setError(null) };
}

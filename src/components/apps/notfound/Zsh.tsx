"use client";

import { useI18n } from "@/i18n/client";
import type { Suggestion } from "./suggest";

/**
 * The tiny terminal under the alert's message: what zsh would have said
 * if you'd typed the address at a prompt. When the address looks like a
 * typo, zsh's CORRECT prompt offers the fix and [nyae] really answers:
 * n(o), y(es: open it), a(bort), e(dit: search instead). The letters are
 * keyboard keys too (see NotFoundApp). zsh doesn't translate its own
 * output, so neither do we; the controls' labels are localized.
 */

export type Answer = "n" | "y" | "a" | "e";
const KEYS: Answer[] = ["n", "y", "a", "e"];

function Prompt() {
  return (
    <span className="app-nf-zsh-prompt" aria-hidden>
      ~ %
    </span>
  );
}

function Caret() {
  return <span className="app-nf-zsh-caret" aria-hidden />;
}

export function Zsh({
  command,
  suggestion,
  appName,
  answer,
  onAnswer,
}: {
  /** the failed address as typed, display-truncated */
  command: string;
  suggestion: Suggestion | null;
  /** localized name of the suggested app */
  appName: string;
  answer: Answer | null;
  onAnswer: (a: Answer) => void;
}) {
  const { t } = useI18n();
  const s = t.notfound;
  const missing = command.includes("/") ? "no such file or directory" : "command not found";
  const notFound = (
    <p className="app-nf-zsh-line">
      zsh: {missing}: {command}
    </p>
  );

  return (
    <div className="app-nf-zsh" role="group" aria-label={s.console}>
      <p className="app-nf-zsh-line">
        <Prompt /> <span className="app-nf-zsh-cmd">{command}</span>
      </p>
      {suggestion ? (
        <>
          <p className="app-nf-zsh-line">
            zsh: correct &apos;<span className="app-nf-zsh-cmd">{command}</span>&apos; to &apos;
            <span className="app-nf-zsh-fix">{suggestion.to}</span>&apos; [
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className="app-nf-zsh-key"
                data-cursor=""
                data-picked={answer === k || undefined}
                disabled={answer != null}
                aria-label={s.answers[k].replace("{app}", appName)}
                aria-keyshortcuts={k}
                onClick={() => onAnswer(k)}
              >
                {k}
              </button>
            ))}
            ]? {answer ? <span className="app-nf-zsh-answer">{answer}</span> : <Caret />}
          </p>
          {answer === "n" && notFound}
          {(answer === "n" || answer === "a") && (
            <p className="app-nf-zsh-line">
              <Prompt /> <Caret />
            </p>
          )}
        </>
      ) : (
        <>
          {notFound}
          <p className="app-nf-zsh-line">
            <Prompt /> <Caret />
          </p>
        </>
      )}
    </div>
  );
}

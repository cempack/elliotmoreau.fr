"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useFinePointer } from "@/hooks/env";
import { shortTarget, type Suggestion } from "./suggest";

/**
 * The tiny terminal under the alert's message: what zsh would have said
 * if you'd typed the address at a prompt. When the address looks like a
 * typo, zsh's CORRECT prompt offers the fix and [nyae] really answers:
 * n(o), y(es: open it), a(bort), e(dit: search instead). The letters are
 * keyboard keys anywhere on the page (see NotFoundApp); with a mouse they
 * are also tiny buttons, one Tab stop with ←/→ between them. On touch
 * they stay text: they'd be 9px targets, and the alert's own buttons
 * already say yes (Open) and edit (Search).
 *
 * zsh doesn't translate its own output, so neither do we: those runs are
 * tagged English for screen readers; the controls' labels are localized.
 * The address is isolated (<bdi>) so no direction override in a URL can
 * mirror the rest of the line.
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

function Keys({
  answer,
  target,
  onAnswer,
}: {
  answer: Answer | null;
  /** what "y" opens, already localized */
  target: string;
  onAnswer: (a: Answer) => void;
}) {
  const { t } = useI18n();
  const fine = useFinePointer();
  const [active, setActive] = useState(1); // "y": the answer you most likely want
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!fine) {
    return (
      <>
        [
        {KEYS.map((k) => (
          <span key={k} className="app-nf-zsh-key" data-picked={answer === k || undefined}>
            {k}
          </span>
        ))}
        ]?
      </>
    );
  }

  const move = (to: number) => {
    const i = (to + KEYS.length) % KEYS.length;
    setActive(i);
    refs.current[i]?.focus();
  };

  return (
    <>
      [
      <span
        role="toolbar"
        aria-label={t.notfound.answerGroup}
        className="app-nf-zsh-keys"
        onKeyDown={(e) => {
          if (answer) return;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") move(active + 1);
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(active - 1);
          else if (e.key === "Home") move(0);
          else if (e.key === "End") move(KEYS.length - 1);
          else return;
          e.preventDefault();
        }}
      >
        {KEYS.map((k, i) => (
          <button
            key={k}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="app-nf-zsh-key app-nf-zsh-key--btn"
           
            data-picked={answer === k || undefined}
            // answered: inert, but never `disabled` (that would drop focus on <body>)
            aria-disabled={answer != null || undefined}
            tabIndex={answer == null && i === active ? 0 : -1}
            aria-label={`${k}, ${t.notfound.answers[k].replace("{app}", target)}`}
            aria-keyshortcuts={k}
            onFocus={() => setActive(i)}
            onClick={() => {
              if (answer == null) onAnswer(k);
            }}
          >
            {k}
          </button>
        ))}
      </span>
      ]?
    </>
  );
}

export function Zsh({
  command,
  suggestion,
  target,
  answer,
  onAnswer,
}: {
  /** the failed address as typed, display-truncated */
  command: string;
  suggestion: Suggestion | null;
  /** localized name of what the suggestion opens */
  target: string;
  answer: Answer | null;
  onAnswer: (a: Answer) => void;
}) {
  const { t } = useI18n();
  const missing = command.includes("/") ? "no such file or directory" : "command not found";
  const cmd = (
    <bdi className="app-nf-zsh-cmd" translate="no">
      {command}
    </bdi>
  );
  const notFound = (
    <p className="app-nf-zsh-line" lang="en">
      zsh: {missing}: {cmd}
    </p>
  );
  const idle = (
    <p className="app-nf-zsh-line">
      <Prompt /> <Caret />
    </p>
  );

  return (
    <div className="app-nf-zsh" role="group" aria-label={t.notfound.console}>
      <p className="app-nf-zsh-line">
        <Prompt /> {cmd}
      </p>
      {suggestion ? (
        <>
          <p className="app-nf-zsh-line">
            <span lang="en">
              zsh: correct &apos;{cmd}&apos; to &apos;
              <bdi className="app-nf-zsh-fix" translate="no" title={suggestion.to}>
                {shortTarget(suggestion.to)}
              </bdi>
              &apos;
            </span>{" "}
            <span className="app-nf-zsh-ask">
              <Keys answer={answer} target={target} onAnswer={onAnswer} />{" "}
              {answer ? (
                <span className="app-nf-zsh-answer" lang="en">
                  {answer}
                </span>
              ) : (
                <Caret />
              )}
            </span>
          </p>
          {answer === "n" && notFound}
          {(answer === "n" || answer === "a") && idle}
        </>
      ) : (
        <>
          {notFound}
          {idle}
        </>
      )}
    </div>
  );
}

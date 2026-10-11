"use client";

import { m, useTransform, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { Glass } from "@/components/os/Glass";
import { PressButton, PressLink } from "@/components/ui/Pressable";
import { BrokenIcon } from "./BrokenIcon";
import { Zsh, type Answer } from "./Zsh";
import type { Suggestion } from "./suggest";
import type { useTether } from "./useTether";

/**
 * The macOS-style alert: a broken pixel app icon, the bold "can't be
 * opened" line, the informative text, a zsh transcript, and its buttons
 * (two side by side; three stacked when there's an app to suggest, the
 * default one in lime, last). The whole sheet of glass is the drag
 * handle; the controls on it are not.
 */
export function Alert({
  tether,
  shake,
  surfaceRef,
  reduced,
  path,
  fullPath,
  command,
  suggestion,
  suggestHref,
  appName,
  answer,
  onAnswer,
  onSearch,
}: {
  tether: ReturnType<typeof useTether>;
  shake: MotionValue<number>;
  surfaceRef: React.RefObject<HTMLElement | null>;
  reduced: boolean;
  /** the failed address, display-truncated, with its leading slash */
  path: string;
  fullPath: string;
  command: string;
  suggestion: Suggestion | null;
  suggestHref: string;
  appName: string;
  answer: Answer | null;
  onAnswer: (a: Answer) => void;
  onSearch: () => void;
}) {
  const { t, path: href } = useI18n();
  const s = t.notfound;
  const [before, after = ""] = s.title.split("{path}");
  const offering = suggestion != null && answer !== "n" && answer !== "a";
  // the fragments feel every push the alert gets, shakes included
  const ox = useTransform(() => tether.x.get() + shake.get());

  const desktop = (
    <PressLink href={href("/")} className="app-nf-btn app-nf-btn--primary" data-cursor="" data-default={!offering || undefined}>
      {s.desktop}
    </PressLink>
  );
  const desktopQuiet = (
    <PressLink href={href("/")} className="app-nf-btn" data-cursor="">
      {s.desktop}
    </PressLink>
  );
  const search = (
    <PressButton
      className="app-nf-btn"
      data-cursor=""
      onClick={onSearch}
      aria-keyshortcuts="Meta+K Control+K"
    >
      {s.search}
    </PressButton>
  );

  return (
    <m.div className="app-nf-pop" style={{ x: shake }}>
      <m.section
        ref={surfaceRef as React.RefObject<HTMLElement>}
        className="app-nf-alert"
        aria-labelledby="app-nf-title"
        aria-describedby="app-nf-body"
        data-cursor={s.drag}
        style={tether.style}
        {...tether.handlers}
      >
        <m.span className="app-nf-alert-lift" style={{ opacity: tether.lift }} aria-hidden />
        <Glass thickness="thick" className="app-nf-alert-glass" aria-hidden />

        <div className="app-nf-alert-body">
          <BrokenIcon size={64} ox={ox} oy={tether.y} loose={!reduced} />

          <h1 id="app-nf-title" className="app-nf-title">
            {before}
            <span className="app-nf-path" title={fullPath}>
              {path}
            </span>
            {after}
          </h1>
          <p id="app-nf-body" className="app-nf-text">
            {offering ? s.bodySuggest.replace("{app}", appName) : s.body}
          </p>

          <Zsh command={command} suggestion={suggestion} appName={appName} answer={answer} onAnswer={onAnswer} />

          {offering ? (
            <div className="app-nf-actions app-nf-actions--stack">
              <PressLink
                href={suggestHref}
                transitionTypes={["app-open"]}
                className="app-nf-btn app-nf-btn--primary"
                data-cursor=""
                data-default=""
              >
                {s.open.replace("{app}", appName)}
              </PressLink>
              <div className="app-nf-actions-row">
                {search}
                {desktopQuiet}
              </div>
            </div>
          ) : (
            <div className="app-nf-actions">
              {search}
              {desktop}
            </div>
          )}
        </div>
      </m.section>
    </m.div>
  );
}

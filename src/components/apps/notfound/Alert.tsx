"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { Glass } from "@/components/os/Glass";
import { spring } from "@/lib/motion";
import { PressAnchor, PressButton, PressLink } from "@/components/ui/Pressable";
import { BrokenIcon } from "./BrokenIcon";
import { DragHint } from "./DragHint";
import { Zsh, type Answer } from "./Zsh";
import type { Suggestion } from "./suggest";
import type { useTether } from "./useTether";

/**
 * The macOS-style alert: a broken pixel app icon, the bold "can't be
 * opened" line, the informative text, a zsh transcript, and its buttons
 * (two side by side; three stacked when there's something to suggest,
 * the default one in lime). The whole sheet of glass is the drag handle
 * (a quiet cursor ring over it, and after a moment's rest a small "Drag
 * me" pill beside the pointer); the controls on it are not. It's an
 * alertdialog that takes focus as it appears. When an answer changes the
 * copy, the sheet resizes on a spring instead of jumping.
 */

/** The house default (a physics spring: interruptible, velocity-aware). */
const RESIZE = spring.default;

/** A plain left click (not one that opens a new tab). */
const plainClick = (e: React.MouseEvent) =>
  !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

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
  target,
  openLabel,
  bodyText,
  answer,
  onAnswer,
  onSearch,
  onDesktop,
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
  /** localized name of what the suggestion opens */
  target: string;
  /** the default button's label when suggesting */
  openLabel: string;
  bodyText: string;
  answer: Answer | null;
  onAnswer: (a: Answer) => void;
  onSearch: () => void;
  /** the Desktop buttons: the alert flies into the Dock, then navigates */
  onDesktop: () => void;
}) {
  const { t, path: href } = useI18n();
  const s = t.notfound;
  const [before, after = ""] = s.title.split("{path}");
  const offering = suggestion != null && answer !== "n" && answer !== "a";
  // the fragments feel every push the alert gets, shakes included
  const ox = useTransform(() => tether.x.get() + shake.get());

  // the sheet's height follows its content on a spring (answers change the
  // copy and the buttons); the first measure is instant
  const bodyRef = useRef<HTMLDivElement>(null);
  const height = useMotionValue<number | "auto">("auto");
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const ro = new ResizeObserver(() => {
      const h = body.offsetHeight;
      const cur = height.get();
      if (cur === "auto" || reduced) height.jump(h);
      else if (Math.abs(cur - h) > 0.5) animate(height, h, RESIZE);
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [height, reduced]);

  const desktopClick = (e: React.MouseEvent) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    onDesktop();
  };
  const desktop = (primary: boolean) => (
    <PressLink
      href={href("/")}
      className={primary ? "app-nf-btn app-nf-btn--primary" : "app-nf-btn"}
     
      onClick={desktopClick}
    >
      {s.desktop}
    </PressLink>
  );
  const search = (
    <PressButton className="app-nf-btn" onClick={onSearch} aria-keyshortcuts="Meta+K Control+K">
      {s.search}
    </PressButton>
  );
  const open =
    suggestion?.kind === "app" ? (
      <PressLink
        href={suggestHref}
        transitionTypes={["app-open"]}
        className="app-nf-btn app-nf-btn--primary"
       
      >
        <span className="app-nf-btn-label">{openLabel}</span>
      </PressLink>
    ) : (
      <PressAnchor href={suggestHref} className="app-nf-btn app-nf-btn--primary">
        <span className="app-nf-btn-label">{openLabel}</span>
        <span className="app-nf-btn-out" aria-hidden>
          ↗
        </span>
      </PressAnchor>
    );

  return (
    <m.div className="app-nf-pop" style={{ x: shake }}>
      <m.section
        ref={surfaceRef as React.RefObject<HTMLElement>}
        className="app-nf-alert"
        role="alertdialog"
        tabIndex={-1}
        aria-labelledby="app-nf-title"
        aria-describedby="app-nf-body"
       
        style={tether.style}
        {...tether.handlers}
      >
        <m.span className="app-nf-alert-lift" style={{ opacity: tether.lift }} aria-hidden />
        <Glass thickness="thick" className="app-nf-alert-glass" aria-hidden />

        <m.div className="app-nf-alert-sizer" style={{ height }}>
          <div ref={bodyRef} className="app-nf-alert-body">
            <span className="app-nf-grip">
              <BrokenIcon size={64} ox={ox} oy={tether.y} loose={!reduced} />
            </span>

            <h1 id="app-nf-title" className="app-nf-title">
              {before}
              <bdi className="app-nf-path" title={fullPath} translate="no">
                {path}
              </bdi>
              {after}
            </h1>
            <p key={bodyText} id="app-nf-body" className="app-nf-text app-nf-swap">
              {bodyText}
            </p>

            <Zsh command={command} suggestion={suggestion} target={target} answer={answer} onAnswer={onAnswer} />

            {offering ? (
              <div key="offer" className="app-nf-actions app-nf-actions--stack app-nf-swap">
                {open}
                <div className="app-nf-actions-row">
                  {search}
                  {desktop(false)}
                </div>
              </div>
            ) : (
              <div key="plain" className="app-nf-actions app-nf-swap">
                {search}
                {desktop(true)}
              </div>
            )}
          </div>
        </m.div>
        <DragHint surfaceRef={surfaceRef} label={s.drag} />
      </m.section>
    </m.div>
  );
}

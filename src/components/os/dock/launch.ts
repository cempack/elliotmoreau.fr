"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { scrollToY } from "@/lib/scroller";
import { APPS, type AppDef } from "../apps";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The launch nod: one hop up and a gravity fall back to the shelf. Plays
 * on the icon's own bounce layer (WAAPI, compositor-only), never under
 * reduced motion.
 */
export function bounce(el: Element | null | undefined, height = 16) {
  if (!(el instanceof HTMLElement) || reducedMotion()) return;
  for (const a of el.getAnimations()) a.cancel();
  el.animate(
    [
      { transform: "translateY(0)", easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
      { transform: `translateY(${-height}px)`, offset: 0.4, easing: "cubic-bezier(0.6, 0, 0.85, 0.5)" },
      { transform: "translateY(0)" },
    ],
    { duration: 620 }
  );
}

/** The visible icon for an app (desktop dock or mobile tab bar). */
export function visibleIcon(id: string) {
  const all = document.querySelectorAll<HTMLElement>(`[data-dock-launch="${id}"]`);
  for (const el of all) if (el.getClientRects().length) return el;
  return null;
}

/** Plain left click, no modifiers: the link opens here, so it's a launch. */
export function isPlainClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** Tapping the app you're already in glides back to its top (iOS tab bars). */
export function scrollToTop() {
  scrollToY(0, !reducedMotion());
}

/** Press feedback on pointer-down, released on up/cancel/leave. */
export const pressHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
    if (e.button === 0) e.currentTarget.dataset.pressed = "";
  },
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
    delete e.currentTarget.dataset.pressed;
  },
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
    delete e.currentTarget.dataset.pressed;
  },
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
    delete e.currentTarget.dataset.pressed;
  },
};

function editable(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || !!t.closest("input, textarea, select, [role='textbox'], [role='combobox']");
}

/** Digit keys by physical position too, so AZERTY works without Shift. */
function digitOf(e: KeyboardEvent) {
  if (/^[1-9]$/.test(e.key)) return e.key;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? m[1] : null;
}

/**
 * Number keys 1–6 open apps (app.key), unless the user is typing or a
 * dialog/sheet is open. Bounces the visible dock icon, then navigates
 * with the "app-open" transition.
 */
export function useAppShortcuts(activeId: AppDef["id"]) {
  const router = useRouter();
  const { path } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const d = digitOf(e);
      const app = d && APPS.find((a) => a.key === d);
      if (!app) return;
      if (editable(e.target) || editable(document.activeElement)) return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      e.preventDefault();
      if (app.id === activeId) return;
      bounce(visibleIcon(app.id)?.querySelector("[data-dock-bounce]"));
      router.push(path(app.path), { transitionTypes: ["app-open"] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, path, router]);
}

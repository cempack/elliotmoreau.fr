"use client";

/**
 * Apps scroll inside their window (`.os-win-main`), like a tiled window
 * on a desktop; anything outside a window scrolls the page. These helpers
 * address whichever one is live, so app code never has to know.
 */
export function scroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".os-win-main");
}

/** Current scroll offset of the live scroller. */
export function scrollTop(): number {
  const s = scroller();
  return s ? s.scrollTop : window.scrollY;
}

/** Largest scroll offset of the live scroller. */
export function scrollMax(): number {
  const s = scroller();
  return s ? s.scrollHeight - s.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
}

/** The scroller's top edge in viewport px (0 for the page). */
export function scrollerTop(): number {
  const s = scroller();
  return s ? s.getBoundingClientRect().top : 0;
}

/** The scroller's bottom edge in viewport px (the viewport's for the page). */
export function scrollerBottom(): number {
  const s = scroller();
  return s ? s.getBoundingClientRect().bottom : window.innerHeight;
}

/** An element's offset from the top of the scrolled content. */
export function contentTop(el: Element): number {
  return el.getBoundingClientRect().top - scrollerTop() + scrollTop();
}

export function scrollToY(y: number, smooth = false) {
  const s = scroller();
  const opts: ScrollToOptions = { top: Math.max(0, y), behavior: smooth ? "smooth" : "instant" };
  if (s) s.scrollTo(opts);
  else window.scrollTo(opts);
}

export function scrollByY(dy: number, smooth = false) {
  scrollToY(scrollTop() + dy, smooth);
}

/** Listen to the live scroller; returns the cleanup. */
export function onScroll(cb: () => void): () => void {
  const target: HTMLElement | Window = scroller() ?? window;
  target.addEventListener("scroll", cb, { passive: true });
  return () => target.removeEventListener("scroll", cb);
}

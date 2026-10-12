"use client";

import type { AppId } from "./apps";

/**
 * A miniature of every window opened in this visit, for the overview:
 * the window's own DOM, cloned as it was the moment it was left (or, for
 * the window on screen, the moment the overview opens), with its canvases'
 * pixels, its form values and its scroll positions carried over. Shown
 * scaled down and inert; never re-rendered, so it costs nothing while
 * the overview is closed.
 */
export type Shot = {
  node: HTMLElement;
  /** the window's size when it was taken, in CSS px */
  w: number;
  h: number;
  /** where it sat on screen (the overview flies a card back to it) */
  x: number;
  y: number;
  /** scrolled boxes in the clone, put back once it is attached */
  scroll: { el: Element; top: number; left: number }[];
};

const shots = new Map<AppId, Shot>();

/**
 * Clone a window; cheap enough to run as it unmounts. Only what shows is
 * kept: anything wholly outside the window (rows scrolled away, the rest
 * of a long page) is emptied and pinned to the size it had, so the copy
 * lays out the same with a fraction of the elements, and the overview
 * never styles what no one can see.
 */
export function captureWindow(app: AppId, win: HTMLElement | null | undefined) {
  if (!win || !win.isConnected) return;
  const w = win.offsetWidth;
  const h = win.offsetHeight;
  if (!w || !h) return;
  const box = win.getBoundingClientRect();
  const node = win.cloneNode(true) as HTMLElement;
  const scroll: Shot["scroll"] = [];
  still(win, node);
  copy(win, node, box, scroll);
  node.removeAttribute("id");
  node.removeAttribute("style");
  node.removeAttribute("data-dragging");
  node.removeAttribute("data-grabbed");
  shots.set(app, { node, w, h, x: box.left + (box.width - w) / 2, y: box.top + (box.height - h) / 2, scroll });
}

/**
 * A copy is a still picture: what would move, blur what's behind it, take a
 * layer of its own or join a page transition is switched off on the copied
 * element itself (a rule on every descendant of the miniature would be
 * matched against every element of the page, on every style change).
 */
function still(from: Element, to: Element) {
  const cs = getComputedStyle(from);
  const st = (to as HTMLElement).style;
  if (!st) return;
  if (cs.animationName !== "none") st.setProperty("animation", "none");
  if (cs.backdropFilter && cs.backdropFilter !== "none") {
    st.setProperty("backdrop-filter", "none");
    st.setProperty("-webkit-backdrop-filter", "none");
  }
  if (cs.willChange !== "auto") st.setProperty("will-change", "auto");
  if (cs.viewTransitionName && cs.viewTransitionName !== "none") st.setProperty("view-transition-name", "none");
}

/** walk the window and its clone side by side: carry live state over, empty what's out of sight */
function copy(from: Element, to: Element, box: DOMRect, scroll: Shot["scroll"]) {
  const a = from.children;
  const b = to.children;
  for (let i = 0; i < a.length && i < b.length; i++) {
    const x = a[i];
    const y = b[i];
    if (y.id) y.removeAttribute("id");
    // svg internals (gradients, clip paths) have no box of their own: an svg is kept whole
    if (x instanceof SVGElement) continue;
    const rects = x.getClientRects();
    if (!rects.length) {
      // not rendered (display: none): nothing in it shows, unless it only lends its children (display: contents)
      if (getComputedStyle(x).display !== "contents") y.replaceChildren();
      else copy(x, y, box, scroll);
      continue;
    }
    still(x, y);
    const r = x.getBoundingClientRect();
    if (r.bottom < box.top || r.top > box.bottom || r.right < box.left || r.left > box.right) {
      // out of sight: an empty box the same size holds its place
      y.replaceChildren();
      (y as HTMLElement).style?.setProperty("box-sizing", "border-box");
      (y as HTMLElement).style?.setProperty("width", `${r.width}px`);
      (y as HTMLElement).style?.setProperty("height", `${r.height}px`);
      (y as HTMLElement).style?.setProperty("flex", "none");
      continue;
    }
    if (x instanceof HTMLCanvasElement) {
      const c = y as HTMLCanvasElement;
      try {
        c.width = x.width;
        c.height = x.height;
        c.getContext("2d")?.drawImage(x, 0, 0);
      } catch {}
    } else if (x instanceof HTMLTextAreaElement) {
      y.textContent = x.value;
    } else if (x instanceof HTMLInputElement) {
      y.setAttribute("value", x.value);
    }
    if (x.scrollTop > 0 || x.scrollLeft > 0) scroll.push({ el: y, top: x.scrollTop, left: x.scrollLeft });
    copy(x, y, box, scroll);
  }
}

/** the window on screen, as it is right now */
export function captureCurrent() {
  const win = document.querySelector<HTMLElement>(".os-stage .os-win[data-app]");
  const app = win?.dataset.app as AppId | undefined;
  if (app && app !== "admin") captureWindow(app, win);
}

export const getShot = (app: AppId) => shots.get(app);

/** put a miniature in its card (scrolled as it was); returns the undo */
export function attachShot(shot: Shot, box: HTMLElement) {
  box.appendChild(shot.node);
  if (!shot.scroll.length) return () => shot.node.remove();
  // scrolled boxes are put back once the copy has laid out, in the frame's own
  // layout (setting a scroll offset right away would force one)
  const ro = new ResizeObserver(() => {
    ro.disconnect();
    for (const s of shot.scroll) {
      s.el.scrollTop = s.top;
      s.el.scrollLeft = s.left;
    }
  });
  ro.observe(shot.node);
  return () => {
    ro.disconnect();
    shot.node.remove();
  };
}
export const dropShot = (app: AppId) => void shots.delete(app);

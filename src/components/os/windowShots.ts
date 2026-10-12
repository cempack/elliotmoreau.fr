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

/** clone a window; cheap enough to run as it unmounts (a few ms for the largest app) */
export function captureWindow(app: AppId, win: HTMLElement | null | undefined) {
  if (!win || !win.isConnected) return;
  const w = win.offsetWidth;
  const h = win.offsetHeight;
  if (!w || !h) return;
  const box = win.getBoundingClientRect();
  const node = win.cloneNode(true) as HTMLElement;
  const from = win.getElementsByTagName("*");
  const to = node.getElementsByTagName("*");
  const scroll: Shot["scroll"] = [];
  for (let i = 0; i < from.length && i < to.length; i++) {
    const a = from[i];
    const b = to[i];
    if (b.id) b.removeAttribute("id");
    if (a instanceof HTMLCanvasElement) {
      const c = b as HTMLCanvasElement;
      try {
        c.width = a.width;
        c.height = a.height;
        c.getContext("2d")?.drawImage(a, 0, 0);
      } catch {}
    } else if (a instanceof HTMLTextAreaElement) {
      b.textContent = a.value;
    } else if (a instanceof HTMLInputElement) {
      b.setAttribute("value", a.value);
    }
    if (a.scrollTop > 0 || a.scrollLeft > 0) scroll.push({ el: b, top: a.scrollTop, left: a.scrollLeft });
  }
  node.removeAttribute("id");
  node.removeAttribute("style");
  node.removeAttribute("data-dragging");
  node.removeAttribute("data-grabbed");
  shots.set(app, { node, w, h, x: box.left + (box.width - w) / 2, y: box.top + (box.height - h) / 2, scroll });
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
  for (const s of shot.scroll) {
    s.el.scrollTop = s.top;
    s.el.scrollLeft = s.left;
  }
  return () => shot.node.remove();
}
export const dropShot = (app: AppId) => void shots.delete(app);

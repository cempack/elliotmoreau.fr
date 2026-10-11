import type { AppId } from "../apps";

/**
 * Geometry shared by the window chrome, its page transitions and the
 * throw-to-close gesture: where an app's icon sits in the Dock, and the
 * CSS variables the ::view-transition rules in window.css read to grow a
 * window out of (and shrink it back into) that icon.
 */

type Point = { x: number; y: number };

/** Center of the app's Dock icon in viewport px (falls back to the Dock's middle). */
export function dockIconCenter(app: AppId, href: string): Point {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the visible Dock / tab bar slot, aimed at its icon (not the label)
  let el: HTMLElement | null = null;
  for (const slot of document.querySelectorAll<HTMLElement>(`[data-dock-launch="${app}"]`)) {
    if (!slot.getClientRects().length) continue;
    el = slot.querySelector<HTMLElement>("[data-dock-icon], [data-dock-bounce]") ?? slot;
    break;
  }
  if (!el) {
    // any visible link to the app in the bottom band of the screen
    for (const a of document.querySelectorAll<HTMLElement>(`a[href="${href}"]`)) {
      const r = a.getBoundingClientRect();
      if (r.width > 0 && r.width < 160 && r.top > vh * 0.55) {
        el = a;
        break;
      }
    }
  }
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: vw / 2, y: vh - 40 };
}

/**
 * A window closed from the keyboard hands focus to its Dock icon once the
 * Desktop has committed (macOS returns focus to the Dock), instead of
 * dropping it on <body>. AppWindow marks it, the Dock takes it.
 */
let keyboardClose: AppId | null = null;
export function markKeyboardClose(app: AppId) {
  keyboardClose = app;
}
export function takeKeyboardClose() {
  const app = keyboardClose;
  keyboardClose = null;
  return app;
}

/** Bottom edge of the menu bar in viewport px. */
function menubarBottom() {
  const bar = document.querySelector<HTMLElement>("[data-os-menubar], .os-menubar");
  if (bar) {
    const r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top <= 1) return r.bottom;
  }
  const probe = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return 2.75 * probe;
}

const px = (v: number) => `${Math.round(v * 10) / 10}px`;

type VTDocument = Document & {
  __reactViewTransition?: ViewTransition | null;
  activeViewTransition?: ViewTransition | null;
};
let vtToken = 0;
let vtTimer = 0;

/**
 * React leaves the page "live" under transitions that don't touch the
 * root, where a frosted group has nothing to blur: html[data-os-vt] asks
 * window.css to capture the root while a window comes or goes, until that
 * transition finishes.
 */
function markWindowTransition() {
  const root = document.documentElement;
  const token = ++vtToken;
  const clear = () => {
    if (token === vtToken) delete root.dataset.osVt;
  };
  root.dataset.osVt = "";
  window.clearTimeout(vtTimer);
  const doc = document as VTDocument;
  const vt = doc.__reactViewTransition ?? doc.activeViewTransition;
  vt?.finished.then(clear, clear);
  vtTimer = window.setTimeout(clear, vt ? 6000 : 1500);
}

/**
 * Writes the geometry of a window snapshot for window.css. The
 * ::view-transition-group is cut down to the part of the window that is on
 * screen below the menu bar (`t` from its top, `vis` tall) so a long page
 * reads as a window, not a column; the group carries the frosted backdrop
 * and the shadow, and scales about the Dock icon (`ox`, `oy` in its own
 * coordinates; `gx`, `gy` let the keyframes undo the scale's effect on the
 * group's positioning transform).
 */
function writeGeometry(prefix: "in" | "out", r: DOMRect, top: number, icon: Point) {
  markWindowTransition();
  const vh = window.innerHeight;
  const t = Math.max(0, menubarBottom() - top);
  const vis = Math.max(1, Math.min(top + r.height, vh) - (top + t));
  const s = document.documentElement.style;
  const set = (k: string, v: number) => s.setProperty(`--os-vt-${prefix}-${k}`, px(v));
  set("gx", r.left);
  set("gy", top);
  set("t", t);
  set("vis", vis);
  set("h", r.height);
  set("cb", Math.max(0, r.height - t - vis));
  set("ox", icon.x - r.left);
  set("oy", icon.y - (top + t));
}

/**
 * The entering window grows out of its Dock icon. Until `settled`, the
 * top assumes the post-navigation scroll reset (Next scrolls the new page
 * to the top after layout effects run); a frame later it is measured for
 * real.
 */
export function setEnterOrigin(el: HTMLElement, app: AppId, href: string, settled = false) {
  const r = el.getBoundingClientRect();
  if (r.height === 0) return;
  writeGeometry("in", r, settled ? r.top : r.top + window.scrollY, dockIconCenter(app, href));
}

/** The leaving window shrinks back into its Dock icon, from where it is. */
export function setExitOrigin(el: HTMLElement, app: AppId, href: string) {
  const r = el.getBoundingClientRect();
  if (r.height === 0) return;
  writeGeometry("out", r, r.top, dockIconCenter(app, href));
}

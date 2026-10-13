import type { AppId } from "../apps";

/**
 * Geometry shared by the window chrome, its page transitions and the
 * throw-to-close gesture: where an app's icon sits in the Dock, and the
 * animations that grow a window out of (and shrink it back into) that icon.
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
    // inside an app the phone's tab bar has slid away (or is sliding):
    // aim at where the icon rests once it's back, not at where it hides
    let dy = 0;
    const bar = el.closest<HTMLElement>(".os-tabbar-list");
    if (bar) {
      const t = getComputedStyle(bar).transform;
      if (t && t !== "none") dy = new DOMMatrixReadOnly(t).m42;
    }
    if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 - dy };
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

/** Bottom edge of the menu bar in viewport px (its height plus any top inset). */
export function menubarBottom() {
  const bar = document.querySelector<HTMLElement>("[data-os-menubar], .os-menubar");
  if (bar) {
    const r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top <= 1) return r.bottom;
  }
  const probe = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return 2.75 * probe;
}

/**
 * The geometry of a window's page transition, and the transition itself.
 * The ::view-transition-group is cut down to the part of the window that
 * is on screen below the menu bar (`t` from its top, `vis` tall) so a long
 * page reads as a window, not a column; it scales about the Dock icon
 * (`ox`, `oy` in its own coordinates; `gx`, `gy` let the keyframes undo the
 * scale's effect on the group's positioning transform). window.css gives
 * the group its tint, corners and shadow.
 *
 * The motion runs as Web Animations on the transition's pseudo-elements
 * (React's ViewTransition hands them over in onEnter / onExit), never as
 * CSS reading custom properties: any stylesheet write, even one rule on
 * ::view-transition, restyles every element of the page, and that happened
 * up to three times per open and close.
 */
export type VtGeo = { gx: number; gy: number; t: number; vis: number; h: number; cb: number; ox: number; oy: number };

function geometry(r: DOMRect, icon: Point): VtGeo {
  const vh = window.innerHeight;
  const top = r.top;
  const t = Math.max(0, menubarBottom() - top);
  const vis = Math.max(1, Math.min(top + r.height, vh) - (top + t));
  return { gx: r.left, gy: top, t, vis, h: r.height, cb: Math.max(0, r.height - t - vis), ox: icon.x - r.left, oy: icon.y - (top + t) };
}

/** The entering window's geometry, measured once its snapshot is taken (the layout is settled by then). */
export function enterGeometry(el: HTMLElement, app: AppId, href: string): VtGeo | null {
  const r = el.getBoundingClientRect();
  return r.height ? geometry(r, dockIconCenter(app, href)) : null;
}

/** The leaving window's geometry for onExit: measured while it sits idle (or, closed before that, as it unmounts). */
const exits = new Map<AppId, VtGeo>();
export function setExitOrigin(el: HTMLElement, app: AppId, href: string) {
  const r = el.getBoundingClientRect();
  if (r.height) exits.set(app, geometry(r, dockIconCenter(app, href)));
}
export function takeExitGeometry(app: AppId): VtGeo | null {
  const g = exits.get(app) ?? null;
  exits.delete(app);
  return g;
}

type Pseudo = { animate(keyframes: Keyframe[], options?: KeyframeAnimationOptions): Animation };
/** React's ViewTransitionInstance as it is at run time (its published type only has `name`) */
export type VtInstance = { group: Pseudo; imagePair: Pseudo; old: Pseudo; new: Pseudo };

/** a critically damped spring, sampled: opaque within ~60ms, settled by 300 */
const SPRING =
  "linear(0, 0.014 2%, 0.051 4%, 0.103 6%, 0.163 8%, 0.228 10%, 0.327 13%, 0.422 16%, 0.537 20%, 0.636 24%, 0.717 28%, 0.796 33%, 0.855 38%, 0.905 44%, 0.939 50%, 0.964 57%, 0.98 65%, 0.991 75%, 0.996 87%, 1)";
const px = (v: number) => `${Math.round(v * 10) / 10}px`;
// read once: a computed-style read mid-transition would flush the page's styles
let corner = "";
const radius = () => (corner ||= getComputedStyle(document.documentElement).getPropertyValue("--radius-window").trim() || "12px");

/** what holds still for the whole transition: where the group sits, the snapshot inside it, its clip */
function frame(inst: VtInstance, side: "new" | "old", g: VtGeo, duration: number, origin?: string) {
  const hold = (k: Keyframe) => [k, k];
  const opts = { duration, fill: "both" as const };
  inst.group.animate(hold({ top: px(g.t), height: px(g.vis), transformOrigin: origin ?? `${px(g.ox)} ${px(g.oy)}` }), opts);
  inst.imagePair.animate(hold({ inset: "auto", top: px(-g.t), left: "0px", width: "100%", height: px(g.h) }), opts);
  inst[side].animate(hold({ clipPath: `inset(${px(g.t)} 0 ${px(g.cb)} 0 round ${radius()})` }), opts);
}

/**
 * app-open: out of the Dock icon itself, from roughly icon size, on the
 * spring; opaque within ~60ms so the first frames read as something leaving
 * the icon. app-in: a quick fade. Reduced motion: a 150ms fade.
 */
export function animateEnter(inst: VtInstance, kind: "app-open" | "app-in", g: VtGeo, reduced: boolean) {
  if (reduced || kind === "app-in") {
    const duration = reduced ? 150 : 130;
    frame(inst, "new", g, duration);
    inst.group.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: reduced ? "linear" : "cubic-bezier(0.2, 0, 0, 1)", fill: "both" });
    return;
  }
  frame(inst, "new", g, 300);
  inst.group.animate(
    [
      { scale: "0.07", translate: `${px(0.93 * g.gx)} ${px(0.93 * g.gy)}` },
      { scale: "1", translate: "0px 0px" },
    ],
    { duration: 300, easing: SPRING, fill: "both" }
  );
  inst.group.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 70, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "both" });
}

/**
 * app-close: the same path back into the icon, fading as it lands.
 * app-leave: it recedes a little while another app opens over it. app-out:
 * a quick fade. Short on purpose: the page can't be clicked while a
 * transition runs. Reduced motion: a 150ms fade.
 */
export function animateExit(inst: VtInstance, kind: "app-close" | "app-leave" | "app-out", g: VtGeo, reduced: boolean) {
  if (reduced || kind === "app-out") {
    const [duration, delay] = reduced ? [150, 0] : [110, 30];
    frame(inst, "old", g, duration + delay);
    inst.group.animate([{ opacity: 1 }, { opacity: 0 }], { duration, delay, easing: reduced ? "linear" : "cubic-bezier(0.4, 0, 1, 1)", fill: "both" });
    return;
  }
  if (kind === "app-close") {
    frame(inst, "old", g, 240);
    inst.group.animate(
      [
        { scale: "1", translate: "0px 0px" },
        { scale: "0.07", translate: `${px(0.93 * g.gx)} ${px(0.93 * g.gy)}` },
      ],
      { duration: 230, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)", fill: "both" }
    );
    inst.group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, delay: 120, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "both" });
    return;
  }
  frame(inst, "old", g, 180, "50% 50%");
  inst.group.animate(
    [
      { scale: "1", translate: "0px 0px" },
      { scale: "0.96", translate: `${px(0.04 * g.gx)} ${px(0.04 * g.gy)}` },
    ],
    { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "both" }
  );
  inst.group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, delay: 40, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "both" });
}

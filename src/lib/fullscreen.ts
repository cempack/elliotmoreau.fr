import { useSyncExternalStore } from "react";

/**
 * The whole page in full screen (the Fullscreen API on <html>), for the
 * emOS menu and Spotlight. Safari on iPad still speaks the prefixed
 * dialect; iPhone has no element full screen at all, so the button hides
 * there (supported() is false).
 */

type FsDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as FsDoc;

function supported() {
  return Boolean(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

function active() {
  return Boolean(doc().fullscreenElement || doc().webkitFullscreenElement);
}

export function toggleFullscreen() {
  try {
    if (active()) {
      if (doc().exitFullscreen) void doc().exitFullscreen().catch(() => {});
      else void doc().webkitExitFullscreen?.();
      return;
    }
    const root = document.documentElement as FsRoot;
    if (root.requestFullscreen) void root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else void root.webkitRequestFullscreen?.();
  } catch {
    // refused (no user gesture, a policy): the page simply stays as it is
  }
}

function subscribe(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  document.addEventListener("webkitfullscreenchange", cb);
  return () => {
    document.removeEventListener("fullscreenchange", cb);
    document.removeEventListener("webkitfullscreenchange", cb);
  };
}

/** 0: not available, 1: available, 2: in full screen (the server renders 0) */
const snapshot = () => (!supported() ? 0 : active() ? 2 : 1);

export function useFullscreen() {
  const s = useSyncExternalStore(subscribe, snapshot, () => 0);
  return { supported: s > 0, active: s === 2, toggle: toggleFullscreen };
}

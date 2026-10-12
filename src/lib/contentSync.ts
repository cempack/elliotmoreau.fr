"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin edits, live: a write in the admin panel is announced on a
 * BroadcastChannel, and every open emOS tab (the one that saved included:
 * the channel delivers to every other object of the same name) re-renders
 * from the server, so Now, Atlas, Mail… show it without a reload. A tab
 * that comes back into view refreshes too (at most once a minute), so an
 * open page catches up with edits made elsewhere.
 */
const NAME = "em-content";
const FOCUS_MS = 60_000;

let sender: BroadcastChannel | null = null;

/** Tell every open tab, this one included, that the site's content changed. */
export function announceContentChange() {
  try {
    sender ??= new BroadcastChannel(NAME);
    sender.postMessage(Date.now());
  } catch {}
}

/** Mounted once in the OS shell: re-render from the server when content changes. */
export function useContentSync() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(NAME);
      bc.onmessage = refresh;
    } catch {}
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > FOCUS_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      bc?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
}

export function ContentSync() {
  useContentSync();
  return null;
}

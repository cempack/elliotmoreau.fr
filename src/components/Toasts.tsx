"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, animate, m, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useMedia } from "@/hooks/env";
import { project, rubberband, spring } from "@/lib/motion";
import { EmosMark } from "@/components/os/menubar/glyphs";
import { useFlick } from "@/components/os/menubar/flick";
import "@/components/os/menubar.css";

type Toast = { id: number; text: string; title?: string };
type Notify = (text: string, title?: string) => void;

const Ctx = createContext<{ notify: Notify }>({ notify: () => {} });

const MAX = 3;
const LIFETIME = 4600;
/** projected travel (px) past which a swipe right dismisses */
const DISMISS_AT = 120;
/** where a leaving banner comes to rest, off the right edge */
const OFF = 440;
/** phones: banners drop from the top and are swiped back up, as on iOS */
const DISMISS_UP = -36;
const OFF_UP = -180;

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/**
 * macOS-style notification banners. Glass cards stack top-right under
 * the menu bar (newest on top, at most three), spring in from the right
 * edge and leave the same way: on their own after a few seconds, from the
 * close button, or flung right with velocity projection (a short, fast
 * flick is enough; a slow drag has to travel). Phones, as iOS: they drop
 * in from the top and are swiped back up. The timer holds while a banner
 * is hovered, focused, held, or the tab is hidden.
 *
 * notify(text) → titled "emOS"; notify(text, title) for a custom title.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const { t } = useI18n();

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback<Notify>((text, title) => {
    const id = ++idRef.current;
    setToasts((ts) => [{ id, text, title }, ...ts].slice(0, MAX));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ol className="os-toast-stack" aria-live="polite" aria-label={t.shell.toast.region}>
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((toast) => (
            <ToastCard
              key={toast.id}
              toast={toast}
              onDismiss={dismiss}
              fallbackTitle={t.shell.os}
              when={t.shell.toast.now}
              closeLabel={t.shell.dismiss}
            />
          ))}
        </AnimatePresence>
      </ol>
    </Ctx.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
  fallbackTitle,
  when,
  closeLabel,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
  fallbackTitle: string;
  when: string;
  closeLabel: string;
}) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [held, setHeld] = useState(false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const hold = hover || focus || held || hidden;
  const { id } = toast;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const phone = useMedia("(max-width: 767px)");

  useEffect(() => {
    if (hold) return;
    const timer = window.setTimeout(() => onDismiss(id), LIFETIME);
    return () => window.clearTimeout(timer);
  }, [hold, id, onDismiss]);

  // 1:1 to the right, rubber-banded to the left. At release the throw is
  // projected: far enough and it leaves along it, starting this frame with
  // the finger's velocity; otherwise it springs home from where it is
  const flickX = useFlick({
    axis: "x",
    value: x,
    resist: (raw) => (raw < 0 ? rubberband(raw, 360, 0.25) : raw),
    onStart: () => setHeld(true),
    onRelease: (v, at) => {
      setHeld(false);
      if (at + project(v, 0.99) > DISMISS_AT) {
        animate(x, OFF, { ...spring.default, velocity: Math.max(v, 400) });
        onDismiss(id);
      } else {
        animate(x, 0, { ...spring.default, velocity: v });
      }
    },
  });
  // phones: 1:1 upward, rubber-banded downward; a flick up sends it off the top
  const flickY = useFlick({
    axis: "y",
    value: y,
    resist: (raw) => (raw > 0 ? rubberband(raw, 240, 0.25) : raw),
    onStart: () => setHeld(true),
    onRelease: (v, at) => {
      setHeld(false);
      if (at + project(v, 0.99) < DISMISS_UP) {
        animate(y, OFF_UP, { ...spring.default, velocity: Math.min(v, -400) });
        onDismiss(id);
      } else {
        animate(y, 0, { ...spring.default, velocity: v });
      }
    },
  });
  const flick = phone ? flickY : flickX;

  return (
    <m.li
      layout="position"
      // glass on the animated element itself, so the blur holds while it fades
      className="os-toast glass-thick"
     
      initial={phone ? { opacity: 0, y: -28, scale: 0.96 } : { opacity: 0, x: OFF }}
      animate={phone ? { opacity: 1, y: 0, scale: 1, transition: spring.default } : { opacity: 1, x: 0, transition: spring.default }}
      exit={
        phone
          ? { opacity: 0, y: OFF_UP / 2, transition: { ...spring.default, opacity: { duration: 0.2, delay: 0.04 } } }
          : { opacity: 0, x: OFF, transition: { ...spring.default, opacity: { duration: 0.2, delay: 0.08 } } }
      }
      transition={spring.default}
      style={{ x, y }}
      {...flick}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
    >
      <div className="os-toast-surface">
        <span className="os-toast-icon" aria-hidden>
          <EmosMark size={18} />
        </span>
        <span className="os-toast-main">
          <span className="os-toast-title block">{toast.title ?? fallbackTitle}</span>
          <span className="os-toast-text block">{toast.text}</span>
        </span>
        <span className="os-toast-when" aria-hidden>
          {when}
        </span>
      </div>
      <button type="button" className="os-toast-close" aria-label={closeLabel} onClick={() => onDismiss(id)}>
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
          <path d="m1 1 6 6M7 1 1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </m.li>
  );
}

export function useToast() {
  return useContext(Ctx);
}


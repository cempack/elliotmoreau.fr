"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useSound } from "@/lib/sound";

type Toast = { id: number; text: string; leaving?: boolean };

const Ctx = createContext<{ notify: (text: string) => void }>({ notify: () => {} });

/**
 * Mako-style notification stack: short cards slide in from the right edge,
 * linger, then slip away. Click one to dismiss it early.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const { blip } = useSound();

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setToasts((ts) => ts.filter((t) => t.id !== id));
    }, 160);
  }, []);

  const notify = useCallback(
    (text: string) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts.slice(-2), { id, text }]);
      blip("select");
      window.setTimeout(() => dismiss(id), 2500);
    },
    [blip, dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-20 z-[80] flex w-72 flex-col gap-2"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`os-toast pointer-events-auto flex items-start gap-2.5 rounded-[12px] border border-line bg-panel/95 px-4 py-3 text-left backdrop-blur-md transition-colors hover:border-ember/60 ${
              t.leaving ? "leaving" : ""
            }`}
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" aria-hidden />
            <span className="font-mono text-xs leading-relaxed text-bone">{t.text}</span>
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

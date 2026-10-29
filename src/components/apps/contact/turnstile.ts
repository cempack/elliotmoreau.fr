"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile for the Mail app's Send: proof, for the server,
 * that a person sent the letter. Nothing loads on a mere visit: once the
 * visitor starts writing (`prime`), the widget runs unseen in the sheet and
 * keeps a token ready (renewed before its five minutes run out), so Send
 * rarely waits. When Cloudflare isn't sure, a checkbox appears in the sheet
 * (`asking`) until it's ticked. Tokens are single-use: Send takes the one
 * ready (`take`) and the widget fetches the next.
 */

type Options = {
  sitekey: string;
  action?: string;
  appearance?: "always" | "execute" | "interaction-only";
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  language?: string;
  "refresh-expired"?: "auto" | "manual" | "never";
  "response-field"?: boolean;
  callback?: (token: string) => void;
  "error-callback"?: (code: string) => boolean | void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "unsupported-callback"?: () => void;
  "before-interactive-callback"?: () => void;
  "after-interactive-callback"?: () => void;
};
type Turnstile = { render(el: HTMLElement, o: Options): string | undefined; reset(id: string): void; remove(id: string): void };

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** the server checks the token was made for this */
const ACTION = "contact";
/** a Send waits this long for a token (a checkbox left alone, a stuck challenge), then says so */
const GIVE_UP_MS = 120_000;

let loading: Promise<Turnstile | null> | null = null;
function load(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve(window.turnstile ?? null);
    // blocked or offline: the next Send tries again
    s.onerror = () => {
      loading = null;
      s.remove();
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function useTurnstile(siteKey: string | undefined, lang: "en" | "fr") {
  const boxRef = useRef<HTMLDivElement>(null);
  const widget = useRef<{ id: string; box: HTMLElement } | null>(null);
  const ready = useRef<string | null>(null);
  /** a Send waiting for the token */
  const waiting = useRef<((t: string | null) => void) | null>(null);
  const [asking, setAsking] = useState(false);

  /** hands a token (or null) to the waiting Send, if any; false when none waits */
  const answer = useCallback((t: string | null) => {
    const w = waiting.current;
    if (!w) return false;
    waiting.current = null;
    w(t);
    return true;
  }, []);

  const drop = useCallback(() => {
    if (widget.current && window.turnstile) {
      try {
        window.turnstile.remove(widget.current.id);
      } catch {}
    }
    widget.current = null;
    ready.current = null;
  }, []);

  useEffect(
    () => () => {
      answer(null);
      drop();
    },
    [answer, drop]
  );

  /** the widget in the sheet, rendered again if the sheet was (going back to compose) */
  const mount = useCallback(async () => {
    if (!siteKey) return null;
    const ts = await load();
    const box = boxRef.current;
    if (!ts || !box) return null;
    if (widget.current?.box === box) return ts;
    drop();
    try {
      const id = ts.render(box, {
        sitekey: siteKey,
        action: ACTION,
        appearance: "interaction-only",
        theme: "dark",
        size: "flexible",
        language: lang,
        "refresh-expired": "auto",
        "response-field": false,
        callback: (t) => {
          setAsking(false);
          if (!answer(t)) ready.current = t;
        },
        "expired-callback": () => {
          ready.current = null;
        },
        "error-callback": () => {
          ready.current = null;
          setAsking(false);
          answer(null);
        },
        "timeout-callback": () => {
          setAsking(false);
          answer(null);
        },
        "unsupported-callback": () => answer(null),
        "before-interactive-callback": () => setAsking(true),
        "after-interactive-callback": () => setAsking(false),
      });
      if (id) widget.current = { id, box };
    } catch {}
    return widget.current ? ts : null;
  }, [siteKey, lang, drop, answer]);

  /** start now: the visitor is writing */
  const prime = useCallback(() => {
    if (siteKey && !widget.current) void mount();
  }, [siteKey, mount]);

  /**
   * The token for one Send: undefined when the site doesn't check, null
   * when none could be had (blocked, failed, or the checkbox left alone).
   */
  const take = useCallback(async (): Promise<string | null | undefined> => {
    if (!siteKey) return undefined;
    const ts = await mount();
    if (!ts || !widget.current) return null;
    const id = widget.current.id;
    const t =
      ready.current ??
      (await new Promise<string | null>((resolve) => {
        answer(null);
        const timer = window.setTimeout(() => answer(null), GIVE_UP_MS);
        waiting.current = (v) => {
          window.clearTimeout(timer);
          resolve(v);
        };
      }));
    ready.current = null;
    // spent (or failed): the next one, for another letter or a second try
    try {
      ts.reset(id);
    } catch {}
    return t;
  }, [siteKey, mount, answer]);

  return { boxRef, asking, prime, take, on: Boolean(siteKey) };
}

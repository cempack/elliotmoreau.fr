"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";

/**
 * The intro, set straight on the wallpaper like a riced desktop's conky
 * text: the name, one line, the two ways in. No pane, no chrome: it sits
 * on the sky with the city, clouds drifting behind it. Every line sits on
 * a solid ink chip (the material of the desktop's labels and the pill),
 * so it reads on clear sky and white cloud alike. Phones get the same words
 * over the wallpaper, centred. (The README icon opens the terminal on
 * cat README.md, the longer version.)
 */
export function Hello() {
  const { t, path } = useI18n();
  const h = t.home.hello;
  const { blip } = useSound();

  return (
    <section aria-labelledby="app-home-hello-title" className="app-home-hello">
      <h2 id="app-home-hello-title" className="app-home-hello-greeting">
        <span className="app-home-hello-ink">{h.greeting}</span>
      </h2>
      <p className="app-home-hello-lead">
        <span className="app-home-hello-ink">{h.lead}</span>
      </p>
      <div className="app-home-hello-ctas">
        <Link prefetch={false} href={path("/work")} transitionTypes={["app-open"]} onClick={() => blip("open")} className="app-home-btn app-home-btn--primary">
          {h.work}
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className="app-home-btn-arrow">
            <path d="M2.5 7h8M7 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <Link prefetch={false} href={path("/contact")} transitionTypes={["app-open"]} onClick={() => blip("open")} className="app-home-btn app-home-btn--ghost">
          {h.contact}
        </Link>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { Glass } from "@/components/os/Glass";

/**
 * The intro: a chromeless card in the widgets' glass, sized to their grid
 * (two tiles wide), top left across from them. The name, one line, the two
 * ways in. Clouds drift behind it, softened by the glass; the words sit on
 * its tint, so they read over clear sky and white cloud alike. Phones get
 * it full width above the widgets. (The README icon opens the terminal on
 * cat README.md, the longer version.)
 */
export function Hello() {
  const { t, path } = useI18n();
  const h = t.home.hello;
  const { blip } = useSound();

  return (
    <section aria-labelledby="app-home-hello-title" className="app-home-hello">
      <Glass thickness="regular" className="app-home-hello-glass" aria-hidden />
      <h2 id="app-home-hello-title" className="app-home-hello-greeting">
        {h.greeting}
      </h2>
      <p className="app-home-hello-lead">{h.lead}</p>
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

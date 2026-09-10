"use client";

import { useLang } from "@/lib/i18n";
import { useSound } from "@/lib/sound";
import { SOCIALS } from "@/lib/places";
import { lenisRef } from "@/lib/lenisRef";
import { PixelLabel } from "./PixelLabel";
import { CardSparkles } from "./glyphs";

export function Footer() {
  const { t } = useLang();
  const { blip } = useSound();
  const socials = [
    { label: "GitHub", href: SOCIALS.github },
    { label: "YouTube", href: SOCIALS.youtube },
    { label: "Mastodon", href: SOCIALS.mastodon, rel: "me" },
    { label: "X", href: SOCIALS.x },
  ];

  const replay = () => {
    blip("select");
    window.dispatchEvent(new CustomEvent("em:replay"));
    // glide home through Lenis — a native smooth scroll would fight its rAF loop
    if (lenisRef.current) lenisRef.current.scrollTo(0, { duration: 1.4 });
    else {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
  };

  return (
    <footer id="footer" className="relative z-10 border-t border-line/70">
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-10 sm:px-6">
        <button
          onClick={replay}
          title={t("hero.replay")}
          aria-label={t("hero.replay")}
          className="group block max-w-full overflow-hidden text-left"
        >
          <span className="block text-bone transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-ember">
            <PixelLabel text="ELLIOT MOREAU" cell={6} />
          </span>
          <span className="mt-3 block font-mono text-[11px] text-faint transition-colors group-hover:text-ember">
            ↻ {t("hero.replay")}
          </span>
        </button>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel={s.rel ? `noreferrer ${s.rel}` : "noreferrer"}
                className="group relative flex items-baseline gap-1.5 font-display text-xl text-sage transition-all hover:-translate-y-0.5 hover:text-ember"
              >
                <CardSparkles />
                {s.label}
                <span aria-hidden className="font-mono text-[11px] text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ember">
                  ↗
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 border-t border-line/50 pt-4 font-mono text-[10px] text-faint/70">
          {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}

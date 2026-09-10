"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

const CHAPTERS = [
  { id: "blog", num: "01" },
  { id: "travel", num: "02" },
  { id: "more", num: "03" },
] as const;

/**
 * Chapter rail, after the deep-sea sites: a fixed side index of the three
 * home chapters. Scroll-spy lights the chapter you're inside; clicking
 * smooth-glides there (Lenis owns anchors, native jump under reduced
 * motion). Desktop only — thumbs do the walking on mobile.
 */
export function ChapterRail() {
  const { t } = useLang();
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter(
      (el): el is HTMLElement => !!el
    );
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const label = (id: string) =>
    id === "blog" ? t("blog.title") : id === "travel" ? t("travel.title") : t("links.workTitle");

  return (
    <nav
      aria-label="chapters"
      className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-5 xl:flex"
    >
      {CHAPTERS.map((c) => {
        const on = active === c.id;
        return (
          <a
            key={c.id}
            href={`#${c.id}`}
            aria-current={on || undefined}
            className="group flex items-center gap-3"
          >
            <span
              className={`font-mono text-[10px] tracking-[0.14em] transition-colors duration-300 ${
                on ? "text-bone" : "text-faint opacity-0 group-hover:opacity-100"
              }`}
            >
              {label(c.id)}
            </span>
            <span className="flex items-center gap-2">
              <span className={`font-mono text-[10px] tabular-nums transition-colors duration-300 ${on ? "text-ember" : "text-faint"}`}>
                {c.num}
              </span>
              <span className="relative h-8 w-px overflow-hidden bg-line">
                <span
                  id={`rail-fill-${c.id}`}
                  className={`absolute inset-x-0 top-0 bg-ember transition-all duration-500 ${
                    on ? "h-full" : "h-0"
                  }`}
                />
              </span>
              <span
                className={`block rounded-full transition-all duration-300 ${
                  on ? "h-2 w-2 bg-ember" : "h-1.5 w-1.5 bg-line group-hover:bg-faint"
                }`}
              />
            </span>
          </a>
        );
      })}
    </nav>
  );
}

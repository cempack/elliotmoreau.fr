"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { SOCIALS } from "@/lib/places";
import { CopyButton } from "@/components/CopyButton";
import { PixelLabel } from "@/components/PixelLabel";
import { Reveal } from "@/components/Reveal";
import { Tilt } from "@/components/Tilt";
import { TtfxText } from "@/components/TtfxText";
import {
  CardSparkles,
  GLYPH_CHAT,
  GLYPH_CODE,
  GLYPH_MAIL,
  GLYPH_PLAY,
  GLYPH_X,
  PixelGlyph,
  type Cells,
} from "@/components/glyphs";

function usePgpKey() {
  const [key, setKey] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/pgp.asc")
      .then((r) => (r.ok ? r.text() : ""))
      .then((txt) => alive && setKey(txt.trim()))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return key;
}

export default function Contact() {
  const { t } = useLang();
  const key = usePgpKey();
  const [showKey, setShowKey] = useState(false);

  const socials: { label: string; href: string; handle: string; rel?: string; glyph: Cells }[] = [
    { label: "GitHub", href: SOCIALS.github, handle: "@cempack", glyph: GLYPH_CODE },
    { label: "YouTube", href: SOCIALS.youtube, handle: "@cempack", glyph: GLYPH_PLAY },
    { label: "Mastodon", href: SOCIALS.mastodon, handle: "@cempack", rel: "me", glyph: GLYPH_CHAT },
    { label: "X", href: SOCIALS.x, handle: "@cempack_", glyph: GLYPH_X },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-20">
      <PixelLabel text={t("contact.kicker")} cell={3} className="block text-ember" />
      <div className="mt-4 flex flex-wrap items-center gap-5 sm:gap-6">
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/avatar.jpg"
            alt="Elliot Moreau"
            width={104}
            height={104}
            className="h-[88px] w-[88px] rounded-[16px] border-2 border-ember/60 object-cover transition-transform duration-300 hover:-rotate-6 hover:scale-105 sm:h-[104px] sm:w-[104px]"
          />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-5xl font-light tracking-tight text-bone sm:text-6xl lg:text-7xl">
            {t("contact.title")}
          </h1>
          <p className="mt-2 font-mono text-[12px] text-faint">{t("contact.fun")}</p>
        </div>
      </div>

      {/* the channel: the address itself, at display scale */}
      <Reveal className="mt-10" preset="lift">
        <Tilt max={4}>
          <div className="group relative overflow-hidden rounded-[12px] border border-ember/40 bg-gradient-to-br from-panel to-ink-2 p-6 transition-colors hover:border-ember sm:p-8 lg:p-10">
            <CardSparkles />
            <PixelGlyph
              cells={GLYPH_MAIL}
              size={220}
              className="pointer-events-none absolute -right-8 top-1/2 hidden -translate-y-1/2 text-ember opacity-[0.07] transition-opacity duration-500 group-hover:opacity-[0.12] lg:block"
            />
            <PixelLabel text={t("contact.email")} cell={2} className="block text-faint" />
            <a
              href={`mailto:${SOCIALS.email}`}
              className="mt-4 block break-all font-mono text-2xl leading-tight text-bone transition-colors hover:text-ember sm:text-4xl lg:text-[44px]"
            >
              <TtfxText text={SOCIALS.email} effect="decrypt" loop={false} />
            </a>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <a
                href={`mailto:${SOCIALS.email}`}
                className="inline-flex min-h-[44px] items-center gap-2.5 rounded-[12px] bg-ember px-6 py-3 font-mono text-[13px] font-medium text-[#232A2E] transition-all hover:-translate-y-0.5 hover:bg-bone"
              >
                <PixelGlyph cells={GLYPH_MAIL} size={16} />
                {t("contact.title")}
              </a>
              <CopyButton text={SOCIALS.email} />
            </div>
          </div>
        </Tilt>
      </Reveal>

      {/* elsewhere: the roster */}
      <div className="mt-14">
        <PixelLabel text={t("contact.socials")} cell={2} className="mb-3 block text-faint" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {socials.map((s, i) => (
            <li key={s.label}>
              <Reveal delay={i * 70} y={20} preset="lift">
                <a
                  href={s.href}
                  target="_blank"
                  rel={s.rel ? `noreferrer ${s.rel}` : "noreferrer"}
                  className="group relative flex h-full items-center gap-4 overflow-hidden rounded-[12px] border border-line bg-ink-2 p-4 transition-all hover:-translate-y-1 hover:border-ember/60 hover:shadow-[0_18px_50px_-20px_rgba(167,192,128,0.25)] sm:p-5"
                >
                  <span
                    className="w-9 shrink-0 font-display text-2xl tabular-nums text-faint/60 transition-colors group-hover:text-ember"
                    aria-hidden
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-panel text-faint transition-colors group-hover:border-ember/50 group-hover:text-ember">
                    <PixelGlyph cells={s.glyph} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[15px] text-bone transition-colors group-hover:text-ember">
                      <TtfxText text={s.label} effect="decrypt" loop={false} />
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                      {s.handle}
                    </span>
                  </span>
                  <span className="pixel-arrow shrink-0 font-display text-2xl text-faint" aria-hidden>
                    →
                  </span>
                </a>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>

      {/* pgp terminal */}
      <Reveal className="mt-14" preset="lift">
        <div className="overflow-hidden rounded-[12px] border border-line bg-ink">
          <div className="flex items-center gap-3 border-b border-line/70 bg-panel/50 px-4 py-3">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-[3px] bg-rust/70" />
              <span className="h-2.5 w-2.5 rounded-[3px] bg-ember/70" />
              <span className="h-2.5 w-2.5 rounded-[3px] bg-glacier/70" />
            </span>
            <span className="truncate font-mono text-[11px] text-faint">
              <span className="text-ember" aria-hidden>
                $&nbsp;
              </span>
              gpg --import elliotmoreau-pgp.asc
            </span>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2.5">
                <PixelGlyph cells={GLYPH_CODE} size={18} className="text-ember/80" />
                <PixelLabel text={t("contact.pgp")} cell={2} className="text-faint" />
              </span>
              <p className="font-mono text-[11px] text-faint">{t("contact.pgpNote")}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {key && <CopyButton text={key} label={t("contact.copy")} />}
              <a
                href="/pgp.asc"
                download="elliotmoreau-pgp.asc"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-line bg-panel px-4 py-2 font-mono text-xs text-sage transition-colors hover:border-ember hover:text-bone"
              >
                ↓ {t("contact.download")}
              </a>
              <button
                onClick={() => setShowKey((s) => !s)}
                aria-expanded={showKey}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] border border-line bg-panel px-4 py-2 font-mono text-xs text-sage transition-colors hover:border-ember hover:text-bone"
              >
                {showKey ? t("contact.hide") : t("contact.show")}
              </button>
            </div>
            {showKey && key && (
              <pre
                data-lenis-prevent
                className="mt-4 max-h-64 overflow-auto rounded-[12px] border border-line bg-ink-2/60 p-4 font-mono text-[10px] leading-relaxed text-sage"
              >
                {key}
              </pre>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

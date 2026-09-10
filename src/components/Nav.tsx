"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useSound } from "@/lib/sound";
import { NowPlaying } from "@/components/NowPlaying";
import { CardSparkles, GLYPH_CODE, GLYPH_HOME, GLYPH_MAIL, PixelGlyph } from "@/components/glyphs";

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 6v4h2.5L8 13.5v-11L4.5 6H2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="m10.5 6.5 3 3m0-3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path
          d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.8a6 6 0 0 1 0 8.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function Nav() {
  const { t } = useLang();
  const { muted, toggle } = useSound();
  const pathname = usePathname();

  const links = [
    { href: "/", label: t("nav.home"), active: pathname === "/", glyph: GLYPH_HOME },
    { href: "/work", label: t("nav.work"), active: pathname === "/work", glyph: GLYPH_CODE },
    { href: "/contact", label: t("nav.contact"), active: pathname === "/contact", glyph: GLYPH_MAIL },
  ];

  // SwayOSD-style volume pop on every mute toggle
  const [osd, setOsd] = useState<null | boolean>(null);
  const osdTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(osdTimer.current), []);
  const onToggle = () => {
    const next = !muted;
    toggle();
    setOsd(next);
    window.clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(null), 1200);
  };

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-2.5 sm:px-6">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-1.5 rounded-[14px] border border-line border-t-white/10 bg-ink/90 px-3 shadow-[0_14px_40px_-16px_rgba(0,0,0,0.7)] backdrop-blur-md sm:gap-2 sm:px-4">
        <Link
          href="/"
          className="group relative flex shrink-0 items-center gap-2.5"
          aria-label="Elliot Moreau — home"
        >
          <CardSparkles />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/avatar.jpg"
            alt=""
            width={28}
            height={28}
            className="avatar-pop h-7 w-7 rounded-[9px] border border-line object-cover"
          />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={`relative inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 font-mono text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors ${
                l.active
                  ? "border-line bg-white/[0.05] text-bone"
                  : "border-transparent text-sage hover:border-line hover:bg-white/[0.03] hover:text-bone"
              }`}
            >
              <PixelGlyph
                cells={l.glyph}
                size={13}
                className={l.active ? "text-ember" : "text-faint"}
              />
              <span className="max-[420px]:hidden">{l.label}</span>
              {l.active && (
                <span className="absolute inset-x-3 -bottom-[1px] h-px bg-ember" aria-hidden />
              )}
            </Link>
          ))}
        </div>

        <NowPlaying />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onToggle}
            aria-label={muted ? t("nav.soundOff") : t("nav.soundOn")}
            aria-pressed={!muted}
            title={muted ? t("nav.soundOff") : t("nav.soundOn")}
            className={`flex h-9 w-9 items-center justify-center rounded-[10px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors ${
              muted
                ? "border-line text-faint hover:text-bone"
                : "border-ember/60 text-ember hover:text-bone"
            }`}
          >
            <SoundIcon muted={muted} />
          </button>
        </div>
      </nav>
    </header>
      {/* outside the header: its backdrop-blur would capture fixed positioning */}
      {osd !== null && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[80] flex justify-center">
          <div
            className="os-osd flex items-center gap-3 rounded-[12px] border border-line bg-panel/95 px-5 py-3 backdrop-blur-md"
            role="status"
          >
            <SoundIcon muted={osd} />
            <span className="font-mono text-xs text-bone">
              {osd ? t("nav.soundOff") : t("nav.soundOn")}
            </span>
            <span
              aria-hidden
              className={`font-mono text-xs tracking-tighter ${osd ? "text-faint" : "text-ember"}`}
            >
              {osd ? "░░░░░░░░" : "▓▓▓▓▓▓▓▓"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

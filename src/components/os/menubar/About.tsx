"use client";

import "../menubar-panels.css";

import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { ArrowUpRight, GithubIcon, RestartIcon, RssIcon } from "./glyphs";
import { DataPlate } from "./DataPlate";
import { BLOG_RSS, SITE_REPO, restartOS } from "./util";
import { lockOS } from "../Intro";
import { PhoneTicket } from "./PhoneTicket";
import { useTheme } from "@/hooks/useTheme";

/** fastfetch's colour blocks, in the theme's colours. */
const SWATCHES = [
  "var(--color-ink-900)",
  "var(--color-ink-600)",
  "var(--color-label-3)",
  "var(--color-label)",
  "var(--color-signal)",
  "var(--color-ion)",
  "var(--color-lilac)",
  "var(--color-ember)",
  "var(--color-flare)",
];

export function AboutPanel() {
  const { t } = useI18n();
  const a = t.shell.about;
  const { blip } = useSound();
  const { meta } = useTheme();
  const rows: [string, React.ReactNode][] = [
    [a.keys.os, a.values.os],
    [a.keys.built, a.values.built],
    [a.keys.host, a.values.host],
    [
      a.keys.theme,
      <a key="theme" className="os-menubar-about-link" href={`https://github.com/${meta.repo}`} target="_blank" rel="noopener noreferrer">
        {meta.name}
        {meta.sha ? ` · ${meta.sha}` : ""}
      </a>,
    ],
    [a.keys.fonts, a.values.fonts],
  ];
  return (
    <div className="os-menubar-about">
      <DataPlate />

      <div className="os-menubar-about-ff">
        <p className="os-menubar-about-prompt" aria-hidden>
          <span className="os-menubar-about-user">{a.user}</span>
          <span className="os-menubar-about-at">@</span>
          <span className="os-menubar-about-host">{a.host}</span>
        </p>
        <p className="os-menubar-about-rule" aria-hidden>
          {"-".repeat(a.user.length + 1 + a.host.length)}
        </p>
        <dl className="os-menubar-about-specs">
          {rows.map(([k, v]) => (
            <div key={k} className="os-menubar-about-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="os-menubar-about-swatches" aria-label={a.palette}>
          {SWATCHES.map((c) => (
            <li key={c} style={{ background: c }} />
          ))}
        </ul>
      </div>

      <PhoneTicket />

      <div className="os-menubar-about-actions">
        <a className="os-menubar-action" href={SITE_REPO} target="_blank" rel="noopener noreferrer" aria-label={a.sourceLabel}>
          <GithubIcon />
          <span>{a.source}</span>
          <ArrowUpRight />
        </a>
        <a className="os-menubar-action" href={BLOG_RSS} target="_blank" rel="noopener noreferrer" aria-label={a.rssLabel}>
          <RssIcon />
          <span>{a.rss}</span>
          <ArrowUpRight />
        </a>
        <button type="button" className="os-menubar-action os-menubar-action--ghost" onClick={lockOS}>
          <span>{t.shell.menu.lock}</span>
        </button>
        <button
          type="button"
          className="os-menubar-action os-menubar-action--ghost"
          onClick={() => {
            blip("click");
            restartOS();
          }}
        >
          <RestartIcon />
          <span>{a.restart}</span>
        </button>
      </div>
    </div>
  );
}

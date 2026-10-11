"use client";

import "../menubar-panels.css";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { ArrowUpRight, GithubIcon, RestartIcon, RssIcon } from "./glyphs";
import { DataPlate } from "./DataPlate";
import { BLOG_RSS, SITE_REPO, restartOS } from "./util";
import { lockOS } from "../Intro";

/** fastfetch's colour blocks, in Moss. */
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

/**
 * Restart under a hinged red guard, the way a cockpit covers the switches
 * that matter: the first press lifts the guard, the second flips the
 * switch. The guard drops back after four idle seconds or on Esc. Two
 * buttons in order for keys and screen readers: lift, then restart.
 */
function GuardedRestart() {
  const { t } = useI18n();
  const g = t.shell.about.guard;
  const { blip } = useSound();
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const arm = (v: boolean) => {
    window.clearTimeout(timer.current);
    setOpen(v);
    if (v) timer.current = window.setTimeout(() => setOpen(false), 4000);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div
      className="os-guard"
      data-open={open || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          arm(false);
        }
      }}
    >
      <button
        type="button"
        className="os-guard-cover"
        aria-expanded={open}
        aria-label={g.lift}
        onClick={() => {
          arm(!open);
          blip("toggle");
        }}
      >
        <span aria-hidden className="os-guard-stripes" />
      </button>
      <button
        type="button"
        className="os-menubar-action os-menubar-action--ghost os-guard-switch"
        aria-disabled={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => {
          if (!open) return;
          blip("click");
          restartOS();
        }}
      >
        <RestartIcon />
        <span>{g.restart}</span>
      </button>
    </div>
  );
}

export function AboutPanel() {
  const { t } = useI18n();
  const a = t.shell.about;
  const rows: [string, React.ReactNode][] = [
    [a.keys.os, a.values.os],
    [a.keys.built, a.values.built],
    [a.keys.host, a.values.host],
    [a.keys.theme, a.values.theme],
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
        <GuardedRestart />
      </div>
    </div>
  );
}

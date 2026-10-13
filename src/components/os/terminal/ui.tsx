"use client";

import { createContext, Fragment, useContext } from "react";

/**
 * Output primitives for the Terminal: string templates, clickable command
 * chips and the prompt. Command output is plain React, so a line can hold
 * links and buttons; `Cmd` reaches the live session through context, so
 * old output stays clickable for as long as it is on screen.
 */

export type Actions = {
  /** run a command as if typed */
  run: (cmd: string) => void;
  /** put text in the prompt (for commands that still need an argument) */
  fill: (cmd: string) => void;
};

export const ActionsCtx = createContext<Actions>({ run: () => {}, fill: () => {} });

/** "{n} min" → "4 min". Unknown tokens stay as written. */
export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));
}

/** Like `fill`, but tokens can be React nodes (links, command chips). */
export function nodes(template: string, vars: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{key && key in vars ? vars[key] : part}</Fragment>;
  });
}

/** An inline command you can click: runs it, or fills the prompt with `fillOnly`. */
export function Cmd({ value, fillOnly = false, children }: { value: string; fillOnly?: boolean; children?: React.ReactNode }) {
  const { run, fill: put } = useContext(ActionsCtx);
  return (
    <button
      type="button"
      className="os-term-cmdlink"
      onClick={() => (fillOnly ? put(`${value} `) : run(value))}
    >
      {children ?? value}
    </button>
  );
}

/** External link that opens in a new tab. */
export function Ext({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`os-term-link ${className}`}>
      {children}
    </a>
  );
}

/** The prompt: where you are, then a pixel chevron in the cursor's yellow
    (drawn, not typed: the subset of JetBrains Mono the site loads has no ❯).
    Who you are is in the title bar. */
export function Prompt({ cwd }: { cwd: string }) {
  return (
    <span className="os-term-prompt" aria-hidden>
      <span className="os-term-prompt-cwd">{cwd}</span>
      <svg className="os-term-prompt-sigil" viewBox="0 0 3 5" width="6" height="10" shapeRendering="crispEdges" fill="currentColor">
        <path d="M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM1 3h1v1H1zM0 4h1v1H0z" />
      </svg>
    </span>
  );
}

/** A tiny pixel square, used as a swatch or a bullet. */
export function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  return <i aria-hidden className="os-term-swatch" style={{ background: color, width: size, height: size }} />;
}

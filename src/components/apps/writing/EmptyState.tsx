"use client";

import { useId } from "react";
import { Monogram } from "@/components/Monogram";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";

/** A calm, centred state: a small pixel world, a line, one way forward. */
export function EmptyState({
  seed,
  title,
  body,
  action,
  tone = "calm",
  children,
}: {
  seed: string;
  title: string;
  body: string;
  action: { label: string; href?: string; onClick?: () => void };
  tone?: "calm" | "offline";
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="app-writing-empty" data-tone={tone} aria-labelledby={id}>
      <span className="app-writing-empty-art" aria-hidden>
        <Monogram text={seed} className="app-writing-empty-planet" />
      </span>
      <h2 id={id} className="app-writing-empty-title">{title}</h2>
      <p className="app-writing-empty-body">{body}</p>
      {action.href ? (
        <PressAnchor href={action.href} target="_blank" rel="noopener" className="app-writing-empty-cta">
          {action.label}
          <span aria-hidden>↗</span>
        </PressAnchor>
      ) : (
        <PressButton className="app-writing-empty-cta" onClick={action.onClick}>
          {action.label}
        </PressButton>
      )}
      {children}
    </section>
  );
}

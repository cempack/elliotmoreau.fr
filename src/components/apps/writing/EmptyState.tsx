"use client";

import { PixelPlanet } from "@/components/PixelPlanet";
import { PressAnchor, PressButton } from "@/components/ui/Pressable";

/** A calm, centred state: a small pixel world, a line, one way forward. */
export function EmptyState({
  seed,
  title,
  body,
  action,
  tone = "calm",
}: {
  seed: string;
  title: string;
  body: string;
  action: { label: string; href?: string; onClick?: () => void };
  tone?: "calm" | "offline";
}) {
  return (
    <div className="app-writing-empty" data-tone={tone} role="status">
      <span className="app-writing-empty-art" aria-hidden>
        <PixelPlanet seed={seed} className="app-writing-empty-planet" />
      </span>
      <h2 className="app-writing-empty-title">{title}</h2>
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
    </div>
  );
}

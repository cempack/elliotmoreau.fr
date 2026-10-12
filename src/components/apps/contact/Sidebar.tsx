"use client";

import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { G_AT, G_KEY, G_LETTER, G_PEN } from "./glyphs";

export type Box = "compose" | "sent" | "elsewhere" | "key";

/** each mailbox's URL fragment ("" = the page itself) */
export const HASH: Record<Box, string> = { compose: "", sent: "sent", elsewhere: "elsewhere", key: "pgp" };

/**
 * Mailboxes: a source list on wide windows, the window's segmented strip
 * on narrow ones. Each is a real link (#sent, #elsewhere, #pgp), so it can
 * be copied or opened in a new tab; a plain click switches in place. Sent
 * appears once this browser has a letter in it, with a count of new
 * replies.
 */
export function Sidebar({ box, onSelect, sent }: { box: Box; onSelect: (b: Box) => void; sent: { show: boolean; unread: number } }) {
  const { t, path } = useI18n();
  const c = t.contact;

  const item = (b: Box, glyph: Cells, label: React.ReactNode, count?: number) => (
    <WinNavItem
      href={HASH[b] ? `#${HASH[b]}` : path("/contact")}
      active={box === b}
      icon={<PixelGlyph cells={glyph} size={14} />}
      count={count}
      // a plain click switches in place; modified clicks keep the browser's own behaviour
      onClick={(e?: React.MouseEvent) => {
        if (!e || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelect(b);
      }}
    >
      {label}
    </WinNavItem>
  );

  return (
    <div className="app-contact-side">
      <p className="app-contact-side-label" data-win-hide-compact="">
        {c.mailboxes}
      </p>
      <WinNav label={c.mailboxes}>
        {item(
          "compose",
          G_PEN,
          <>
            <span className="app-contact-nav-long">{c.boxCompose}</span>
            <span className="app-contact-nav-short">{c.boxComposeShort}</span>
          </>
        )}
        {sent.show && item("sent", G_LETTER, c.boxSent, sent.unread || undefined)}
        {item("elsewhere", G_AT, c.boxElsewhere)}
        {item("key", G_KEY, c.boxKey)}
      </WinNav>
    </div>
  );
}

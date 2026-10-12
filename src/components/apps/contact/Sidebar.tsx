"use client";

import { useI18n } from "@/i18n/client";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { G_AT, G_KEY, G_LETTER, G_PEN } from "./glyphs";

export type Box = "compose" | "sent" | "elsewhere" | "key";

/** each mailbox's URL fragment ("" = the page itself) */
export const HASH: Record<Box, string> = { compose: "", sent: "sent", elsewhere: "elsewhere", key: "pgp" };

/**
 * The mailboxes as one row of tabs over the page: Write, Sent (once this
 * browser has a letter in it, with a count of new replies), Elsewhere and
 * PGP key. Each is a real link (#sent, #elsewhere, #pgp), so it can be
 * copied or opened in a new tab; a plain click switches in place.
 */
export function MailTabs({ box, onSelect, sent }: { box: Box; onSelect: (b: Box) => void; sent: { show: boolean; unread: number } }) {
  const { t, path } = useI18n();
  const c = t.contact;

  const tab = (b: Box, glyph: Cells, label: string, count?: number) => (
    <a
      key={b}
      href={HASH[b] ? `#${HASH[b]}` : path("/contact")}
      className="app-contact-tab"
      aria-current={box === b ? "page" : undefined}
      // a plain click switches in place; modified clicks keep the browser's own behaviour
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onSelect(b);
      }}
    >
      <PixelGlyph cells={glyph} size={12} />
      <span>{label}</span>
      {count ? <span className="app-contact-tab-count tabular">{count}</span> : null}
    </a>
  );

  return (
    <nav className="app-contact-tabs" aria-label={c.mailboxes}>
      {tab("compose", G_PEN, c.boxComposeShort)}
      {sent.show && tab("sent", G_LETTER, c.boxSent, sent.unread || undefined)}
      {tab("elsewhere", G_AT, c.boxElsewhere)}
      {tab("key", G_KEY, c.boxKey)}
    </nav>
  );
}

"use client";

import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useParisTime } from "@/hooks/useParisTime";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { G_AT, G_KEY, G_PEN } from "./glyphs";
import { fill } from "./mail";

export type Box = "compose" | "elsewhere" | "key";

/** each mailbox's URL fragment ("" = the page itself) */
export const HASH: Record<Box, string> = { compose: "", elsewhere: "elsewhere", key: "pgp" };

/**
 * Mailboxes: a source list on wide windows, the window's segmented strip
 * on narrow ones. Each is a real link (#elsewhere, #pgp), so it can be
 * copied or opened in a new tab; a plain click switches in place. Below
 * the list (wide only), a small honest note about replies with the time
 * it is in Paris right now.
 */
export function Sidebar({ box, onSelect }: { box: Box; onSelect: (b: Box) => void }) {
  const { t, path } = useI18n();
  const c = t.contact;
  const { time } = useParisTime();

  const item = (b: Box, glyph: Cells, label: React.ReactNode) => (
    <WinNavItem
      href={HASH[b] ? `#${HASH[b]}` : path("/contact")}
      active={box === b}
      icon={<PixelGlyph cells={glyph} size={14} />}
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
        {item("elsewhere", G_AT, c.boxElsewhere)}
        {item("key", G_KEY, c.boxKey)}
      </WinNav>

      <div className="app-contact-reply" data-win-hide-compact="">
        <p className="app-contact-reply-time">
          <span className="app-contact-reply-dot" aria-hidden />
          <span className="tabular">{fill(c.parisNow, { time: time ?? "--:--" })}</span>
        </p>
        <p>{c.replyNote}</p>
        <p>{c.langNote}</p>
      </div>
    </div>
  );
}

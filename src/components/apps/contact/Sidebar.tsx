"use client";

import { WinNav, WinNavItem } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useParisTime } from "@/hooks/useParisTime";
import { PixelGlyph } from "@/components/glyphs";
import { G_AT, G_KEY, G_PEN } from "./glyphs";
import { fill } from "./mail";

export type Box = "compose" | "elsewhere" | "key";

/**
 * Mailboxes: a source list on wide windows, the window's segmented strip
 * on narrow ones. Below the list (wide only), a small honest note about
 * replies with the time it is in Paris right now.
 */
export function Sidebar({ box, onSelect, nets }: { box: Box; onSelect: (b: Box) => void; nets: number }) {
  const { t } = useI18n();
  const c = t.contact;
  const { time } = useParisTime();

  return (
    <div className="app-contact-side">
      <p className="app-contact-side-label" data-win-hide-compact="">
        {c.mailboxes}
      </p>
      <WinNav label={c.mailboxes}>
        <WinNavItem
          active={box === "compose"}
          onClick={() => onSelect("compose")}
          icon={<PixelGlyph cells={G_PEN} size={14} />}
        >
          <span className="app-contact-nav-long">{c.boxCompose}</span>
          <span className="app-contact-nav-short">{c.boxComposeShort}</span>
        </WinNavItem>
        <WinNavItem
          active={box === "elsewhere"}
          onClick={() => onSelect("elsewhere")}
          icon={<PixelGlyph cells={G_AT} size={14} />}
          count={nets}
        >
          {c.boxElsewhere}
        </WinNavItem>
        <WinNavItem active={box === "key"} onClick={() => onSelect("key")} icon={<PixelGlyph cells={G_KEY} size={14} />}>
          {c.boxKey}
        </WinNavItem>
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

"use client";

import { useI18n } from "@/i18n/client";
import { PixelGlyph } from "@/components/glyphs";
import { SubscribeForm } from "./SubscribeForm";
import { G_RSS } from "./glyphs";
import { RSS_URL } from "./util";

/** The newsletter, once, at the end of the page. */
export function Letters() {
  const { t } = useI18n();
  const w = t.writing;
  return (
    <section className="app-writing-letters" aria-labelledby="app-writing-letters">
      <h3 id="app-writing-letters" className="app-writing-letters-title">
        {w.memberTitle}
      </h3>
      <p className="app-writing-letters-body">{w.memberBody}</p>
      <SubscribeForm />
      <a href={RSS_URL} target="_blank" rel="noopener" className="app-writing-letters-rss">
        <PixelGlyph cells={G_RSS} size={12} />
        {w.memberRss}
      </a>
    </section>
  );
}

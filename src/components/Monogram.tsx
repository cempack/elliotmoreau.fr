import { PixelGlyph, type Cells } from "./glyphs";

/** a stable small hash, so the same name always gets the same tone */
function tone(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return Math.abs(h) % 5;
}

/** "omarchy-dos-moos-theme" → "od", "ttfx" → "tt" */
function initials(text: string) {
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toLowerCase();
  return (words[0] ?? text).slice(0, 2).toLowerCase();
}

/**
 * A flat tile with two letters (or a pixel glyph) in mono, toned by the
 * text: the stand-in wherever there is no picture (a repo, a missing album
 * cover, a stamp). Sized by its className; the contents scale with it.
 */
export function Monogram({ text, glyph, className = "" }: { text: string; glyph?: Cells; className?: string }) {
  return (
    <span aria-hidden className={`em-mono ${className}`} data-tone={tone(text)}>
      {glyph ? <PixelGlyph cells={glyph} className="em-mono-g" /> : <span className="em-mono-t">{initials(text)}</span>}
    </span>
  );
}

import { langColor } from "./model";

/** seeded generator: the same repo always gets the same file */
function rng(seed: string) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tok = { x: number; y: number; w: number; tone: 0 | 1 | 2 | 3 };

const W = 28;
const LINES = 10;

function tokens(seed: string): Tok[] {
  const r = rng(seed);
  const out: Tok[] = [];
  let indent = 0;
  for (let i = 0; i < LINES; i++) {
    const y = 5 + i * 2;
    // a blank line now and then, indentation that opens and closes
    if (i > 1 && r() < 0.14) {
      indent = Math.max(0, indent - 1);
      continue;
    }
    let x = 6 + indent * 2;
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n && x < W - 4; k++) {
      const w = Math.min(W - 3 - x, 2 + Math.floor(r() * 6));
      if (w < 2) break;
      const tone = k === 0 && r() < 0.55 ? 1 : r() < 0.22 ? 2 : r() < 0.12 ? 3 : 0;
      out.push({ x, y, w, tone });
      x += w + 1;
    }
    if (r() < 0.3) indent = Math.min(3, indent + 1);
    else if (r() < 0.25) indent = Math.max(0, indent - 1);
  }
  return out;
}

const TONE = ["var(--color-label-3)", "", "var(--color-signal)", "var(--color-ember)"];

/**
 * A repo's picture: its code as an editor minimap would draw it, in pixel
 * cells. Seeded by the name (the same repo always looks the same), keyed
 * in its language colour, with a line-number gutter. Sized by className.
 */
export function RepoArt({
  name,
  language,
  caret = false,
  className = "",
}: {
  name: string;
  language?: string | null;
  /** a blinking cursor after the last token, as if the file were open */
  caret?: boolean;
  className?: string;
}) {
  const accent = langColor(language ?? "");
  const toks = tokens(name);
  const last = toks[toks.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${W}`} shapeRendering="crispEdges" aria-hidden focusable="false" className={`em-repo ${className}`}>
      <rect x={0} y={0} width={W} height={W} fill="var(--color-ink-900)" />
      {/* the tab, in the language colour */}
      <rect x={2} y={1} width={9} height={2} fill={accent} opacity={0.85} />
      <rect x={0} y={3} width={W} height={0.5} fill="rgb(196 206 194 / 0.14)" />
      {Array.from({ length: LINES }, (_, i) => (
        <rect key={`n${i}`} x={2} y={5 + i * 2} width={2} height={1} fill="var(--color-ink-500)" />
      ))}
      {toks.map((t, i) => (
        <rect key={i} x={t.x} y={t.y} width={t.w} height={1} fill={t.tone === 1 ? accent : TONE[t.tone]} />
      ))}
      {caret && last && (
        <rect className="em-repo-caret" x={Math.min(W - 2, last.x + last.w + 1)} y={last.y - 0.5} width={0.75} height={2} fill="var(--color-label)" />
      )}
    </svg>
  );
}

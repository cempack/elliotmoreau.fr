"use client";

import { SplitText } from "@/components/ui/SplitText";
import { useReduced } from "./hooks";
import { useJ } from "./strings";

const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Chapter opener: running kicker ("Chapter II"), a big outlined numeral and
 * the title in display type, assembling letter by letter with the scroll
 * (`scrub`) or once in view. Plain heading under reduced motion.
 */
export function ChapterHead({
  n,
  title,
  sub,
  mode = "scrub",
  aside,
}: {
  n: number;
  title: string;
  sub?: React.ReactNode;
  mode?: "scrub" | "inView";
  aside?: React.ReactNode;
}) {
  const { j } = useJ();
  const reduced = useReduced();
  const num = String(n).padStart(2, "0");
  return (
    <header className="j-ch">
      <div className="j-ch-top">
        <span className="j-ch-k">
          {j.chapter} {ROMAN[n]}
        </span>
        <span className="j-ch-line" aria-hidden />
        {aside && <span className="j-ch-aside">{aside}</span>}
      </div>
      <div className="j-ch-row">
        <span className="j-ch-num" aria-hidden>
          {num}
        </span>
        {reduced ? (
          <h2 className="j-ch-title">{title}</h2>
        ) : (
          <SplitText key={title} as="h2" text={title} mode={mode} stagger={0.035} className="j-ch-title" />
        )}
      </div>
      {sub && <p className="j-ch-sub">{sub}</p>}
    </header>
  );
}

"use client";

import { useIntroFinish } from "@/components/ui/IntroGate";
import { useJ } from "./strings";

/**
 * The cover sequence, in CSS so it starts on first paint (before
 * hydration): a hairline draws across a black field, the title rises
 * through its mask, then the whole field lifts away like a curtain into
 * the hero. ~1.7s; the gate's own timer caps it.
 */
export function JournalIntro() {
  const finish = useIntroFinish();
  const { j } = useJ();
  return (
    <div
      className="j-intro"
      onAnimationEnd={(e) => {
        if (e.animationName === "j-intro-lift" && e.target === e.currentTarget) finish();
      }}
    >
      <div className="j-intro-inner">
        <p className="j-intro-title">
          <span className="j-intro-mask">
            <span className="j-intro-word" style={{ animationDelay: "320ms" }}>
              Elliot Moreau
            </span>
          </span>{" "}
          <span className="j-intro-mask">
            <span className="j-intro-word j-intro-dash" style={{ animationDelay: "420ms" }}>
              — {j.journal}
            </span>
          </span>
        </p>
        <span className="j-intro-rule" />
        <p className="j-intro-sub">
          <span className="j-intro-mask">
            <span className="j-intro-word" style={{ animationDelay: "560ms" }}>
              {j.introSub}
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}

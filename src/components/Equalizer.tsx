"use client";

/** Tiny equalizer that dances only while music plays. */
export function Equalizer({ playing, className = "" }: { playing: boolean; className?: string }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <span
      className={`flex h-5 items-end gap-[3px] ${playing ? "" : "eq-paused"} ${className}`}
      aria-hidden
    >
      {bars.map((i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-full bg-ember"
          style={{ height: `${10 + ((i * 7) % 3) * 4}px`, animationDelay: `${i * 0.13}s`, animationDuration: `${0.7 + (i % 3) * 0.18}s` }}
        />
      ))}
    </span>
  );
}

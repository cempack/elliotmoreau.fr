/** Window control glyphs: thin line icons, drawn on a 12px grid. */
export function WinIcon({ kind }: { kind: "close" | "min" | "max" | "unmax" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {kind === "close" && <path d="M3 3l6 6M9 3l-6 6" />}
      {kind === "min" && <path d="M3 6.5h6" />}
      {kind === "max" && <rect x="2.75" y="2.75" width="6.5" height="6.5" rx="1" />}
      {kind === "unmax" && (
        <>
          <rect x="2.75" y="4.25" width="5" height="5" rx="1" />
          <path d="M4.75 2.75h3.5a1 1 0 0 1 1 1v3.5" />
        </>
      )}
    </svg>
  );
}

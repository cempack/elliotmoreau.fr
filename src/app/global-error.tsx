"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isChunkError, reloadOnce, reportCrash } from "@/lib/oops";

const noop = () => () => {};

/**
 * The shell itself broke (the root layout): nothing of emOS is left to
 * draw with, global styles included, so this is a plain page in its
 * colours with a way back in. Reported like any crash; a failed chunk
 * reloads once on its own.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  const fr = useSyncExternalStore(noop, () => /^\/fr(\/|$)/.test(location.pathname), () => false);

  useEffect(() => {
    reportCrash(error, "root");
    if (isChunkError(error)) reloadOnce();
  }, [error]);

  return (
    <html lang={fr ? "fr" : "en"}>
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          background: "#0f1011",
          color: "#f8ebe3",
          font: "15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <main style={{ maxWidth: 340, padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, color: "#72856c", font: "500 11px/1 ui-monospace, SFMono-Regular, monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            emOS
          </p>
          <h1 style={{ margin: "14px 0 8px", font: "600 19px/1.3 ui-sans-serif, system-ui, -apple-system, sans-serif", letterSpacing: "-0.012em" }}>
            {fr ? "emOS s’est arrêté" : "emOS stopped"}
          </h1>
          <p style={{ margin: "0 0 22px", color: "#a5b5ab" }}>{fr ? "Quelque chose s’est cassé. Rechargez pour le relancer." : "Something broke. Reload to start it again."}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              height: 40,
              padding: "0 22px",
              border: 0,
              borderRadius: 10,
              background: "#819890",
              color: "#0f1011",
              font: "600 14px/1 ui-sans-serif, system-ui, -apple-system, sans-serif",
              cursor: "pointer",
            }}
          >
            {fr ? "Recharger" : "Reload"}
          </button>
        </main>
      </body>
    </html>
  );
}

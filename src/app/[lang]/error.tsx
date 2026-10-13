"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { appForPath } from "@/components/os/apps";
import { AppIcon } from "@/components/os/icons";
import { isChunkError, reloadOnce, reportCrash } from "@/lib/oops";

/**
 * An app broke while it ran: macOS's "quit unexpectedly", inside emOS. The
 * menu bar, the Dock and the wallpaper keep running (they live in the
 * layout, above this boundary) and the app can be reopened in place. A
 * piece of the app that failed to load (a new version shipped while the
 * page was open) reloads the page once instead. Either way the crash is
 * reported (lib/oops.ts), so it can be found and fixed.
 */
export default function AppCrashed({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t, path } = useI18n();
  const router = useRouter();
  const app = appForPath(usePathname());
  const c = t.shell.crash;

  useEffect(() => {
    reportCrash(error, "app");
    if (isChunkError(error)) reloadOnce();
  }, [error]);

  return (
    <div className="os-crash" role="alertdialog" aria-labelledby="os-crash-title" aria-describedby="os-crash-body">
      <AppIcon app={app.id} size={56} live={false} />
      <h1 id="os-crash-title">{c.title.replace("{app}", t.shell.apps[app.label])}</h1>
      <p id="os-crash-body">{c.body}</p>
      <div className="os-crash-actions">
        <button type="button" onClick={() => router.push(path("/"))}>
          {c.desktop}
        </button>
        <button type="button" data-primary onClick={() => retry()} autoFocus>
          {c.reopen}
        </button>
      </div>
    </div>
  );
}

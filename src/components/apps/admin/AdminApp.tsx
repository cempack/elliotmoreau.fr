"use client";

import "./admin.css";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppWindow, WinNav, WinNavItem } from "@/components/os/AppWindow";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { auth, rpc, type AuthState, type Overview } from "./api";
import { Codes, Lock } from "./Lock";
import { Btn } from "./ui";
import { OverviewPane } from "./panes/OverviewPane";
import { TravelsPane } from "./panes/TravelsPane";
import { NowPane } from "./panes/NowPane";
import { MailPane } from "./panes/MailPane";
import { ProjectsPane } from "./panes/ProjectsPane";
import { SettingsPane } from "./panes/SettingsPane";
import { TextsPane } from "./panes/TextsPane";
import { StatsPane } from "./stats/StatsPane";

const PANES = ["overview", "stats", "mail", "projects", "texts", "places", "now", "settings"] as const;
export type Pane = (typeof PANES)[number];
/** links from before the redesign still land somewhere sensible */
const OLD: Record<string, Pane> = { status: "overview", travels: "places", live: "settings", system: "settings" };

const paneFromHash = (): Pane => {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return (PANES as readonly string[]).includes(h) ? (h as Pane) : (OLD[h] ?? "overview");
};

/**
 * Elliot's admin panel. Locked until a passkey opens it; then eight
 * sections: Overview (what visitors are told, where you are, the mail
 * waiting, today's visitors), Stats (the visitors' dashboard), Mail,
 * Projects, Texts (every sentence on the site), Places, Now and Settings.
 * Opened from the Terminal (`sudo -i`); hidden everywhere else.
 */
export function AdminApp() {
  const { t } = useI18n();
  const a = t.admin;
  const { blip } = useSound();
  const [state, setState] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  const load = useCallback(() => {
    auth<AuthState>("state").then((r) => {
      if (r.ok) setState({ signedIn: r.signedIn, setup: r.setup, setupReady: r.setupReady });
      else setFailed(true);
    });
  }, []);

  useEffect(load, [load]);

  // any call that finds the session gone locks the window again
  useEffect(() => {
    const onExpired = () => setState((s) => (s ? { ...s, signedIn: false } : s));
    window.addEventListener("emos-admin-expired", onExpired);
    return () => window.removeEventListener("emos-admin-expired", onExpired);
  }, []);

  const lock = async () => {
    await auth("logout");
    blip("close");
    setState((s) => (s ? { ...s, signedIn: false, setup: false } : s));
  };

  const signedIn = Boolean(state?.signedIn) && !codes;

  return (
    <AppWindow
      app="admin"
      className="app-admin"
      subtitle={<span className="app-admin-sub">{a.sub}</span>}
      toolbar={
        signedIn ? (
          <Btn kind="ghost" onClick={lock} className="app-admin-btn app-admin-locktool">
            {a.common.lock}
          </Btn>
        ) : undefined
      }
      sidebar={signedIn ? <AdminNav /> : undefined}
    >
      {codes ? (
        <Codes
          codes={codes}
          onDone={() => {
            setCodes(null);
            load();
          }}
        />
      ) : !state ? (
        <div className="app-admin-lock">
          <p className="app-admin-lock-lede" role="status">
            {failed ? a.lock.errors.unavailable : a.common.loading}
          </p>
        </div>
      ) : state.signedIn ? (
        <Panel />
      ) : (
        <Lock key={state.setup ? "setup" : "lock"} state={state} onUnlocked={load} onCodes={setCodes} />
      )}
    </AppWindow>
  );
}

/* ───────────────────────────── signed in ───────────────────────────── */

// the selected section lives in the URL hash so a reload keeps it
const listeners = new Set<() => void>();
function subscribePane(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("hashchange", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("hashchange", cb);
  };
}
function setPane(p: Pane) {
  history.replaceState(null, "", `#${p}`);
  listeners.forEach((l) => l());
}
const usePane = () => useSyncExternalStore(subscribePane, paneFromHash, () => "overview" as Pane);

// the Mail count in the sidebar (the sidebar renders outside the panel)
let unreadCount = 0;
const unreadListeners = new Set<() => void>();
function setUnread(n: number) {
  unreadCount = n;
  unreadListeners.forEach((l) => l());
}
function subscribeUnread(cb: () => void) {
  unreadListeners.add(cb);
  return () => {
    unreadListeners.delete(cb);
  };
}
const useUnread = () => useSyncExternalStore(subscribeUnread, () => unreadCount, () => 0);

function AdminNav() {
  const { t } = useI18n();
  const n = t.admin.nav;
  const pane = usePane();
  const unread = useUnread();
  return (
    <WinNav label={n.label}>
      {PANES.map((p) => (
        <WinNavItem key={p} href={`#${p}`} active={pane === p} count={p === "mail" && unread ? unread : undefined} onClick={() => setPane(p)}>
          {n[p]}
        </WinNavItem>
      ))}
    </WinNav>
  );
}

function Panel() {
  const { t } = useI18n();
  const pane = usePane();
  const [data, setData] = useState<Overview | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    rpc<Overview>("overview").then((r) => {
      if (!r.ok) return setError(r.error === "offline" ? t.admin.common.offline : r.error);
      const o: Overview = r;
      setData(o);
      setUnread(o.mail.unread);
      setVersion((v) => v + 1);
    });
  }, [t]);

  useEffect(refresh, [refresh]);

  if (!data)
    return (
      <div className="app-admin-lock">
        <p className="app-admin-lock-lede" role="status">
          {error || t.admin.common.loading}
        </p>
      </div>
    );

  // each pane keeps its own draft; a fresh overview (after a save) remounts it
  const k = `${pane}-${version}`;
  return (
    <div className="app-admin-panel">
      {pane === "overview" && <OverviewPane key={k} data={data} onSaved={refresh} onMail={() => setPane("mail")} onStats={() => setPane("stats")} />}
      {pane === "stats" && <StatsPane />}
      {pane === "mail" && <MailPane data={data} onChanged={refresh} />}
      {pane === "projects" && <ProjectsPane key={k} data={data} onSaved={refresh} />}
      {pane === "texts" && <TextsPane />}
      {pane === "places" && <TravelsPane key={`places-${version}`} data={data} onSaved={refresh} />}
      {pane === "now" && <NowPane key={k} data={data} onSaved={refresh} />}
      {pane === "settings" && <SettingsPane key={k} data={data} onSaved={refresh} />}
    </div>
  );
}

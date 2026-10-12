"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toasts";
import { useSound } from "@/lib/sound";
import { auth, rpc, type AuditRow, type Overview, type Passkey, type SessionRow } from "../api";
import { Codes } from "../Lock";
import { Btn, Group, Section, fill, useAgo } from "../ui";

export function SystemPane({ data, onChanged }: { data: Overview; onChanged: () => void }) {
  const { t } = useI18n();
  const s = t.admin.system;
  const c = t.admin.common;
  const ago = useAgo();
  const { notify } = useToast();
  const { blip } = useSound();
  const sys = data.system;
  const [passkeys, setPasskeys] = useState<Passkey[]>(sys.passkeys);
  const [sessions, setSessions] = useState<SessionRow[]>(sys.sessions);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [more, setMore] = useState(true);
  const [msg, setMsg] = useState("");
  const title = t.shell.apps.admin;

  useEffect(() => {
    rpc<{ entries: AuditRow[] }>("audit.list").then((r) => {
      if (r.ok) {
        setAudit(r.entries);
        setMore(r.entries.length === 100);
      }
    });
  }, []);

  const older = async () => {
    const last = audit?.[audit.length - 1];
    if (!last) return;
    const r = await rpc<{ entries: AuditRow[] }>("audit.list", { before: last.id });
    if (r.ok) {
      setAudit((a) => [...(a ?? []), ...r.entries]);
      setMore(r.entries.length === 100);
    }
  };

  const ask = (key: string, then: () => void) => {
    if (confirm === key) {
      setConfirm(null);
      then();
    } else setConfirm(key);
  };

  const addPasskey = async () => {
    setMsg("");
    const opts = await auth<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("register.options");
    if (!opts.ok) return setMsg(t.admin.lock.errors.failed);
    try {
      const response = await startRegistration({ optionsJSON: opts.options });
      const r = await auth("register.verify", { response });
      if (!r.ok) return setMsg(t.admin.lock.errors.failed);
      blip("success");
      notify(s.added, title);
      onChanged();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setMsg(name === "InvalidStateError" ? t.admin.lock.errors.exists : t.admin.lock.errors.cancelled);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    const r = await rpc<{ passkeys: Passkey[] }>("passkey.rename", renaming);
    if (r.ok) setPasskeys(r.passkeys);
    setRenaming(null);
  };

  const revoke = async (id: string) => {
    const r = await rpc<{ passkeys: Passkey[] }>("passkey.revoke", { id });
    if (r.ok) setPasskeys(r.passkeys);
    else if (r.error === "last") setMsg(s.lastKey);
  };

  const revokeSession = async (id: string) => {
    const r = await rpc<{ sessions: SessionRow[] }>("session.revoke", { id });
    if (r.ok) setSessions(r.sessions);
  };

  const revokeOthers = async () => {
    const r = await rpc<{ sessions: SessionRow[] }>("session.revokeOthers");
    if (r.ok) setSessions(r.sessions);
  };

  const regenerate = async () => {
    const r = await rpc<{ codes: string[] }>("recovery.regenerate");
    if (r.ok) setCodes(r.codes);
  };

  const refresh = async () => {
    const r = await rpc("site.refresh");
    if (r.ok) notify(s.refreshed, title);
  };

  const exportBackup = async () => {
    const r = await rpc<{ backup: unknown }>("export");
    if (!r.ok) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r.backup, null, 2)], { type: "application/json" }));
    a.download = `emos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (codes)
    return (
      <Codes
        codes={codes}
        onDone={() => {
          setCodes(null);
          onChanged();
        }}
      />
    );

  const integ = sys.integrations;
  const rows: [string, boolean, string][] = [
    [s.database, integ.database === "volume", integ.database === "volume" ? s.volume : s.local],
    [t.admin.mail.smtp, integ.smtp, integ.smtp ? t.admin.mail.ok : t.admin.mail.off],
    [t.admin.mail.imap, integ.imap, integ.imap ? t.admin.mail.ok : t.admin.mail.off],
    [s.github, integ.github, integ.github ? t.admin.mail.ok : t.admin.mail.off],
    [s.ghost, integ.ghost, integ.ghost ? t.admin.mail.ok : t.admin.mail.off],
    [s.spotify, integ.spotify, integ.spotify ? t.admin.mail.ok : t.admin.mail.off],
  ];

  return (
    <Section title={s.title}>
      <p className="app-admin-error" role="alert">
        {msg}
      </p>

      <Group title={s.session}>
        <p className="app-admin-hint">
          {fill(s.since, { time: ago(sys.session.createdAt) })} · {fill(s.until, { time: ago(sys.session.expiresAt) })}
        </p>
      </Group>

      <Group title={s.passkeys}>
        <ul className="app-admin-rows">
          {passkeys.map((p) => (
            <li key={p.id} className="app-admin-rowitem">
              {renaming?.id === p.id ? (
                <form
                  className="app-admin-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename();
                  }}
                >
                  <input
                    className="app-admin-input"
                    aria-label={s.rename}
                    value={renaming.name}
                    maxLength={60}
                    autoFocus
                    onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                  />
                  <Btn kind="primary" type="submit">
                    {c.save}
                  </Btn>
                  <Btn kind="ghost" onClick={() => setRenaming(null)}>
                    {c.cancel}
                  </Btn>
                </form>
              ) : (
                <>
                  <span className="app-admin-rowitem-main">
                    <strong>{p.name}</strong>
                    <span className="app-admin-hint">
                      {p.synced ? s.synced : s.thisDevice} · {p.lastUsedAt ? fill(s.lastUsed, { time: ago(p.lastUsedAt) }) : s.neverUsed}
                    </span>
                  </span>
                  <span className="app-admin-row">
                    <Btn kind="ghost" onClick={() => setRenaming({ id: p.id, name: p.name })}>
                      {s.rename}
                    </Btn>
                    <Btn kind="danger" disabled={passkeys.length <= 1} onClick={() => ask(`pk:${p.id}`, () => revoke(p.id))}>
                      {confirm === `pk:${p.id}` ? c.confirm : s.revoke}
                    </Btn>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="app-admin-row">
          <Btn onClick={addPasskey}>+ {s.addPasskey}</Btn>
        </div>
      </Group>

      <Group title={s.sessions}>
        <ul className="app-admin-rows">
          {sessions.map((x) => (
            <li key={x.id} className="app-admin-rowitem">
              <span className="app-admin-rowitem-main">
                <strong>
                  {x.device}
                  {x.current ? ` · ${s.current}` : ""}
                </strong>
                <span className="app-admin-hint">
                  {fill(s.since, { time: ago(x.createdAt) })}
                  {x.passkey ? ` · ${x.passkey}` : ""}
                </span>
              </span>
              {!x.current && (
                <Btn kind="danger" onClick={() => revokeSession(x.id)}>
                  {s.revoke}
                </Btn>
              )}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <div className="app-admin-row">
            <Btn kind="ghost" onClick={revokeOthers}>
              {s.revokeOthers}
            </Btn>
          </div>
        )}
      </Group>

      <Group title={s.recovery} hint={s.regenerateHint}>
        <div className="app-admin-row">
          <span className="app-admin-hint">{fill(s.recoveryLeft, { n: sys.recoveryLeft })}</span>
          <Btn onClick={() => ask("codes", regenerate)}>{confirm === "codes" ? c.confirm : s.regenerate}</Btn>
        </div>
      </Group>

      <Group title={s.integrations}>
        <ul className="app-admin-integ">
          {rows.map(([name, ok, value]) => (
            <li key={name}>
              <span className="app-admin-dot" data-kind={ok ? "ok" : "off"} aria-hidden />
              <span>{name}</span>
              <span className="app-admin-hint">{value}</span>
            </li>
          ))}
          <li>
            <span className="app-admin-dot" data-kind="ok" aria-hidden />
            <span>{s.site}</span>
            <span className="app-admin-hint">{integ.siteUrl}</span>
          </li>
        </ul>
        <div className="app-admin-row">
          <Btn onClick={refresh}>{s.refresh}</Btn>
          <Btn onClick={exportBackup}>{s.export}</Btn>
        </div>
      </Group>

      <Group title={s.audit}>
        {!audit ? (
          <p className="app-admin-empty">{c.loading}</p>
        ) : (
          <>
            <ol className="app-admin-audit">
              {audit.map((e) => (
                <li key={e.id} data-ok={e.ok || undefined}>
                  <time dateTime={e.at}>{ago(e.at)}</time>
                  <code>{e.action}</code>
                  <span>{e.detail}</span>
                </li>
              ))}
            </ol>
            {more && (
              <Btn kind="ghost" onClick={older}>
                {s.more}
              </Btn>
            )}
          </>
        )}
      </Group>
    </Section>
  );
}

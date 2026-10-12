"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import type { CommitDetail, CommitInfo } from "@/lib/github";
import { Cmd, Ext, fill } from "./ui";

/**
 * `git log --oneline` and `git show <hash>`: this site's real history,
 * read from GitHub through /api/git (cached). Hashes run `git show`.
 */

type State<T> = { status: "loading" } | { status: "ok"; value: T } | { status: "error"; notFound?: boolean };

function useGit<T>(url: string, pick: (j: Record<string, unknown>) => T | undefined): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        const value = r.ok ? pick(j) : undefined;
        setState(value ? { status: "ok", value } : { status: "error", notFound: r.status === 404 });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") setState({ status: "error" });
      });
    return () => ctrl.abort();
    // the url decides; pick is a fixed accessor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state;
}

export function GitLog() {
  const { t, lang } = useI18n();
  const g = t.system.term.git;
  const s = useGit<CommitInfo[]>("/api/git", (j) => j.commits as CommitInfo[] | undefined);
  if (s.status === "loading") return <p className="os-term-dim">{g.loading}</p>;
  if (s.status === "error") return <p className="os-term-err">{g.offline}</p>;
  return (
    <div className="os-term-block os-term-git">
      {s.value.map((c, i) => (
        <p key={c.sha} className="os-term-git-row">
          <Cmd value={`git show ${c.sha.slice(0, 7)}`}>
            <span className="os-term-git-sha">{c.sha.slice(0, 7)}</span>
          </Cmd>
          {i === 0 && <span className="os-term-git-head"> (HEAD -&gt; main)</span>} <span className="os-term-git-msg">{c.message}</span>{" "}
          <span className="os-term-dim">{c.date ? timeAgo(c.date, lang) : ""}</span>
        </p>
      ))}
      <p className="os-term-dim">{g.hint}</p>
    </div>
  );
}

export function GitShow({ refName }: { refName: string }) {
  const { t, lang } = useI18n();
  const g = t.system.term.git;
  const s = useGit<CommitDetail>(`/api/git?show=${encodeURIComponent(refName)}`, (j) => j.commit as CommitDetail | undefined);
  if (s.status === "loading") return <p className="os-term-dim">{g.loading}</p>;
  if (s.status === "error") return <p className="os-term-err">{s.notFound ? fill(g.badRev, { ref: refName }) : g.offline}</p>;
  const c = s.value;
  const files = c.files.length;
  return (
    <div className="os-term-block os-term-git">
      <p>
        <span className="os-term-git-sha">commit {c.sha}</span>
      </p>
      <p className="os-term-dim">
        {g.author} {c.author} · {c.date ? `${new Date(c.date).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" })} (${timeAgo(c.date, lang)})` : ""}
      </p>
      <p className="os-term-git-title">{c.message}</p>
      {c.body && <p className="os-term-git-body">{c.body}</p>}
      <ul className="os-term-git-files">
        {c.files.map((f) => (
          <li key={f.name}>
            <span className="os-term-git-file">{f.name}</span>
            <span className="os-term-git-add">+{f.additions}</span>
            <span className="os-term-git-del">-{f.deletions}</span>
          </li>
        ))}
      </ul>
      <p className="os-term-dim">
        {fill(g.summary, { n: files, a: c.stats.additions, d: c.stats.deletions })} · <Ext href={c.url}>{g.view}</Ext>
      </p>
    </div>
  );
}

"use client";

import { useId } from "react";
import type { L10n } from "@/lib/content";
import { useI18n } from "@/i18n/client";

/**
 * The admin panel's form kit: labelled fields, EN/FR pairs, toggles,
 * segmented choices, and the save bar every section ends with. Plain
 * controlled inputs; errors arrive from the server by field name.
 */

export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));

/** "3 min ago" / "in 2 h" from an ISO date or epoch ms */
export function useAgo() {
  const { t } = useI18n();
  const a = t.admin.time;
  return (at: string | number, now = Date.now()) => {
    const ms = now - (typeof at === "number" ? at : Date.parse(at));
    const abs = Math.abs(ms);
    const v =
      abs < 60_000
        ? a.now
        : abs < 3_600_000
          ? fill(a.min, { n: Math.round(abs / 60_000) })
          : abs < 86_400_000
            ? fill(a.hour, { n: Math.round(abs / 3_600_000) })
            : fill(a.day, { n: Math.round(abs / 86_400_000) });
    if (ms >= 0 || v === a.now) return v;
    // the future: "in 3 h" (drop the "ago" wording)
    const n = abs < 3_600_000 ? `${Math.round(abs / 60_000)} min` : abs < 86_400_000 ? `${Math.round(abs / 3_600_000)} h` : `${Math.round(abs / 86_400_000)} d`;
    return fill(a.in, { t: n });
  };
}

export function Section({ title, lede, children, actions }: { title: string; lede?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="app-admin-section">
      <header className="app-admin-section-head">
        <div>
          <h2 className="app-admin-h2">{title}</h2>
          {lede && <p className="app-admin-lede">{lede}</p>}
        </div>
        {actions && <div className="app-admin-section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="app-admin-group">
      <legend className="app-admin-legend">{title}</legend>
      {hint && <p className="app-admin-hint">{hint}</p>}
      <div className="app-admin-group-body">{children}</div>
    </fieldset>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  wide?: boolean;
  children: (id: string, describedBy?: string) => React.ReactNode;
};

export function Field({ label, hint, error, wide, children }: FieldProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-d` : undefined;
  return (
    <div className="app-admin-field" data-wide={wide || undefined} data-error={error ? "" : undefined}>
      <label className="app-admin-label" htmlFor={id}>
        {label}
      </label>
      {children(id, hintId)}
      {(error || hint) && (
        <p id={hintId} className={error ? "app-admin-error" : "app-admin-hint"}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Text({
  label,
  value,
  onChange,
  hint,
  error,
  wide,
  type = "text",
  placeholder,
  disabled,
  mono,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  wide?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <Field label={label} hint={hint} error={error} wide={wide}>
      {(id, d) => (
        <input
          id={id}
          aria-describedby={d}
          aria-invalid={error ? true : undefined}
          className="app-admin-input"
          data-mono={mono || undefined}
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function Area({
  label,
  value,
  onChange,
  hint,
  error,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint} error={error} wide>
      {(id, d) => (
        <textarea
          id={id}
          aria-describedby={d}
          aria-invalid={error ? true : undefined}
          className="app-admin-input app-admin-textarea"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

/** an English / French pair, side by side (stacked on phones) */
export function Pair({
  label,
  value,
  onChange,
  hint,
  error,
  area,
  rows,
}: {
  label: string;
  value: L10n | undefined;
  onChange: (v: L10n) => void;
  hint?: string;
  error?: string;
  area?: boolean;
  rows?: number;
}) {
  const { t } = useI18n();
  const v = value ?? { en: "", fr: "" };
  const id = useId();
  return (
    <div className="app-admin-field app-admin-pair" data-wide="" data-error={error ? "" : undefined} role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="app-admin-label">
        {label}
      </span>
      <div className="app-admin-pair-row">
        {(["en", "fr"] as const).map((l) => (
          <label key={l} className="app-admin-pair-cell">
            <span className="app-admin-lang" aria-label={l === "en" ? t.admin.common.en : t.admin.common.fr}>
              {l.toUpperCase()}
            </span>
            {area ? (
              <textarea
                className="app-admin-input app-admin-textarea"
                rows={rows ?? 3}
                value={v[l]}
                lang={l}
                aria-invalid={error ? true : undefined}
                onChange={(e) => onChange({ ...v, [l]: e.target.value })}
              />
            ) : (
              <input
                className="app-admin-input"
                value={v[l]}
                lang={l}
                aria-invalid={error ? true : undefined}
                onChange={(e) => onChange({ ...v, [l]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      {(error || hint) && <p className={error ? "app-admin-error" : "app-admin-hint"}>{error || hint}</p>}
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  wide,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: string;
  error?: string;
  wide?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} wide={wide}>
      {(id, d) => (
        <select
          id={id}
          aria-describedby={d}
          className="app-admin-input app-admin-select"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="app-admin-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="app-admin-switch" aria-hidden />
      <span className="app-admin-toggle-text">
        <span>{label}</span>
        {hint && <span className="app-admin-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  const name = useId();
  return (
    <div className="app-admin-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className="app-admin-seg-opt" data-on={o.value === value || undefined}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Btn({
  children,
  kind = "plain",
  ...rest
}: { children: React.ReactNode; kind?: "plain" | "primary" | "danger" | "ghost" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="app-admin-btn" data-kind={kind} {...rest}>
      {children}
    </button>
  );
}

/** Undo / Save, stuck to the bottom of the section while there are changes */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onRevert,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
  error?: string;
}) {
  const { t } = useI18n();
  const c = t.admin.common;
  return (
    <div className="app-admin-savebar" data-dirty={dirty || undefined} data-error={error ? "" : undefined}>
      <p className="app-admin-savebar-msg" role="status" aria-live="polite">
        {error ? error : dirty ? c.unsaved : ""}
      </p>
      <Btn kind="ghost" onClick={onRevert} disabled={!dirty || saving}>
        {c.revert}
      </Btn>
      <Btn kind="primary" onClick={onSave} disabled={!dirty || saving}>
        {saving ? c.saving : c.save}
      </Btn>
    </div>
  );
}

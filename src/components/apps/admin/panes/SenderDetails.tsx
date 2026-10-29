"use client";

import { useI18n } from "@/i18n/client";
import type { Sender } from "../api";
import { fill } from "../ui";
import { describeUa } from "../ua";

/** how long sender details are kept (src/server/mail/config SENDER_DAYS) */
const KEPT_DAYS = 90;

const LOOKUPS = [
  { name: "ipinfo", url: (ip: string) => `https://ipinfo.io/${ip}` },
  { name: "AbuseIPDB", url: (ip: string) => `https://www.abuseipdb.com/check/${ip}` },
  { name: "bgp.he.net", url: (ip: string) => `https://bgp.he.net/ip/${ip}` },
];

function duration(ms: number, lang: "en" | "fr") {
  const s = Math.round(ms / 1000);
  const unit = (n: number, u: "second" | "minute" | "hour") =>
    new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { style: "unit", unit: u, unitDisplay: "short" }).format(n);
  if (s < 60) return unit(s, "second");
  if (s < 3600) return `${unit(Math.floor(s / 60), "minute")} ${unit(s % 60, "second")}`;
  return `${unit(Math.floor(s / 3600), "hour")} ${unit(Math.floor((s % 3600) / 60), "minute")}`;
}

function countryName(code: string | undefined, lang: "en" | "fr") {
  if (!code) return undefined;
  if (code === "T1") return "Tor";
  if (code === "XX") return undefined;
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** a time zone's offset from UTC right now, in minutes (to compare two zones) */
function offsetOf(zone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date());
    const m = parts.find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  } catch {
    return null;
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Who sent a letter from the site: one line at a glance (where, what
 * browser, the IP, and anything that looks off), then everything kept
 * about it, open on demand.
 */
export function SenderDetails({ s }: { s: Sender }) {
  const { t, lang } = useI18n();
  const w = t.admin.mail.who;
  const c = s.clues ?? {};
  const net = s.network;
  const ua = s.userAgent ? describeUa(s.userAgent) : null;
  const country = countryName(s.country ?? net?.country, lang);
  const place = [s.city ?? net?.city, s.region ?? net?.region, country].filter(Boolean).join(", ");
  const ipZone = s.ipTimeZone ?? net?.timezone;
  const zoneOff = s.timeZone && ipZone && s.timeZone !== ipZone && offsetOf(s.timeZone) !== offsetOf(ipZone);
  const loc = s.latitude && s.longitude ? `${s.latitude},${s.longitude}` : net?.loc;
  const gpc = s.headers?.["sec-gpc"] === "1";

  const flags = [
    (s.country === "T1" || net?.tor) && w.flagTor,
    net?.vpn && w.flagVpn,
    net?.proxy && w.flagProxy,
    net?.relay && w.flagRelay,
    (net?.datacenter || net?.hosting) && !net?.vpn && w.flagDatacenter,
    zoneOff && w.flagZone,
    c.webdriver && w.flagWebdriver,
    ua?.script && ua.text.split(" · ")[0],
    c.pasted && w.flagPasted,
    c.writingMs != null && c.writingMs < 15_000 && fill(w.flagFast, { time: duration(c.writingMs, lang) }),
    s.sameIp.spam > 0 && w.flagSpamIp,
    s.turnstile !== "passed" && w.flagNoTurnstile,
  ].filter((f): f is string => Boolean(f));

  const row = (label: string, value: React.ReactNode) =>
    value == null || value === "" || value === false ? null : (
      <div className="app-admin-who-row">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );

  return (
    <div className="app-admin-who">
      <p className="app-admin-who-line">
        {place && <span>{place}</span>}
        {ua && <span>{ua.text}</span>}
        <span className="tabular">{s.ip}</span>
        {flags.map((f) => (
          <span key={f} className="app-admin-tag app-admin-who-flag">
            {f}
          </span>
        ))}
      </p>
      <details className="app-admin-who-more">
        <summary>{w.details}</summary>

        <h4 className="app-admin-who-h">{w.network}</h4>
        <dl>
          {row(
            w.ip,
            <>
              <span className="tabular">{s.ip}</span>{" "}
              <button type="button" className="app-admin-link" onClick={() => navigator.clipboard?.writeText(s.ip).catch(() => {})}>
                {w.copy}
              </button>
            </>
          )}
          {row(w.rdns, s.host ?? net?.hostname)}
          {row(w.org, net?.org && [net.org, net.asn].filter(Boolean).join(" · "))}
          {row(w.edge, s.viaCloudflare ? fill(w.edgeVia, { colo: s.colo ?? "?", ray: s.ray ?? "?" }) : w.direct)}
          {row(
            w.lookup,
            <span className="app-admin-who-links">
              {LOOKUPS.map((l) => (
                <a key={l.name} href={l.url(s.ip)} target="_blank" rel="noreferrer noopener">
                  {l.name}
                </a>
              ))}
            </span>
          )}
        </dl>

        <h4 className="app-admin-who-h">{w.place}</h4>
        <dl>
          {row(w.cfPlace, [s.city, s.region, s.postal, countryName(s.country, lang), s.continent].filter(Boolean).join(", "))}
          {row(w.ipinfoPlace, net && [net.city, net.region, net.postal, countryName(net.country, lang)].filter(Boolean).join(", "))}
          {row(
            w.map,
            loc && (
              <a href={`https://www.openstreetmap.org/?mlat=${loc.split(",")[0]}&mlon=${loc.split(",")[1]}#map=11/${loc.replace(",", "/")}`} target="_blank" rel="noreferrer noopener">
                {loc}
              </a>
            )
          )}
          {row(w.ipZone, ipZone)}
          {row(w.browserZone, s.timeZone)}
        </dl>

        <h4 className="app-admin-who-h">{w.device}</h4>
        <dl>
          {row(w.browser, ua?.text)}
          {row(w.hints, c.brands?.join(", "))}
          {row(w.platform, [c.platform, c.mobile ? "mobile" : null].filter(Boolean).join(", "))}
          {row(w.screen, c.screen && `${c.screen}${c.dpr ? ` @${c.dpr}x` : ""}${c.colorDepth ? ` · ${c.colorDepth}-bit` : ""}`)}
          {row(w.windowSize, c.window)}
          {row(
            w.hardware,
            [c.cores && fill(w.cores, { n: c.cores }), c.memory && fill(w.memory, { n: c.memory }), c.touch != null && fill(w.touch, { n: c.touch })]
              .filter(Boolean)
              .join(" · ")
          )}
          {row(
            w.prefs,
            [c.dark != null && (c.dark ? w.dark : w.light), c.reducedMotion && w.reducedMotion, c.cookies === false && w.cookiesOff, c.dnt && w.dnt, gpc && w.gpc]
              .filter(Boolean)
              .join(" · ")
          )}
          {row(w.connection, [c.connection, c.saveData && w.saveData].filter(Boolean).join(" · "))}
          {row(w.languages, c.languages?.join(", ") ?? s.acceptLanguage)}
        </dl>

        <h4 className="app-admin-who-h">{w.visit}</h4>
        <dl>
          {row(
            w.cameFrom,
            c.ref ? (
              <a href={c.ref} target="_blank" rel="noreferrer noopener" title={c.ref}>
                {hostOf(c.ref)}
              </a>
            ) : (
              c.landing && w.noReferrer
            )
          )}
          {row(w.landed, c.landing)}
          {row(w.pages, c.pages?.length ? c.pages.join(" → ") : undefined)}
          {row(w.onSite, c.onSiteMs != null && fill(w.before, { time: duration(c.onSiteMs, lang) }))}
          {row(w.writing, c.writingMs != null && [duration(c.writingMs, lang), c.pasted && w.flagPasted].filter(Boolean).join(" · "))}
        </dl>

        <h4 className="app-admin-who-h">{w.checks}</h4>
        <dl>
          {row(w.turnstile, s.turnstile === "passed" ? w.passed : w.notChecked)}
          {row(w.sameIp, s.sameIp.threads ? fill(w.sameIpSome, { n: s.sameIp.threads, spam: s.sameIp.spam }) : w.sameIpNone)}
        </dl>

        {s.headers && (
          <details className="app-admin-who-headers">
            <summary>{w.headers}</summary>
            <pre>
              {Object.entries(s.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n")}
            </pre>
          </details>
        )}
        <p className="app-admin-hint">{fill(w.kept, { days: KEPT_DAYS })}</p>
      </details>
    </div>
  );
}

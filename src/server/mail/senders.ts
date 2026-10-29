import "server-only";
import { promises as dns } from "node:dns";
import { db, type DB } from "../db";
import { env } from "../env";
import { DAY, SENDER_DAYS } from "./config";
import { saltedHash } from "./crypto";
import { isPublicIp, type SenderInfo } from "./http";

/**
 * Who sent each letter from the site, for the admin panel only (never the
 * visitor's view): what the request said (senderOf: the IP, Cloudflare's
 * place for it, every header, the browser's clues about itself and the
 * visit), whether Turnstile passed, and, looked up just after it arrives,
 * the IP's reverse DNS and network (ipinfo.io: ISP or host, AS number).
 * Kept SENDER_DAYS, then deleted (pruneSenders); the thread itself only
 * ever holds a salted hash of the IP, for the spam and rate limits.
 */

/** the network an IP belongs to */
export type Network = {
  asn?: string;
  /** the AS's owner: an ISP, a mobile carrier, a host, a VPN */
  org?: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  /** "lat,lon" */
  loc?: string;
  postal?: string;
  timezone?: string;
  /** a hosting company's network (VPNs and scripts live there, people rarely do) */
  datacenter?: boolean;
  /** ipinfo's paid privacy flags, when the token's plan has them */
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
  relay?: boolean;
  hosting?: boolean;
};

export type SenderRow = Omit<SenderInfo, "ip"> & {
  ip: string;
  /** reverse DNS of the IP */
  host?: string;
  network?: Network;
  turnstile: "passed" | "off";
  /** other conversations started from this IP (marked as spam among them) */
  sameIp: { threads: number; spam: number };
};

type SenderDb = {
  message_id: string;
  ip: string;
  country: string | null;
  host: string | null;
  network: string | null;
  info: string;
  turnstile: "passed" | "off";
  created_at: string;
};

/** inside the transaction that stores the letter */
export function insertSender(d: DB, messageId: string, s: SenderInfo, turnstile: "passed" | "off", at: string) {
  const { ip, ...info } = s;
  d.prepare(
    `INSERT INTO mail_senders (message_id, ip, country, info, turnstile, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(messageId, ip, s.country ?? null, JSON.stringify(info), turnstile, at);
}

/** hosting companies, cloud providers and the networks VPNs rent from */
const DATACENTER =
  /\b(amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai|vultr|choopa|contabo|scaleway|online s\.a\.s|leaseweb|m247|datacamp|cdn77|hostinger|ionos|1&1|godaddy|alibaba|tencent|oracle|cloudflare|fastly|packethub|clouvider|hostroyale|zenlayer|psychz|quadranet|colocrossing|buyvm|frantech|serverius|worldstream|nforce|hivelocity|tzulo|g-core|gcore|stark industries|aeza|pq hosting|tefincom|nordvpn|expressvpn|private internet access|mullvad|proton ?ag|surfshark|ipxo|hosting|server|cloud|data ?cent(er|re)|vps|colo)\b/i;

async function ipinfo(ip: string): Promise<Network | undefined> {
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${env.ipinfoToken ? `?token=${encodeURIComponent(env.ipinfoToken)}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5_000), cache: "no-store" });
  if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
  const j = (await res.json()) as Record<string, unknown>;
  if (j.bogon) return undefined;
  const s = (k: string) => (typeof j[k] === "string" && j[k] ? (j[k] as string).slice(0, 200) : undefined);
  const org = s("org");
  const m = org?.match(/^(AS\d+)\s+(.*)$/);
  const asn = j.asn && typeof j.asn === "object" ? (j.asn as Record<string, unknown>) : undefined;
  const privacy = j.privacy && typeof j.privacy === "object" ? (j.privacy as Record<string, unknown>) : undefined;
  const name = m?.[2] ?? (typeof asn?.name === "string" ? asn.name : org);
  const net: Network = {
    asn: m?.[1] ?? (typeof asn?.asn === "string" ? asn.asn : undefined),
    org: name,
    hostname: s("hostname"),
    city: s("city"),
    region: s("region"),
    country: s("country"),
    loc: s("loc"),
    postal: s("postal"),
    timezone: s("timezone"),
    datacenter: (name && DATACENTER.test(name)) || asn?.type === "hosting" || undefined,
    ...(privacy
      ? { vpn: privacy.vpn === true, proxy: privacy.proxy === true, tor: privacy.tor === true, relay: privacy.relay === true, hosting: privacy.hosting === true }
      : {}),
  };
  for (const k of Object.keys(net) as (keyof Network)[]) if (net[k] === undefined) delete net[k];
  return net;
}

function within<T>(p: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error("timeout")), ms)))]).finally(() => clearTimeout(timer));
}

/**
 * The IP's reverse DNS name and its network, in the background, just
 * after the letter is stored (nothing waits for it; a slow answer is given
 * up on). Public addresses only.
 */
export function lookupSender(messageId: string, ip: string) {
  if (!isPublicIp(ip) || process.env.EMOS_MAIL_TEST === "1") return;
  void Promise.allSettled([within(dns.reverse(ip), 4_000), env.ipLookup ? ipinfo(ip) : Promise.resolve(undefined)]).then(([rdns, net]) => {
    const host = rdns.status === "fulfilled" ? rdns.value[0]?.slice(0, 253) : undefined;
    const network = net.status === "fulfilled" ? net.value : undefined;
    if (net.status === "rejected") console.warn("[mail] IP lookup:", (net.reason as Error)?.message ?? net.reason);
    if (!host && !network) return;
    try {
      db()
        .prepare(`UPDATE mail_senders SET host = COALESCE(?, host), network = COALESCE(?, network) WHERE message_id = ?`)
        .run(host ?? null, network ? JSON.stringify(network) : null, messageId);
    } catch {}
  });
}

const parse = <T>(json: string | null): T | undefined => {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

/** sender details by letter, for one thread's messages */
export function sendersOf(threadId: string): Map<string, SenderRow> {
  const rows = db()
    .prepare(`SELECT s.* FROM mail_senders s JOIN messages m ON m.id = s.message_id WHERE m.thread_id = ?`)
    .all(threadId) as SenderDb[];
  const count = db().prepare(`SELECT COUNT(*) AS threads, COALESCE(SUM(status = 'spam'), 0) AS spam FROM threads WHERE ip_hash = ? AND id != ?`);
  const sameIp = new Map<string, { threads: number; spam: number }>();
  const out = new Map<string, SenderRow>();
  for (const r of rows) {
    let same = sameIp.get(r.ip);
    if (!same) {
      same = count.get(saltedHash(r.ip), threadId) as { threads: number; spam: number };
      sameIp.set(r.ip, same);
    }
    const network = parse<Network>(r.network);
    out.set(r.message_id, {
      ...(parse<Omit<SenderInfo, "ip">>(r.info) ?? { viaCloudflare: false }),
      ip: r.ip,
      ...(r.host ? { host: r.host } : {}),
      ...(network ? { network } : {}),
      turnstile: r.turnstile,
      sameIp: same,
    });
  }
  return out;
}

/** the country of each thread's first letter, for the inbox list */
export function firstCountries(threadIds: string[]): Map<string, string> {
  if (!threadIds.length) return new Map();
  const rows = db()
    .prepare(
      `SELECT m.thread_id AS thread, s.country AS country FROM mail_senders s JOIN messages m ON m.id = s.message_id
       WHERE m.thread_id IN (${threadIds.map(() => "?").join(", ")}) AND s.country IS NOT NULL
       ORDER BY m.created_at DESC`
    )
    .all(...threadIds) as { thread: string; country: string }[];
  // newest first, so the oldest letter's country is written last and wins
  return new Map(rows.map((r) => [r.thread, r.country]));
}

/** forget sender details older than SENDER_DAYS */
export function pruneSenders(now = Date.now()) {
  db().prepare(`DELETE FROM mail_senders WHERE created_at < ?`).run(new Date(now - SENDER_DAYS * DAY).toISOString());
}

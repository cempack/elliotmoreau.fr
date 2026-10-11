/**
 * Just enough OpenPGP to describe a public key honestly in the browser:
 * de-armor, walk the packets, and read the primary key's version,
 * algorithm, creation time and user IDs. The fingerprint is computed with
 * WebCrypto (v4: SHA-1, v6: SHA-256, RFC 9580 §5.5.4), never typed in by
 * hand, so what the page shows is what the file holds.
 */

export type KeyInfo = {
  armored: string;
  version: number;
  algorithm: string;
  created: Date;
  /** uppercase hex, no spaces */
  fingerprint: string;
  /** last 16 hex digits of a v4 fingerprint, first 16 of a v6 one */
  keyId: string;
  userIds: string[];
  /** raw fingerprint bytes (drives the visual fingerprint) */
  bytes: Uint8Array;
};

const ALGOS: Record<number, string> = {
  1: "RSA",
  2: "RSA",
  3: "RSA",
  16: "ElGamal",
  17: "DSA",
  18: "ECDH",
  19: "ECDSA",
  22: "Ed25519",
  25: "X25519",
  26: "X448",
  27: "Ed25519",
  28: "Ed448",
};

function dearmor(text: string): Uint8Array {
  const m = /-----BEGIN PGP PUBLIC KEY BLOCK-----([\s\S]*?)-----END PGP PUBLIC KEY BLOCK-----/.exec(text);
  if (!m) throw new Error("not an armored public key");
  // armor headers end at the first blank line; the CRC line starts with "="
  const lines = m[1].replace(/\r/g, "").split("\n");
  const blank = lines.findIndex((l, i) => i > 0 && !l.trim());
  const body = (blank > 0 && lines.slice(1, blank).some((l) => l.includes(":")) ? lines.slice(blank + 1) : lines)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("="))
    .join("");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Packet = { tag: number; body: Uint8Array };

function packets(b: Uint8Array): Packet[] {
  const out: Packet[] = [];
  let i = 0;
  while (i < b.length) {
    const h = b[i++];
    if (!(h & 0x80)) break;
    let tag: number;
    let len: number;
    if (h & 0x40) {
      tag = h & 0x3f;
      const l = b[i++];
      if (l < 192) len = l;
      else if (l < 224) len = ((l - 192) << 8) + b[i++] + 192;
      else if (l === 255) {
        len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
        i += 4;
      } else break; // partial lengths never appear in key material
    } else {
      tag = (h >> 2) & 0x0f;
      const lt = h & 3;
      if (lt === 0) len = b[i++];
      else if (lt === 1) {
        len = (b[i] << 8) | b[i + 1];
        i += 2;
      } else if (lt === 2) {
        len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
        i += 4;
      } else len = b.length - i;
    }
    out.push({ tag, body: b.subarray(i, i + len) });
    i += len;
  }
  return out;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

export async function parseKey(armored: string): Promise<KeyInfo> {
  const all = packets(dearmor(armored));
  const pk = all.find((p) => p.tag === 6);
  if (!pk || pk.body.length < 6) throw new Error("no public key packet");
  const body = pk.body;
  const version = body[0];
  const created = new Date((((body[1] << 24) | (body[2] << 16) | (body[3] << 8) | body[4]) >>> 0) * 1000);
  const algorithm = ALGOS[body[5]] ?? `#${body[5]}`;

  let prefix: Uint8Array;
  let digest: "SHA-1" | "SHA-256";
  if (version === 6) {
    const n = body.length;
    prefix = new Uint8Array([0x9b, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    digest = "SHA-256";
  } else {
    prefix = new Uint8Array([0x99, (body.length >> 8) & 255, body.length & 255]);
    digest = "SHA-1";
  }
  const buf = new Uint8Array(prefix.length + body.length);
  buf.set(prefix);
  buf.set(body, prefix.length);
  const bytes = new Uint8Array(await crypto.subtle.digest(digest, buf));
  const fingerprint = hex(bytes);
  const keyId = version === 6 ? fingerprint.slice(0, 16) : fingerprint.slice(-16);

  const dec = new TextDecoder();
  const userIds = all.filter((p) => p.tag === 13).map((p) => dec.decode(p.body));

  return { armored: armored.trim(), version, algorithm, created, fingerprint, keyId, userIds, bytes };
}

/** "FB89E127…" → ["FB89", "E127", …] */
export const groups = (fp: string, size = 4) => fp.match(new RegExp(`.{1,${size}}`, "g")) ?? [];

/**
 * The "drunken bishop" (OpenSSH's visual host key): a bishop starts in
 * the middle of a 17 × 9 board and takes four diagonal steps per byte of
 * the fingerprint, two bits at a time. Returns visit counts per cell,
 * plus where it started and where it stopped. Different keys draw very
 * different pictures, so it's easy to compare at a glance.
 */
export const ART_W = 17;
export const ART_H = 9;

export function drunkenBishop(bytes: Uint8Array) {
  const grid = new Array<number>(ART_W * ART_H).fill(0);
  let x = (ART_W - 1) / 2;
  let y = (ART_H - 1) / 2;
  const start = { x, y };
  for (const byte of bytes) {
    let b = byte;
    for (let s = 0; s < 4; s++) {
      x = Math.max(0, Math.min(ART_W - 1, x + (b & 1 ? 1 : -1)));
      y = Math.max(0, Math.min(ART_H - 1, y + (b & 2 ? 1 : -1)));
      grid[y * ART_W + x]++;
      b >>= 2;
    }
  }
  return { grid, start, end: { x, y } };
}

let cache: Promise<KeyInfo> | null = null;

/** Fetches and parses /pgp.asc once per page load; a failure can be retried. */
export function loadKey(): Promise<KeyInfo> {
  if (!cache) {
    cache = fetch("/pgp.asc", { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(parseKey);
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

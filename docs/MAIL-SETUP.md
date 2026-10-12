# Mail setup: Proton Mail Bridge on Railway

The Mail app sends visitors' letters to your Proton inbox, and shows your
replies on the site. Proton only speaks SMTP/IMAP through **Proton Mail
Bridge**, so Bridge runs as a second Railway service next to the web
service, reachable only on Railway's private network.

```
visitor ── Send ──▶ web service ── SMTP :25 ──▶ proton-bridge ──▶ Proton ──▶ your inbox
                        ▲                            │
                        └──── IMAP :143 (every 2 min) ┘   reads Sent + INBOX for replies
```

What happens to a letter:

- **A visitor sends one.** The web service hands it to Bridge (From
  `emOS · <their name>` at your address, Reply-To the visitor). It is stored
  as a thread only once Bridge has accepted it, so "Delivered" on the site
  is true.
- **You reply in Proton** (your normal mail app, web or phone). Proton sends
  it to the visitor (Reply-To) and files it in Sent. The site reads Sent
  every 2 minutes, finds the reply by its In-Reply-To/References, cuts the
  quoted history, and shows it in the visitor's Sent mailbox and in the
  admin panel.
- **You reply from the admin panel.** It goes out through Bridge with the
  visitor's private link to the thread. Its copy in Proton's Sent is
  recognised and not shown twice.
- **The visitor answers your email.** It lands in your inbox; the site
  picks it up (only if it comes from the visitor's address).

Nothing is ever emailed to an address a visitor typed, except your own
replies.

---

## 0. Before you start

- **A paid Proton plan.** Proton: "Proton Mail Bridge is currently available
  only with a paid Proton Mail plan." That covers the personal paid plans
  (Mail Plus, Proton Unlimited, Duo, Family, Visionary) and the business
  plans; free accounts can't log in to Bridge. Custom domains (elliotm.fr,
  elliotmoreau.fr) already need a paid plan, so if they receive mail in
  Proton today you have one. Proton renames plans now and then; the current
  wording is on proton.me/support/imap-smtp-and-pop3-setup.
- **Your Proton password, your 2FA device**, and if your account uses
  two-password mode, the mailbox password.
- **The web service already on Railway** (docs/RAILWAY.md), with
  `SITE_URL=https://elliotmoreau.fr` and `SESSION_SECRET` set.
- **The Railway CLI**, logged in: `npm i -g @railway/cli`, `railway login`.
  The first `railway ssh` asks to register an SSH key; say yes.

## 1. The image

Use **`ghcr.io/asyncura/proton-mail-bridge`**
(source: github.com/asyncura/ProtonMailBridgeDocker).

Why this one: it is built from Proton's official Bridge source
(`make build-nogui`) and rebuilt automatically for every Bridge release
(v3.27.1 on 2026-10-08), for amd64 and arm64, on Debian slim. It keeps
Bridge's credentials in a `pass` store under `/root`, forwards SMTP on
container port **25** and IMAP on **143** to Bridge's own 127.0.0.1:1025
and :1143 (Bridge itself only listens on localhost), shuts down cleanly,
and stays up after you stop its Bridge to log in by hand. The older
`shenxn/protonmail-bridge` image is no longer maintained; don't use it.

Pin a version tag so an upgrade only happens when you choose:
`ghcr.io/asyncura/proton-mail-bridge:v3.27.1`. To upgrade later, change the
tag to the newer version in its changelog and redeploy; the login survives
(it lives on the volume).

## 2. Create the Bridge service

In the Railway project (same environment as the web service):

1. **New → Docker Image**, image `ghcr.io/asyncura/proton-mail-bridge:v3.27.1`.
2. Rename the service to **`proton-bridge`**. Its private host name follows
   the name: `proton-bridge.railway.internal`.
3. **Settings → Networking:** don't generate a public domain and don't add a
   TCP proxy. Bridge must only be reachable from the web service.
4. **Add a volume** (right-click the service → Attach volume) mounted at
   **`/root`**. It holds the GPG key, the `pass` store with your Proton
   session, Bridge's settings and its message cache. Give it 5 GB; the cache
   grows with your mailbox.
5. **Region:** the same as the web service.
6. **Healthcheck path:** leave it empty (Bridge isn't an HTTP service).
7. **Variables:** none needed. (The image's defaults are
   `CONTAINER_SMTP_PORT=25`, `CONTAINER_IMAP_PORT=143`.)
8. Deploy. The first boot logs `First launch detected: initializing GPG key
   and password store...`, then Bridge starts, not logged in yet.

Private networking: in Railway environments created after 16 October 2025,
`*.railway.internal` resolves to both IPv4 and IPv6, and the image's
forwarders listen on IPv4. A project created now is fine (see
Troubleshooting if yours is older).

## 3. Log Bridge in to Proton (once)

From your computer, in the repo folder:

```sh
railway link                         # choose the project and the environment
railway ssh --service proton-bridge  # a shell inside the Bridge container
```

Inside the container:

```sh
pkill bridge          # stop the supervised Bridge: only one can run at a time
/app/bridge --cli     # Bridge's interactive CLI (prompt: >>>)
```

At the `>>>` prompt:

```
login
```

It asks for your Proton username (your address), your password, the 2FA
code, and, only in two-password mode, the mailbox password. Then it syncs
your mailbox; on a large one the first sync takes a while. Wait until it
reports the sync has finished.

Keep the default **combined** address mode (every address in one mailbox,
one login): that is what the site expects. Don't run `change mode`.

```
info
```

`info` prints the IMAP and SMTP settings for your account: address
127.0.0.1, IMAP port 1143, SMTP port 1025, security STARTTLS, a
**Username** (your address) and a **Password**. That password is generated
by Bridge; it is **not** your Proton password. Copy the username and
password into your password manager; the same pair works for IMAP and SMTP.
(Ignore the ports and address it shows: from the web service you use the
container's 25 and 143 on its private host name, step 4.)

```
exit
```

Leave the shell (`exit` again), then **restart the service** so the
supervised Bridge comes back: Railway → `proton-bridge` → Deployments →
latest → ⋮ → Restart. Its logs should show Bridge starting with your account.

You only repeat this step if Proton signs Bridge out (after a password
change, or if you revoke its session in Proton → Settings → Security).

## 4. Point the web service at Bridge

Railway → web service → **Variables**:

| Variable | Value | Why |
| --- | --- | --- |
| `SMTP_HOST` | `${{proton-bridge.RAILWAY_PRIVATE_DOMAIN}}` (= `proton-bridge.railway.internal`) | Bridge on the private network |
| `SMTP_PORT` | `25` | the container's SMTP port (not 1025) |
| `SMTP_USER` | the Username from `info` | |
| `SMTP_PASS` | the Password from `info` | the Bridge password, not your Proton one |
| `IMAP_HOST` | `${{proton-bridge.RAILWAY_PRIVATE_DOMAIN}}` | |
| `IMAP_PORT` | `143` | the container's IMAP port (not 1143) |
| `IMAP_USER` | the same Username | |
| `IMAP_PASS` | the same Password | |
| `IMAP_SENT` | `Sent` | Bridge's name for the Sent folder |
| `IMAP_INBOX` | `INBOX` | or `All Mail` if filters move mail out of the inbox |
| `MAIL_TO` | `hello@elliotm.fr` | where visitors' letters arrive |
| `MAIL_FROM` | `hello@elliotm.fr` | what the site sends as; must be an address of your Proton account (Bridge refuses any other) |

Leave `SMTP_SECURE` and `IMAP_SECURE` unset: Bridge speaks plain + STARTTLS
on these ports, and the site upgrades to TLS by itself. Bridge's
certificate is self-signed, so certificate checks are skipped for
`*.railway.internal` hosts only (that traffic is already inside Railway's
WireGuard network); everywhere else they stay on. `IMAP_POLL_SECONDS`
(default 120) sets how often replies are read.

Saving the variables redeploys the web service. Once SMTP is configured
the Mail app sends from the site (with a From field); without it, Send
keeps handing the letter to the visitor's own mail app.

## 5. Check it works

1. `curl -s https://elliotmoreau.fr/api/health` shows `"smtp":true,"imap":true`
   (configured; it never shows secrets).
2. Admin panel → Mail → **Send test email**: an "emOS test email" arrives in
   your Proton inbox. If it doesn't, the same view shows the last SMTP error.
3. From another address (a Gmail, say), write to yourself through the site:
   it arrives from "emOS · <name>" with Reply-To that address, and the
   letter appears in the admin inbox.
4. Reply to it from Proton. Within about 2 minutes the reply shows on the
   site: in the browser you wrote from (Mail → Sent), and in the admin
   thread. The web service logs `[mail] Sent: 1 new`.
5. Reply again from the admin panel: it reaches the Gmail with a link back
   to the thread, and doesn't show twice once Proton's copy is read.

## Troubleshooting

- **`ECONNREFUSED proton-bridge.railway.internal:25`** — Bridge isn't up:
  check the `proton-bridge` logs. After `pkill bridge` it stays down until
  the service is restarted (step 3).
- **`535` / `Invalid username or password`** — that's your Proton password;
  use the one `info` printed. `info` shows it again any time (stop Bridge
  with `pkill bridge` first, as in step 3).
- **`self-signed certificate` / `DEPTH_ZERO_SELF_SIGNED_CERT`** — the host
  isn't a `*.railway.internal` name (e.g. you used a raw IP). Use the
  private domain, or set `MAIL_TLS_INSECURE=true` on the web service if
  you're sure the host is private.
- **`wrong version number` or other TLS handshake errors** — remove
  `SMTP_SECURE=true` / `IMAP_SECURE=true`: Bridge doesn't do implicit TLS on
  these ports.
- **The admin's mail health shows an error starting `imap Sent:` (or
  `imap INBOX:`) about a missing mailbox** — that folder name is wrong.
  Bridge's names: `INBOX`, `Sent`, `Drafts`, `Archive`,
  `Spam`, `Trash`, `All Mail`, your folders as `Folders/<name>` and labels
  as `Labels/<name>`.
- **Replies from Proton don't show up** — check that you replied to the
  letter itself (so it carries In-Reply-To), from the address the site
  sends as, and that it is in Sent. A reply that only quotes the letter, or
  one sent from a different conversation with another subject, is ignored on
  purpose. Replies older than the poller's first look (30 days, or the
  oldest thread) aren't read.
- **Private host doesn't resolve, or only to IPv6** — environments created
  before 16 October 2025 have an IPv6-only private network, and the image
  forwards IPv4 only. `railway ssh` into the web service and run
  `getent ahosts proton-bridge.railway.internal`; if you only see IPv6,
  create a new environment for the two services.
- **`login` refuses the account** — Bridge needs a paid plan (step 0). A
  hardware security key can't be plugged into a Railway container: make
  sure your account also has an authenticator-app (TOTP) code to give it.
- **Bridge signed out** (after a Proton password change or a revoked
  session): sends fail (the visitor sees that it didn't go through and is
  offered their own mail app) and replies stop syncing, until you repeat
  step 3.

### Sending without Bridge (optional)

Proton also offers **SMTP submission** for custom-domain addresses on paid
plans: host `smtp.protonmail.ch`, port `587`, STARTTLS, username your
custom-domain address, password an **SMTP token** (Proton → Settings →
IMAP/SMTP → SMTP tokens → Generate; it's shown once, one token per
address). Setting `SMTP_HOST=smtp.protonmail.ch`, `SMTP_PORT=587` and that
token for `SMTP_USER`/`SMTP_PASS` sends without depending on Bridge
(certificates are then verified normally). Replies written in Proton still
reach the site only through Bridge's IMAP. This path hasn't been tested
with the site yet; Bridge for both is the tested setup.

### Security notes

- Bridge has no public address; only services in the same Railway
  environment can reach it, and only the web service has its password.
- The volume holds your Proton session (encrypted with a GPG key kept on
  the same volume). Anyone with access to the Railway project can reach
  it: keep 2FA on your Railway account.
- The Bridge password can send and read all your mail. Keep it only in the
  web service's variables and your password manager.

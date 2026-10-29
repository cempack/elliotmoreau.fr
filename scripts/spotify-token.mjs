#!/usr/bin/env node
/**
 * Get a fresh SPOTIFY_REFRESH_TOKEN for the site (Now playing, the menu
 * bar's music, top artists). Run it on your own computer, once:
 *
 *   node scripts/spotify-token.mjs
 *
 * It asks for the app's Client ID and Client secret (or reads
 * SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET from the environment), opens
 * Spotify's consent page in your browser, catches the answer on
 * http://127.0.0.1:8888/callback, trades it for tokens and prints the
 * refresh token. That redirect URI must be listed in the app's settings on
 * developer.spotify.com (Spotify only accepts 127.0.0.1, not localhost).
 *
 * No dependencies: Node 18 or newer.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, platform, env, exit } from "node:process";

const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// what src/lib/spotify.ts calls: currently-playing, recently-played, top artists
const SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-read-recently-played", "user-top-read"];

async function ask(rl, label, fallback) {
  if (fallback) return fallback.trim();
  const v = (await rl.question(label)).trim();
  if (!v) {
    console.error("Nothing entered, stopping.");
    exit(1);
  }
  return v;
}

function openBrowser(url) {
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  execFile(cmd, args, () => {});
}

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px/1.5 system-ui;background:#0d110f;color:#f4f2ea;display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:28rem;text-align:center"><h1 style="font-size:1.4rem">${title}</h1><p>${body}</p></div></body>`;

const rl = createInterface({ input: stdin, output: stdout });
console.log("\nSpotify refresh token for elliotmoreau.fr\n");
console.log(`Before you start: in developer.spotify.com → your app → Settings → Redirect URIs, add\n  ${REDIRECT}\nand save.\n`);
const clientId = await ask(rl, "Client ID: ", env.SPOTIFY_CLIENT_ID);
const clientSecret = await ask(rl, "Client secret: ", env.SPOTIFY_CLIENT_SECRET);
rl.close();

const state = randomBytes(16).toString("hex");
const authorize =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({ response_type: "code", client_id: clientId, scope: SCOPES.join(" "), redirect_uri: REDIRECT, state, show_dialog: "true" });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const done = (code, title, body) => {
    res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }).end(page(title, body));
    server.close();
  };
  if (url.searchParams.get("state") !== state) return done(400, "That didn't match", "The answer wasn't for this run. Start the script again.");
  const err = url.searchParams.get("error");
  if (err) {
    console.error(`\nSpotify said: ${err}`);
    return done(400, "Not allowed", `Spotify said: ${err}. Start the script again.`);
  }
  try {
    const tok = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") ?? "", redirect_uri: REDIRECT }),
    });
    const json = await tok.json();
    if (!tok.ok || !json.refresh_token) {
      console.error("\nThe token exchange failed:", json.error_description || json.error || tok.status);
      console.error("Check the Client ID and secret, and that the redirect URI is saved in the app's settings.");
      return done(500, "The exchange failed", "See the terminal for why.");
    }
    // prove it works: the last thing played
    let check = "";
    const recent = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", { headers: { Authorization: `Bearer ${json.access_token}` } });
    if (recent.ok) {
      const t = (await recent.json()).items?.[0]?.track;
      if (t) check = `${t.name} · ${t.artists?.map((a) => a.name).join(", ")}`;
    }
    console.log("\nDone." + (check ? ` Last played: ${check}` : ""));
    console.log("\nSPOTIFY_REFRESH_TOKEN=" + json.refresh_token);
    console.log("\nPut it in Coolify → the site → Environment Variables (with the same Client ID and secret), or from this folder:");
    console.log(
      `  railway variables --service web --set "SPOTIFY_CLIENT_ID=${clientId}" --set "SPOTIFY_CLIENT_SECRET=<your secret>" --set "SPOTIFY_REFRESH_TOKEN=${json.refresh_token}"\n`
    );
    done(200, "All set", "The refresh token is in your terminal. You can close this tab.");
  } catch (e) {
    console.error("\nSomething went wrong:", e instanceof Error ? e.message : e);
    done(500, "Something went wrong", "See the terminal.");
  }
});

server.on("error", (e) => {
  console.error(`\nCan't listen on ${REDIRECT}: ${e.message}. Is something else using port ${PORT}?`);
  exit(1);
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("\nOpening Spotify in your browser. If nothing opens, paste this into it:\n");
  console.log("  " + authorize + "\n");
  openBrowser(authorize);
});

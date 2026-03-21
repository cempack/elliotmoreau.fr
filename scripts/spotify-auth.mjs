#!/usr/bin/env node
/**
 * Spotify OAuth Helper — One-time setup script
 * 
 * Run this script to get a refresh token:
 *   node scripts/spotify-auth.mjs
 * 
 * It will:
 * 1. Start a local server on port 8888
 * 2. Open Spotify authorization in your browser
 * 3. After you approve, it exchanges the code for tokens
 * 4. Prints the SPOTIFY_REFRESH_TOKEN to add to your .env
 */

import { exec } from 'node:child_process';
import http from 'node:http';
import { URL, URLSearchParams } from 'node:url';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'f668624d470547b8bc6e582832802ad1';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'e9072581603941c1a79e2bfed096aa59';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-top-read user-read-recently-played user-read-currently-playing';

const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);

console.log('\n🎵 Spotify OAuth Setup\n');
console.log('Opening Spotify authorization in your browser...\n');

// Open browser
const url = authUrl.toString();
const cmd = process.platform === 'darwin' ? `open "${url}"` 
  : process.platform === 'win32' ? `start "${url}"` 
  : `xdg-open "${url}"`;
exec(cmd);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://localhost:8888`);
  
  if (reqUrl.pathname === '/callback') {
    const code = reqUrl.searchParams.get('code');
    
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Error: No code received</h1>');
      return;
    }

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const data = await tokenRes.json();

      if (data.refresh_token) {
        console.log('✅ Successfully obtained refresh token!\n');
        console.log('Add this to your .env file:\n');
        console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
          <body style="background:#131313;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <h1>✅ Success!</h1>
              <p>Check your terminal for the refresh token.</p>
              <p>You can close this window.</p>
            </div>
          </body>
          </html>
        `);
      } else {
        console.error('❌ Error:', data);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Error getting token</h1><pre>' + JSON.stringify(data, null, 2) + '</pre>');
      }
    } catch (err) {
      console.error('❌ Request failed:', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Request failed</h1>');
    }

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  }
});

server.listen(8888, () => {
  console.log('Waiting for Spotify callback on http://localhost:8888...\n');
});

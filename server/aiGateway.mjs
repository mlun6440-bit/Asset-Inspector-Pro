// Shared server-side helpers for the Gemini proxy (used by server.mjs and the Vite dev server).
//
// - Inspector check: the browser keeps its Firebase ID token in the `aip_id_token` cookie
//   (scoped to /api, SameSite=Strict). The token is verified with Google's Identity Toolkit
//   and the caller must hold the administrator-assigned `assetInspector` claim — the same
//   claim the Firestore/Storage rules require — so nobody else can spend the Gemini quota.
// - Live tokens: the Live (voice/camera) session uses a WebSocket that can't go through the
//   HTTP proxy, so the server mints a short-lived, single-use ephemeral token instead of
//   ever sending GEMINI_API_KEY to the browser.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const ID_TOKEN_COOKIE = 'aip_id_token';
const VERIFY_CACHE_MS = 5 * 60 * 1000;
const verifyCache = new Map(); // idToken -> { ok, expires }

// The Firebase *web* API key is public configuration (it ships in the client too).
function firebaseWebApiKey() {
  if (process.env.FIREBASE_WEB_API_KEY) return process.env.FIREBASE_WEB_API_KEY;
  try {
    const config = JSON.parse(readFileSync(path.join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'));
    return config.apiKey || '';
  } catch {
    return '';
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

async function isApprovedInspector(idToken) {
  const cached = verifyCache.get(idToken);
  if (cached && cached.expires > Date.now()) return cached.ok;

  const apiKey = firebaseWebApiKey();
  if (!apiKey) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  let ok = false;
  if (response.ok) {
    const data = await response.json();
    const user = data.users?.[0];
    try {
      ok = Boolean(user && JSON.parse(user.customAttributes || '{}').assetInspector === true);
    } catch {
      ok = false;
    }
  }
  if (verifyCache.size > 1000) verifyCache.clear();
  verifyCache.set(idToken, { ok, expires: Date.now() + VERIFY_CACHE_MS });
  return ok;
}

/**
 * Returns true when the request may use the AI endpoints. When it may not, a 401/403 has
 * already been written. `required: false` skips the check (local development only).
 */
export async function authorizeAiRequest(req, res, { required }) {
  if (!required) return true;
  const idToken = readCookie(req, ID_TOKEN_COOKIE);
  if (!idToken) {
    res.writeHead(401, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: { message: 'Sign-in required for AI features.' } }));
    return false;
  }
  if (!(await isApprovedInspector(idToken))) {
    res.writeHead(403, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: { message: 'Your account is not an approved inspector for AI features.' } }));
    return false;
  }
  return true;
}

/** Handles POST /api/live-token: mints a single-use ephemeral token locked to the Live model. */
export async function handleLiveToken(req, res, { apiKey }) {
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  if (!apiKey) {
    res.writeHead(503, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: { message: 'Live AI is not configured on the server (GEMINI_API_KEY missing).' } }));
    return;
  }
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const now = Date.now();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      liveConnectConstraints: { model: LIVE_MODEL },
      httpOptions: { apiVersion: 'v1alpha' },
    },
  });
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    .end(JSON.stringify({ token: token.name, model: LIVE_MODEL }));
}

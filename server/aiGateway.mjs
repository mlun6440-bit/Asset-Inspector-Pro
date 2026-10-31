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

// Returns the inspector's Firebase UID, or null when the token is invalid or lacks the claim.
async function approvedInspectorUid(idToken) {
  const cached = verifyCache.get(idToken);
  if (cached && cached.expires > Date.now()) return cached.uid;

  const apiKey = firebaseWebApiKey();
  if (!apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  let uid = null;
  if (response.ok) {
    const data = await response.json();
    const user = data.users?.[0];
    try {
      if (user && JSON.parse(user.customAttributes || '{}').assetInspector === true) uid = user.localId;
    } catch {
      uid = null;
    }
  }
  if (verifyCache.size > 1000) verifyCache.clear();
  verifyCache.set(idToken, { uid, expires: Date.now() + VERIFY_CACHE_MS });
  return uid;
}

// ---- Model allow-list -------------------------------------------------------------------
// Only the calls the app actually makes are forwarded with the server's key: generateContent /
// streamGenerateContent on the app's model. Other Gemini endpoints (files, tuning, caching,
// other — possibly more expensive — models) are refused.
const ALLOWED_MODELS = (process.env.GEMINI_ALLOWED_MODELS || 'gemini-3.7-flash').split(',').map(m => m.trim()).filter(Boolean);
const ALLOWED_METHODS = ['generateContent', 'streamGenerateContent'];

export function isAllowedGeminiPath(upstreamPath) {
  const pathOnly = upstreamPath.split('?')[0];
  const match = /^\/v1beta\/models\/([^/:]+):([A-Za-z]+)$/.exec(pathOnly);
  return Boolean(match && ALLOWED_MODELS.includes(match[1]) && ALLOWED_METHODS.includes(match[2]));
}

// ---- Rate limiting ----------------------------------------------------------------------
// In-memory fixed windows per inspector (or per IP when the inspector check is off). Enough for
// a single server process; use a shared store if the app is ever scaled out.
const LIMITS = {
  generate: [
    { windowMs: 60 * 1000, max: Number(process.env.AI_RATE_PER_MINUTE || 30) },
    { windowMs: 24 * 60 * 60 * 1000, max: Number(process.env.AI_RATE_PER_DAY || 1000) },
  ],
  liveToken: [
    { windowMs: 60 * 60 * 1000, max: Number(process.env.LIVE_TOKENS_PER_HOUR || 12) },
  ],
};
const rateWindows = new Map(); // `${kind}|${windowMs}|${identity}` -> { start, count }

/** Returns true when allowed; otherwise writes 429 with Retry-After. */
export function checkRateLimit(res, kind, identity) {
  const now = Date.now();
  for (const { windowMs, max } of LIMITS[kind]) {
    const key = `${kind}|${windowMs}|${identity}`;
    let entry = rateWindows.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      rateWindows.set(key, entry);
    }
    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(retryAfter) })
        .end(JSON.stringify({ error: { message: `AI usage limit reached. Try again in ${retryAfter} seconds.` } }));
      return false;
    }
  }
  for (const { windowMs } of LIMITS[kind]) rateWindows.get(`${kind}|${windowMs}|${identity}`).count += 1;
  if (rateWindows.size > 10000) {
    for (const [key, entry] of rateWindows) if (now - entry.start > 24 * 60 * 60 * 1000) rateWindows.delete(key);
  }
  return true;
}

function clientIp(req) {
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Returns the caller's identity (inspector UID, or `ip:...` when the check is off) when the request
 * may use the AI endpoints, or null after writing a 401/403. `required: false` skips the inspector
 * check (local development only).
 */
export async function authorizeAiRequest(req, res, { required }) {
  if (!required) return `ip:${clientIp(req)}`;
  const idToken = readCookie(req, ID_TOKEN_COOKIE);
  if (!idToken) {
    res.writeHead(401, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: { message: 'Sign-in required for AI features.' } }));
    return null;
  }
  const uid = await approvedInspectorUid(idToken);
  if (!uid) {
    res.writeHead(403, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: { message: 'Your account is not an approved inspector for AI features.' } }));
    return null;
  }
  return `uid:${uid}`;
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

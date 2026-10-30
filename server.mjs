// Production server for Asset Inspector Pro.
// - Serves the built app from ./dist
// - Proxies /api/gemini/* to the Gemini API, attaching GEMINI_API_KEY server-side
//   so the key never ships in browser code.
//
// Usage:  npm run build && GEMINI_API_KEY=... npm start
// Optional: PORT (default 3000), ALLOWED_ORIGIN (e.g. https://inspector.example.com)
//
// AI endpoints require a signed-in Firebase user holding the `assetInspector` claim
// (see server/aiGateway.mjs). GEMINI_PROXY_AUTH=off disables that check — local testing only.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeAiRequest, handleLiveToken } from './server/aiGateway.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const UPSTREAM = 'https://generativelanguage.googleapis.com';
const PROXY_PREFIX = '/api/gemini';
const ALLOWED_UPSTREAM_PATHS = [/^\/v1beta\//, /^\/upload\/v1beta\//];
const MAX_BODY_BYTES = 60 * 1024 * 1024; // room for several base64 photos
const REQUIRE_INSPECTOR = process.env.GEMINI_PROXY_AUTH !== 'off';

if (!API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY is not set — AI features will fail.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyGemini(req, res) {
  if (ALLOWED_ORIGIN && req.headers.origin && req.headers.origin !== ALLOWED_ORIGIN) {
    res.writeHead(403).end('Origin not allowed');
    return;
  }
  const upstreamPath = req.url.slice(PROXY_PREFIX.length) || '/';
  if (!ALLOWED_UPSTREAM_PATHS.some((re) => re.test(upstreamPath))) {
    res.writeHead(404).end('Not found');
    return;
  }
  if (!(await authorizeAiRequest(req, res, { required: REQUIRE_INSPECTOR }))) return;
  if (!API_KEY) {
    res.writeHead(503, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: { message: 'AI is not configured on the server (GEMINI_API_KEY missing).' } }));
    return;
  }

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const headers = {
    'content-type': req.headers['content-type'] || 'application/json',
    'x-goog-api-key': API_KEY, // replaces the browser's placeholder key
  };
  for (const h of ['x-goog-api-client', 'x-goog-upload-protocol', 'x-goog-upload-command', 'x-goog-upload-header-content-length', 'x-goog-upload-header-content-type']) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }

  const upstream = await fetch(UPSTREAM + upstreamPath, { method: req.method, headers, body });
  const outHeaders = {};
  upstream.headers.forEach((v, k) => {
    if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) outHeaders[k] = v;
  });
  res.writeHead(upstream.status, outHeaders);
  if (upstream.body) {
    for await (const chunk of upstream.body) res.write(chunk); // supports streaming responses
  }
  res.end();
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = path.normalize(path.join(DIST, urlPath));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(DIST, 'index.html'); // SPA fallback
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith(PROXY_PREFIX + '/')) await proxyGemini(req, res);
    else if (req.url === '/api/live-token') {
      if (ALLOWED_ORIGIN && req.headers.origin && req.headers.origin !== ALLOWED_ORIGIN) res.writeHead(403).end('Origin not allowed');
      else if (await authorizeAiRequest(req, res, { required: REQUIRE_INSPECTOR })) await handleLiveToken(req, res, { apiKey: API_KEY });
    }
    else await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(err.status || 502).end(err.status ? err.message : 'Upstream error');
    else res.end();
  }
}).listen(PORT, () => console.log(`Asset Inspector Pro on http://localhost:${PORT}`));

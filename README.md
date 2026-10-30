# Asset Inspector Pro

AI-assisted building inspection app: site and room navigation, photo-based asset recognition
(Gemini), condition and remaining-useful-life assessment, Smart Room Finder, and register export
(Excel, PDF, CSV, JSON). React 19 + Vite + TypeScript, with Firebase for sync and Google Maps for sites.

Project background and approval gates: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).
Firebase access rollout: [docs/security-rollout.md](docs/security-rollout.md).

## Run locally

Requires Node 20+ (`.nvmrc` pins 22).

```bash
npm ci
cp .env.example .env      # then set GEMINI_API_KEY (server-side only) and VITE_GOOGLE_MAPS_API_KEY
npm run dev               # http://localhost:3000 — Vite dev server with the /api/gemini proxy
```

Production-style run (serves `dist/` and the AI gateway from one Node process):

```bash
npm run build
GEMINI_API_KEY=... npm start   # http://localhost:3000
```

The Gemini key never reaches the browser. Browser code calls `/api/gemini` (proxied with the key
attached) and `/api/live-token` (single-use token for the Live voice/camera session). Both require
a Firebase user holding the `assetInspector` claim; see `.env.example` for the local-testing switch.

## Checks

```bash
npm run lint        # TypeScript
npm test            # unit tests (synthetic data only)
npm run test:rules  # Firestore/Storage rules in the Firebase emulators (needs Java)
npm run build
```

## Runtime internet dependencies

Tailwind CSS, SheetJS (Excel export), jsPDF and Material Icons load from public CDNs in
`index.html`. A corporate content-security policy that blocks those hosts will break styling and
export; bundle them from npm if that applies. The `aistudiocdn.com` importmap in `index.html` is only
used by Google AI Studio's preview; Vite bundles every import itself and ignores it.

# AI Agent OS - Project Instructions & Guidelines

You are the primary AI engineer for this workspace. This file defines the core architecture, style patterns, and our self-learning rules.

---

## 🚀 Strategic Architecture

- **Stack**: React 18+ (TSX), Vite, Tailwind CSS, Lucide Icons, Recharts for advanced business data visualization.
- **Cognitive Core**: Server-side Gemini 3.5 API for advanced corporate capital monitoring, CAPEX modeling, and multi-scenario forecasting.
- **Styling**: Modern, premium, high-contrast dark visual interface (deep slate canvas, indigo details, custom state badges, and soft grid lines). Avoid default layouts or generic templates.

---

## 🧠 Dynamic Self-Learning Loop (Boris Cherny Method)

This workspace runs a self-improving cognitive loop:

> **Core Directive**: When the user corrects you or you catch yourself making a mistake, before continuing your turn, you MUST add the lesson as a one-line rule under the **# LESSONS** section below so it never happens again.

---

## 📝 LESSONS

- **Deep Modules & Strict Boundaries**: Always isolate complex state side-effects into dedicated hooks (e.g. `usePresenceSession`) and enforce strict Zod schema validation (`services/schemas.ts`) on all incoming AI responses before mutating domain state.
- **Graph-First Memory & Cascade Risk (Karpathy Method)**: Compile unstructured inspection inputs, blueprints, and tickets directly into a persistent knowledge graph (`compileFacilityKnowledgeGraph`) and ground multi-hop cascade risk and chatbot reasoning strictly on topological graph edges instead of fuzzy document dumps.
- **Resilient AI Detection & Model Standards**: Always target supported Gemini model aliases (`gemini-4-hydrogen` for text/vision and `gemini-3.8-live` for Live API), parse all AI JSON outputs through `safeParseJson`, sanitize image Base64/SVG inputs safely, and provide deterministic fallback asset generation with graceful canvas cropping to prevent UI freezes or crashes during area audits.
- **Google Maps Platform Standards**: Ground all GIS features in `@vis.gl/react-google-maps` with required `mapId`, internal attribution ID (`gmp_mcp_codeassist_v1_aistudio`), and interactive pin-drag reverse geocoding with fallback to client-side localStorage and environment API keys.
- **Multimodal Video Walk & Temporal Grounding**: For continuous facility walkthroughs (GoPro, phone video, or YouTube feeds), sample chronological keyframes with off-screen canvas extraction, ground ISO 55000 asset detections in exact video timecodes (`mm:ss`) with 2D bounding boxes, and merge multi-view observations into deduplicated zone boundaries before committing to facility state.
- **Real-Time Context Telemetry for Cognitive Assistants**: Always inject reactive inspector screen state (`activeView`, `currentRoom`, `editingAsset`, and filtered risk aggregates) directly into the chatbot runtime context and UI telemetry banner with dynamic one-click prompts, eliminating user clarification loops when asking about the current screen or focused equipment.
- **Production Resilience & Iframe-Safe UX**: Wrap the root tree in `ErrorBoundary` + `NotificationProvider` (`useNotify`), never use blocking `alert`/`confirm`/`prompt`, sanitize Firestore document IDs and export filenames against `/` and special characters, and guard WebRTC/AudioContext/MediaRecorder lifecycles across browsers.

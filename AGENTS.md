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

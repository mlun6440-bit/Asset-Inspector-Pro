# Claude Code Instructions — Asset Inspector Pro
Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before designing any Microsoft/Fulcrum/SQL integration.

The project owner values practical leverage and measurable FM time savings. **Challenge incorrect assumptions directly** instead of automatically agreeing.

## Workflow
1. Inspect the repository and describe what's actually implemented before making architectural claims.
2. Use a plan-first, evidence-first approach. Clearly label verified code facts, user-reported context, hypotheses, and items awaiting IT approval.
3. Preserve the current React/TypeScript app. Do not refactor, migrate or deploy without a specific instruction.
4. Treat the target corporate SQL database and Fulcrum-to-SQL integration as **unverified** until Mike / IT confirms the topology, permissions, access interface and whether the feed is read-only.
5. Mirroring a schema does not create a SQL connection or grant write permission. No direct browser database credentials.
6. Never put client data, credentials, connection strings, confidential infrastructure details or raw inspection photographs into AI prompts or this repository without explicit organisational authorisation.
7. Prefer synthetic data and read-only metadata for exploratory mapping.
8. When asking Mike or IT, use concise plain language and explain why each answer matters; avoid leading with MCP jargon.
9. When evaluating Microsoft Copilot Code or Azure, check actual tenant licensing, connector availability, hosting, security and deployment prerequisites. Don't equate the coding environment with production hosting.
10. Keep feature progress and technical decisions updated in PROJECT_CONTEXT.md after reviewed, approved changes.

## First task when asked to resume
Audit the current React/TypeScript/Firebase app and prepare an **unimplemented** mapping/architecture proposal for a read-only corporate SQL proof of concept. Consult PROJECT_CONTEXT.md for deferred questions and approval gates.

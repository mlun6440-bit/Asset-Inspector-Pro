# Asset Inspector Pro — Project Handover and Decision Record
**Discussion date:** 29 October 2026 (Australia/Sydney)  
**Status:** Planning notes; not a verified system architecture or approved implementation.  
**Purpose:** Give Claude Code and other coding agents continuity about the user's goals, alternatives, uncertainties and questions for IT. This is a structured summary of a conversation, **not a verbatim chat transcript**.

## 1. Business goal
Reduce friction for facility managers conducting inspections and defect capture across large property portfolios. The specific bottleneck is identifying the correct building/floor/room among many records before logging a defect. Productivity savings, fewer duplicate entries and improved data quality are the outcomes to measure. The broader aspiration is for Asset Inspector Pro to serve as a superior inspection interface and, if later approved, potentially replace aspects of an existing inspection application.

## 2. Existing application and capabilities
- Product: Asset Inspector Pro; existing React + TypeScript code in this repository.
- Existing prototype backend: Firebase/Firestore and Firebase Storage; **not approved for storing the client's operational data**.
- Existing/projected capabilities: photo-assisted asset identification, condition assessment, defect capture and a Smart Room Finder.
- **Smart Room Finder status:** manual search/filter by floor, room/name/code/building has been implemented in an earlier phase; photo matching against historical room photographs is a proposed future feature, **not a currently verified production capability**.
- Preserve the working application and existing features. Verify the repository's current state before changing anything.

## 3. Proposed development and hosting path
- Explore Microsoft 365 Copilot Code as an AI-assisted way to work with the existing GitHub React/TypeScript repository, **subject to feature availability, licensing and IT approvals**.
- Copilot Code is a development capability; importing code into it does **not** itself deploy a production app or establish compliance with company data policy.
- Possible enterprise runtime: Microsoft-approved hosting and identity/API services, potentially Azure; no Azure access has yet been confirmed.
- Do not assume a new Azure SQL database is required. The user's preferred route is to **reuse an existing corporate SQL data environment if technically viable and authorised**.
- Do not send real client data, credentials, or internal topology to unapproved AI services or development environments.

## 4. Critical distinction clarified in the discussion
The user's central proposal is **schema / interface compatibility, not bulk copying all data from Fulcrum into a new database**:
1. Study the existing inspection form and asset-register business data relationships through an authorised Fulcrum integration/MCP, if available.
2. Study the **actual company SQL schema**, built or maintained by the relevant internal data owner, through approved access.
3. Adapt Asset Inspector Pro's domain models and mapping layer so its site/building/floor/room/asset/inspection/defect entities correspond to verified SQL entities.
4. Build a secure application service to read and, **only where permitted and supported**, write data through the approved interface.

The user explicitly wants to avoid creating redundant databases, unnecessary migrations and duplicate systems of record.

**Important correction:** Matching field names or data structures does not cause SQL to recognise an application or automatically permit communication. A real integration needs authentication, network access, API/query contracts, authorisation, record keys, validation and operational support.

## 5. Facts versus unverified assumptions
**Known from the conversation (not independently audited):**
- The current client inspection workflow uses Fulcrum.
- The organisation has a SQL-based feed/environment receiving Fulcrum-origin data.
- The user has Claude Code working with an MCP connection to Fulcrum.
- The user currently lacks confirmed Microsoft 365 Copilot Code and Azure access.
- They want to remain within an employer-approved Microsoft ecosystem for real client data.

**Unverified:**
- Whether Fulcrum-to-SQL integration is a scheduled ETL, API, webhook, vendor connection, or another method.
- Whether the corporate SQL data is a read-only reporting replica, an operational system, or a combination.
- Whether it contains all required relationships, inspection history, forms, photos and audit metadata.
- Whether it permits secure writes by another application and whether those writes would be respected by downstream consumers.
- Whether the specific Copilot Code environment exposes a Fulcrum MCP integration and which tools/permissions it supports.
- Whether Azure or another approved app runtime is available.

Do not turn these assumptions into confident statements in implementation plans.

## 6. MCP and coding agent boundaries
A Fulcrum MCP integration may reveal inspection-app schemas, fields, records and possibly configured integration endpoints depending on granted tool permissions. It does **not** necessarily reveal the mechanics of external services that transfer data to corporate SQL.

Claude Code can analyse and implement integrations, but **should not be used as permanent production middleware** for routine database transactions. Build conventional authenticated services; reserve AI for tasks that need inference.

Initial investigation should be read-only and, where possible, use metadata/synthetic examples rather than live client records.

## 7. First practical next step — conversation with Mike / IT
The user chose to defer technical investigation and start with a simple, nontechnical question for the internal data owner:

> “I'm building a smarter inspection app but want to reuse what we already have. Can you show me how Fulcrum's inspection data gets into the SQL database, and whether another app could use that same path?”

Questions to follow up **only after** that discussion:
- Is the SQL source an operational database or a reporting copy, and what is the refresh interval?
- Who owns the schema, credentials, access policies, and integration pipeline?
- Is there a supported service/API or integration contract for an additional inspection frontend?
- How are inserts/updates handled? Is the integration one-way? How are conflicts, audit trails and deletions handled?
- Are photographs and historical inspection records accessible through the same approved pathway?
- Which Microsoft application-hosting, Entra ID, API and data-storage services can IT approve?
- Are there client contractual, privacy, licensing, cybersecurity or change-management prerequisites?

## 8. Suggested implementation stages (provisional, subject to IT)
**Stage A — Documentation only:** Review codebase and current domain models; document functional requirements and candidate mappings. No client-data copying or production changes.

**Stage B — Read-only proof of concept:** With written authorisation, query an approved test or read-only view for one building. Confirm room / asset lookup and record mapping against controlled test cases.

**Stage C — Controlled defect submission:** Design an approved transaction path; verify validation, provenance, duplicate suppression, security, audit logging, attachment handling and failure/retry semantics. Do not write into a reporting replica merely because it is SQL.

**Stage D — Pilot:** Small FM cohort, compare time to locate a room and submit a defect against current workflow, check completeness and data quality, document rollback.

**Stage E — Replacement decision:** Only after business value, integration reliability, offline/mobile workflow, security review, data ownership, operational support and client approval are demonstrated.

## 9. Engineering constraints and guardrails
- Preserve original identifiers and lineage; do not invent asset IDs or condition/RUL evidence.
- Distinguish existing code, planned features, hypotheses and approvals.
- Do not expose connection strings, credentials, internal network diagrams or live client records in GitHub documentation or prompt logs.
- Do not assume company data can move into Firebase or an unapproved AI platform.
- Do not overwrite existing application code or push deployment changes as part of documentation work.
- Confirm read/write permissions separately; use secure API mediation rather than direct browser-to-SQL credentials.
- Prefer an adapter/data-access layer so the app's domain model is not tightly coupled to raw reporting tables.
- Be willing to challenge the user's assumptions and recommend the simpler architecture when evidence supports it.

## 10. Immediate handover to Claude Code
Read this file and the current repo before proposing a migration. Produce:
1. An inventory of implemented app features, Firebase dependencies, and existing data models, explicitly separating observed code from conversation assumptions.
2. A draft entity-and-field mapping worksheet for Site → Building → Floor → Room → Asset → Inspection → Defect; mark unknown SQL counterparts as **TBD**.
3. A concise IT questions list based on section 7.
4. A staged, read-only-first prototype plan with measurable success criteria and explicit blockers.

**Do not** access client records, modify production data, perform a bulk migration, or replace Firebase without a separate authorised implementation request.

## 11. Migration readiness — status and decisions (30 October 2026)
**Status:** implemented on branch `claude/laughing-euler-9bd59w` (PR #2), awaiting owner review. Not merged or deployed.

**Consolidated fixes (verified code facts):**
- PRs #1, #2 and #4 combined into one branch. #1 and #4 are superseded once #2 merges.
- **Data integrity:**
  - No fabricated AI data: no placeholder assets, invented RUL or CAPEX, forecast multipliers, or default condition/risk/cost/RUL.
  - Values the AI omits stay blank, show as "Not assessed", and are listed in the audit trail.
  - Existing asset and room IDs are never changed. Model-supplied IDs are only accepted when they match an existing asset in the same room.
  - Re-inspection only proposes condition/risk/RUL and keeps the inspector's record.
- **Review flags:** every export (Excel, CSV, PDF, JSON) includes Asset ID, Source (AI/Manual) and Review Status. AI findings read "AI – needs review" until verified.
- **Persistence:**
  - Failed cloud writes stay queued for retry.
  - Queued local drafts are not overwritten by the cloud copy.
  - Autosave persists committed React state and runs saves in order.
- **Security:**
  - Firestore and Storage require the administrator-assigned `assetInspector` claim (see `docs/security-rollout.md`).
  - The Gemini key is server-side only (`/api/gemini` proxy; Live voice/camera uses single-use ephemeral tokens from `/api/live-token`).
  - The AI gateway requires the same inspector claim.
- **Portability:** the app runs outside AI Studio with Node 20+ (`npm ci`, `npm run dev` / `npm start`). See README.md.
- **Tests:** vitest unit tests with synthetic data, plus Firebase emulator rules tests (`npm run test:rules`).

**Known remaining items (deliberately not changed):**
- Assets deleted locally are not deleted from Firestore. Changing that would make sync destructive, so it needs an owner decision.
- Tailwind, SheetJS, jsPDF and Material Icons still load from public CDNs. A corporate content-security policy may block them; they can be moved to npm if so.
- The Health Dashboard counts assets with no condition as "Average" when grouping.
- The inspection ID is still derived from the site name, so renaming a site creates a new cloud record.

## 12. Microsoft integration assessment (documentation only; nothing connected)
Sources were checked through web search in October 2026. Some Microsoft pages could not be opened directly, so treat licensing details as **unverified** until IT confirms them for the tenant.

- **Copilot Code** (Microsoft Frontier preview; rollout from 21 Oct 2026):
  - It is an AI app-building tab in the Microsoft Copilot app.
  - It can clone a GitHub repo once an admin enables GitHub access.
  - It has cloud and local project modes; local mode needs admin enablement.
  - Requires an M365 Copilot licence plus Copilot Credits.
  - **Unverified:** whether its cloud mode can run `npm ci`/Vite and reach Google APIs.
  - Treat it as an optional development environment, not a hosting decision.
- **Copilot Managed Runtime (hosting):**
  - Connector-based (`@microsoft/managed-apps`), billed at 0.1 Copilot Credits per API call.
  - Running this app there unchanged (Firebase, Gemini and Maps called directly) is unlikely to work without custom connectors. Not recommended for the first step.
- **Power Apps code apps:**
  - Can host React/Vite apps with Entra sign-in.
  - Every user needs Power Apps Premium, and Dataverse is required.
  - The content-security policy blocks outbound calls unless an admin allow-lists domains.
  - Desktop browsers only, which conflicts with mobile field inspections.
- **Lowest-friction development options for the code as it stands:**
  - GitHub Copilot coding agent or Codespaces, which run `npm ci` in a configurable environment.
  - Copilot Code once the tenant has it.
- **Entra ID:**
  - Feasible via MSAL.js (auth code + PKCE, SPA app registration) behind the existing `firebaseService` auth boundary.
  - The `assetInspector` claim maps to an Entra app role or group.
  - Needs an IT app registration.
- **SharePoint Lists:**
  - Suitable for small lookup lists (sites, rooms).
  - Each list holds up to 30 million items, but queries over 5,000 items need indexed, filtered columns.
  - Not suitable for photos or high-volume asset history.
- **Dataverse:** a strong fit for a governed system of record. Needs Premium licences and capacity.
- **Power Automate:** good for notifications and approvals. The HTTP action and other premium connectors need paid licences; don't use it as the main data path.
- **Copilot Studio:** agents are billed in Copilot Credits. Useful later for Q&A over *approved* data. How an agent would call into the app is unverified.
- **Hosting:** Azure Static Web Apps (Free or Standard tier) plus a small API for the AI gateway is the closest equivalent to today's `server.mjs`.

**Recommended next step:** before any Microsoft integration, put a thin data-access interface in front of `firebaseService`. A read-only SQL/Dataverse adapter can then be added for the Stage B proof of concept (section 8) without touching the UI. No integration should be built until IT answers the section 7 questions.

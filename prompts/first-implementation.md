# AGOS AI Implementation Playbook

Version: v1.2
Project: AGOS (React Native + Expo Router + Supabase)
Primary references: `prompts/product.md`, `design/on-the-go-mode.mermaid`, `design/donation.mermaid`, `ui/ui-guidelines.md`

---

## 0) Model Comparison and Assignment

Compared models: GPT-5.3 Codex, Opus 4.6, Claude 3.7 Sonnet, Gemini 3.0 Pro, Haiku 4.5.

### Quick comparison (AGOS MVP context)

| Model             | Coding reliability | Architecture/planning | UI/UX translation | Speed/cost efficiency | Recommended usage                                     |
| ----------------- | ------------------ | --------------------- | ----------------- | --------------------- | ----------------------------------------------------- |
| GPT-5.3 Codex     | Excellent          | Excellent             | Very good         | Medium                | Primary orchestrator and integration-heavy tasks      |
| Opus 4.6          | Excellent          | Very good             | Good              | Lower efficiency      | Complex feature implementation and backend logic      |
| Claude 3.7 Sonnet | Very good          | Very good             | Good              | Medium                | Alert logic, flows, and strong second reviewer        |
| Gemini 3.0 Pro    | Good               | Good                  | Excellent         | Medium                | UI system, layout fidelity, and design interpretation |
| Haiku 4.5         | Good               | Fair                  | Fair              | High efficiency       | Fast QA passes, checklists, and regression sweeps     |

Best overall for this playbook: **GPT-5.3 Codex** (most consistent across planning, coding, and integration).

Use these model assignments in Cursor:

1. **Orchestrator / Integrator**
   - Model: **GPT-5.3 Codex**
   - Responsibility: planning, task decomposition, conflict resolution, final integration reviews.
2. **UI/UX + Visual System Agent**
   - Model: **Gemini 3.0 Pro**
   - Responsibility: translating AGOS design language into components, layout consistency, severity UI.
3. **React Native Feature Agent + Backend + Data + Logic Agent**
   - Model: **Opus 4.6** (fallback: Claude 3.7 Sonnet)
   - Responsibility: route/screen implementation, hooks, state wiring, performance-safe component architecture.
   - Responsibility: Supabase schema/RLS/Edge/Functions/realtime/event flows.
4. **QA/Validation Agent**
   - Model: **Haiku 4.5** (fallback: Claude 3.7 Sonnet)
   - Responsibility: end-to-end acceptance checks, UX/flow compliance, regressions vs MVP scope.

## 1) MVP Scope Lock

In-scope MVP capabilities (must ship):

- Barangay-specific real-time flood alerts (`Watch / Warning / Danger`)
- Street-level flood map with community depth reporting
- Evacuation center finder + route guidance
- Offline fallback mode (cached data + sync-on-reconnect)
- SMS continuity fallback
- Rule-based evacuation decision logic
- Household preparedness checklist
- Baseline digital inclusion behavior (Flood Buddy + SMS relay patterns)
- Trash and pollution reporting (MVP functional version)
- Multilingual voice layer is limited in MVP to Tagalog + one regional language

### Explicitly deferred (Phase 2)

- Full donation claim/payment release flow
- Full LGU admin portal capabilities
- Full multilingual coverage across all Philippine regional languages
- Post-flood regeneration dashboards and institutional integrations
- ML-based evacuation decision model
- PhilAWARE data-sharing integration
- Media/NGO API products

Donation and relief flow from `design/donation.mermaid` should be designed now as contracts/UI stubs, but not shipped as active MVP production flow unless scope is re-opened.

Must-not-ship checks for MVP release:

- Evacuation center capacity must not be presented as a reliable live metric.
- Donation claim/payment fulfillment must remain hidden behind gated stubs.
- Broad multilingual rollout (beyond Tagalog + one regional language) must remain disabled.
- Critical user journeys must not ship without offline or SMS fallback.

---

## 2) Global Engineering Rules

- Stack remains: Expo Router + React Native + Supabase.
- Use feature-first architecture under `src/features/*`.
- No direct Supabase calls in presentational components.
- Enforce service/repository boundaries for all data access.
- Filipino-first emergency copy for critical alerts and CTAs.
- Severity semantics must always use text + icon + color.
- Keep report action path fast and low-friction.
- Support connectivity degradation without dead-end screens.

---

## 3) UX Flow Requirements from Mermaid Sources

### From `design/on-the-go-mode.mermaid`

Online path must support:

- App open -> permissions -> connectivity check
- Home alert decision (no alert: map browse, alert: severity + evacuation decision)
- Map actions: flood report, clogged drain report, preparedness
- Evacuation route and arrival flow
- Post-flood branching to facilities and relief/donation continuation

Offline path must support:

- Automatic offline mode activation
- Cached map and cached evacuation center access
- Local storage for flood and drain reports
- Explicit sync status message and reconnect loop

### From `design/donation.mermaid`

Donation/relief flow contracts to preserve:

- OTP verification by mobile number
- Household identity via address + barangay
- Family linkage vs create-new-family branching
- One-claim-per-family enforcement
- Donation path and claim path as separate outcomes

For MVP:

- keep as gated module and schema-ready contracts;
- do not expose full payment and full claim fulfillment as production-critical flow.

---

## 4) UI System Requirements

- Dark mode only for MVP.
- Severity color mapping is fixed:
  - MONITOR `#3B82F6`
  - PREPARE `#F59E0B`
  - LEAVE `#F97316`
  - EVACUATE `#EF4444`
- Primary CTA: square corners (0 radius), high-contrast emphasis.
- Typography: Outfit for headings, DM Sans for body.
- Minimum functional text size: 15px.
- Single primary action per alert state.
- Alert card remains dominant home component.

---

## 5) Target App Structure

Routes:

- `app/(tabs)/home.tsx`
- `app/(tabs)/map.tsx`
- `app/(tabs)/centers.tsx`
- `app/(tabs)/report.tsx`
- `app/alert/[id].tsx`
- `app/center/[id].tsx`
- `app/settings/index.tsx`
- `app/relief/index.tsx` (MVP-gated stub)
- `app/donation/index.tsx` (MVP-gated stub)

Core folders:

- `src/design/` (tokens, typography, spacing)
- `src/features/alerts/`
- `src/features/map/`
- `src/features/centers/`
- `src/features/reports/`
- `src/features/offline/`
- `src/features/preparedness/`
- `src/features/relief/` (contracts + stubs)
- `src/services/` (supabase/maps/weather/tts/sms adapters)
- `src/store/` (app state slices)
- `src/types/` (domain contracts)

---

## 6) Agent Definitions

### Agent A — UI Foundation Agent

Scope:

- Build tokens/theme primitives and shell screens.
- Enforce alert hierarchy, severity visuals, and emergency CTA consistency.
- Implement online/offline UX states from on-the-go flow.

Deliverables:

- Shared UI library + route shell + emergency state components.

Inputs required:

- `src/design/*` token baseline and typography contracts.
- Severity copy mapping and emergency CTA hierarchy from this playbook.
- Route list in section 5 and scope lock in section 1.

Outputs produced:

- Reusable design tokens/components with dark-mode-only behavior.
- Route shell placeholders with online/offline empty/loading/error states.
- Common severity card and CTA primitives for all downstream agents.

Blocks/unblocks:

- Unblocks Agent B/C/D by finalizing shared UI and state containers.
- Blocked until stack-level scaffolding and environment wiring are in place.

### Agent B — Map + Reports Agent

Scope:

- Street-level map with pin rendering and state legends.
- Flood report flow and clogged drain report flow.
- Pending vs confirmed state treatment on map.
- Offline local queue + reconnect sync.

Deliverables:

- End-to-end map/report behavior including offline storage and sync.

Inputs required:

- Agent A shared map shell and state components.
- Technical blueprint prerequisites: geospatial tables, RLS, and queue contract.
- Report taxonomies (flood depth and drain/trash report classes).

Outputs produced:

- Online report submission + offline queue + reconnect sync flows.
- Map legend with pending/confirmed semantics and local confidence treatment.
- Report confirmation logic wired to **3 reports / 200m** where applicable.

Blocks/unblocks:

- Blocked by schema/RLS/geospatial prerequisites and shared UI foundation.
- Unblocks Agent C/D by providing map/report state and queue integration points.

### Agent C — Alerts + Decision Engine Agent

Scope:

- Alert ingestion + realtime updates + fallback polling.
- Rule-based decision state rendering and CTA routing.
- Push notification integration and optional audio/TTS behavior.
- Permission re-check and degraded-mode safety messaging.

Deliverables:

- Alert-to-action pipeline with clear decision UI and safe fallbacks.

Inputs required:

- Alerts schema + realtime channels + polling fallback contract.
- Agent A severity UI primitives and CTA route contracts.
- Agent B report confidence feed for decision context.

Outputs produced:

- Barangay-targeted alert stream with severity presentation and push behavior.
- Rule-based recommendation UI with transparent rationale and user-confirmed actions.
- Resilient alert transport (realtime first, polling fallback) with safety messaging.

Blocks/unblocks:

- Blocked by alert ingestion contracts and notification permission baseline.
- Unblocks Agent D and QA by emitting stable alert/decision states.

### Agent D — Centers + Routing + SMS Agent

Scope:

- Center list/detail and route handoff.
- Cached route fallback for offline usage.
- SMS fallback dispatch abstraction and template integration.
- Post-flood facilities lookup path.

Deliverables:

- Reliable center/routing experience and fallback communication path.

Inputs required:

- Center data model, route adapter contracts, and cached storage interfaces.
- Agent C decision-state outputs and high-severity trigger events.
- Offline queue/sync primitives from Agent B.

Outputs produced:

- Center discovery/detail + route handoff with uncertainty messaging.
- Offline last-known route and cached center list behavior.
- SMS fallback abstraction and templates for high-severity continuity events.

Blocks/unblocks:

- Blocked by center data quality, route adapter contract, and alert severity events.
- Unblocks final QA for evacuation, routing, and continuity acceptance tests.

### Agent E — Relief/Donation Contract Agent (Phase 2 guarded)

Scope:

- Implement OTP/address/family-link data contracts from donation flow.
- Add claim-eligibility and one-claim-per-family validation service.
- Build MVP-hidden stubs for future donation/claim screens.

Deliverables:

- Schema and API contract readiness without violating MVP scope lock.

Inputs required:

- `design/donation.mermaid` flow contracts and identity constraints.
- Scope-lock guardrails requiring hidden, non-production surface.

Outputs produced:

- Schema contracts (`family_records`, `relief_claims`, `donations`, `otp_sessions`) and service interfaces.
- UI stubs flagged as non-production and excluded from default navigation.
- One-claim-per-family constraints at schema/service layer.

Blocks/unblocks:

- Must never block MVP release path.
- Runs in parallel as non-blocking workstream with strict feature gating.

### Agent F — QA Gate Agent

Scope:

- Validate MVP compliance, accessibility, offline resilience, and safety semantics.
- Verify Mermaid flow parity for online and offline branches.
- Confirm deferred modules remain gated.

Deliverables:

- Go/No-Go report with severity-tagged findings.

Inputs required:

- Completion artifacts from Agents A-D and gated artifacts from Agent E.
- Definition-of-done checklist tags in section 9.

Outputs produced:

- Evidence-based Go/No-Go report mapped to `[MVP-*]` criteria.
- Regression list, unresolved risks, and release recommendation.

Blocks/unblocks:

- Blocks release when critical safety/offline/scope criteria fail.
- Unblocks release only when all critical MVP tags pass.

---

## 7) Technical Blueprint (Supabase-Centered)

### Phase gates and prerequisites (must pass before feature coding)

1. Schema readiness gate:
   - MVP tables exist with migration history and seed fixtures.
   - Phase-2 tables are schema-only and inaccessible from MVP navigation.
2. Policy and security gate:
   - RLS policies defined for user and role contexts.
   - No anonymous unrestricted writes to safety-critical tables.
3. Geospatial and validation gate:
   - Geospatial indexes/functions available for proximity lookups.
   - Confirmation threshold support for **3 reports / 200m** implemented.
4. Sync and transport gate:
   - Realtime channels defined for alerts/reports/centers.
   - Fallback polling contract and offline queue schema finalized.

### Data model (Supabase)

Required MVP tables:

- `users`
- `flood_reports`
- `alerts`
- `evac_centers`
- `registered_buddies`
- `flood_zones`
- `offline_sync_queue` (client sync coordination)

Phase-2-ready tables (schema only in MVP, optional):

- `family_records`
- `relief_claims`
- `donations`
- `otp_sessions`

Must-have controls:

- RLS policies by role and access context.
- Geospatial query support for proximity checks.
- Consensus enforcement for flood confirmation logic: **3 reports / 200m**.
- One-claim-per-family rule constraints for relief contracts.

### Backend execution (after prerequisites)

- Supabase Edge Function for rule-based evacuation decision cadence.
- Realtime subscriptions:
  - alerts updates
  - report inserts and confirmations
  - evacuation center status updates
- Fallback polling when realtime connection is unstable.
- SMS dispatch service abstraction for offline critical notices.

### Client behavior (after prerequisites)

- Cache latest alert, centers, last-known route, and emergency instructions.
- Explicit `last updated` and `offline` indicators.
- No blank-state failures in map, report, or center flows.
- Queue write actions locally and sync on reconnect.
- Route and center guidance must include uncertainty language (best available).

---

## 8) Delivery Phases (48h MVP, dependency-gated)

Phase 1 (0-4h) — Foundation and scope lock:

- Entry criteria:
  - Section 1 scope lock accepted and deferred list frozen.
- Work:
  - scaffolding, route shell, theme system, env wiring, permission baseline
- Exit criteria:
  - shared UI shell and route placeholders compile without feature wiring
  - MVP gating flags in place for donation/relief stubs
  - no blocked dependencies for schema and policy setup

Phase 2 (4-12h) — Data contracts and platform prerequisites:

- Entry criteria:
  - Phase 1 exit criteria complete
- Work:
  - MVP schema migrations, RLS policies, geospatial support, realtime channel contracts
  - offline queue contract and polling fallback interfaces
- Exit criteria:
  - schema/policy/geospatial/sync prerequisite gates in section 7 are green
  - report confirmation threshold and role boundaries testable in isolation

Phase 3 (12-24h) — Map + reports + offline queue behavior:

- Entry criteria:
  - Phase 2 prerequisite gates are green
- Work:
  - map rendering + flood/drain report flow + queueing + pending/confirmed rendering
- Exit criteria:
  - report submit works online and offline
  - reconnect sync and status messaging are visible and deterministic
  - **3 reports / 200m** confirmation behavior wired where applicable

Phase 4 (24-34h) — Alerts + decision engine pipeline:

- Entry criteria:
  - Phase 3 report state outputs available to alert logic
- Work:
  - alert model + decision UI + realtime/fallback polling + push behavior
- Exit criteria:
  - barangay-level alert severity reliably routes to one primary CTA
  - degraded connectivity still produces user-facing safety messaging

Phase 5 (34-42h) — Centers + routing + SMS continuity:

- Entry criteria:
  - Phase 4 alert/decision outputs stable
- Work:
  - centers + route + offline cache behavior + SMS fallback path
- Exit criteria:
  - users can discover centers, view route guidance, and access last-known route offline
  - SMS fallback triggers for high-severity continuity scenarios
  - no center capacity metric is exposed as definitive

Phase 6 (42-48h) — Preparedness, QA gate, release check:

- Entry criteria:
  - Phases 1-5 complete with no unresolved critical defects
- Work:
  - preparedness module polish + offline QA + scope-gate validation + demo data
- Exit criteria:
  - section 9 checklist passes with evidence
  - release recommendation from QA Gate Agent recorded as Go/No-Go

Parallel (non-blocking, gated):

- donation/relief schema contracts and screen stubs only
- this stream must never block MVP critical-path release

---

## 9) Definition of Done (MVP Exit Criteria)

Alert and decision journey:

- `[MVP-ALERT-01]` Barangay-level alert appears and triggers the correct severity UI + single primary CTA.
- `[MVP-ALERT-02]` Alert transport supports realtime-first with polling fallback and user-visible degraded-mode messaging.
- `[MVP-ALERT-03]` Decision recommendation is transparent and requires user confirmation for life-safety actions.

Report and validation journey:

- `[MVP-REPORT-01]` Flood and drain/trash reports can be submitted online and queued offline.
- `[MVP-REPORT-02]` Pending vs confirmed report states are visible on-map and after reconnect sync.
- `[MVP-REPORT-03]` Confirmation logic uses **3 reports / 200m** where gating applies.

Evacuation and continuity journey:

- `[MVP-EVAC-01]` User can discover nearby centers and access route guidance with uncertainty language.
- `[MVP-EVAC-02]` Offline mode exposes cached map, centers, emergency instructions, and sync messaging.
- `[MVP-EVAC-03]` SMS fallback path exists for high-severity continuity events.

Preparedness and inclusion journey:

- `[MVP-PREP-01]` Preparedness checklist is usable and complete.
- `[MVP-INCLUDE-01]` Flood Buddy + SMS relay baseline behavior is available in MVP.

Scope and release guardrail journey:

- `[MVP-SCOPE-01]` Donation/relief production flow is not exposed in MVP release surface.
- `[MVP-SCOPE-02]` Evacuation center capacity is not presented as a definitive live metric.
- `[MVP-SCOPE-03]` Multilingual release remains limited to Tagalog + one regional language.

---

## 10) Orchestrator Prompt (Use in Cursor)

"You are the AGOS integration orchestrator. Enforce MVP scope from `prompts/product.md`, implementation rules from this playbook, and flow behavior from `design/on-the-go-mode.mermaid` and `design/donation.mermaid`. Keep the stack as React Native + Expo Router + Supabase. Prioritize emergency clarity, offline resilience, and barangay-specific decision support. Implement donation/relief only as gated contracts and stubs unless scope is explicitly expanded."

---

## 11) Agent Prompt Base Template

"You are [AGENT_NAME] for AGOS.
Your scope is limited to: [SCOPE].
Follow: `prompts/product.md`, `prompts/first-implementation.md`, `design/on-the-go-mode.mermaid`, `design/donation.mermaid`, and `ui/ui-guidelines.md`.
Do not introduce non-MVP production features.
Preserve Filipino-first emergency UX and severity semantics.
Keep stack constraints: React Native + Expo Router + Supabase.
Output:

1. files touched
2. key decisions
3. risks
4. test checklist
5. integration notes for other agents."

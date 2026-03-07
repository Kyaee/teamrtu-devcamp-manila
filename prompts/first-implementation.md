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

- Barangay-specific real-time flood alerts (`Watch / Warning / Danger`)
- Street-level flood map with community depth reporting
- Evacuation center finder + route guidance
- Offline fallback mode (cached data + sync-on-reconnect)
- SMS continuity fallback
- Rule-based evacuation decision logic
- Household preparedness checklist
- Baseline digital inclusion behavior (Flood Buddy + SMS relay patterns)

### Explicitly deferred (Phase 2)

- Full donation claim/payment release flow
- Full LGU admin portal capabilities
- Full multilingual coverage across all Philippine regional languages
- Post-flood regeneration dashboards and institutional integrations
- ML-based evacuation decision model

Donation and relief flow from `design/donation.mermaid` should be designed now as contracts/UI stubs, but not shipped as active MVP production flow unless scope is re-opened.

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

### Agent B — Map + Reports Agent

Scope:

- Street-level map with pin rendering and state legends.
- Flood report flow and clogged drain report flow.
- Pending vs confirmed state treatment on map.
- Offline local queue + reconnect sync.

Deliverables:

- End-to-end map/report behavior including offline storage and sync.

### Agent C — Alerts + Decision Engine Agent

Scope:

- Alert ingestion + realtime updates + fallback polling.
- Rule-based decision state rendering and CTA routing.
- Push notification integration and optional audio/TTS behavior.
- Permission re-check and degraded-mode safety messaging.

Deliverables:

- Alert-to-action pipeline with clear decision UI and safe fallbacks.

### Agent D — Centers + Routing + SMS Agent

Scope:

- Center list/detail and route handoff.
- Cached route fallback for offline usage.
- SMS fallback dispatch abstraction and template integration.
- Post-flood facilities lookup path.

Deliverables:

- Reliable center/routing experience and fallback communication path.

### Agent E — Relief/Donation Contract Agent (Phase 2 guarded)

Scope:

- Implement OTP/address/family-link data contracts from donation flow.
- Add claim-eligibility and one-claim-per-family validation service.
- Build MVP-hidden stubs for future donation/claim screens.

Deliverables:

- Schema and API contract readiness without violating MVP scope lock.

### Agent F — QA Gate Agent

Scope:

- Validate MVP compliance, accessibility, offline resilience, and safety semantics.
- Verify Mermaid flow parity for online and offline branches.
- Confirm deferred modules remain gated.

Deliverables:

- Go/No-Go report with severity-tagged findings.

---

## 7) Technical Blueprint (Supabase-Centered)

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

### Backend execution

- Supabase Edge Function for rule-based evacuation decision cadence.
- Realtime subscriptions:
  - alerts updates
  - report inserts and confirmations
  - evacuation center status updates
- Fallback polling when realtime connection is unstable.
- SMS dispatch service abstraction for offline critical notices.

### Client behavior

- Cache latest alert, centers, last-known route, and emergency instructions.
- Explicit `last updated` and `offline` indicators.
- No blank-state failures in map, report, or center flows.
- Queue write actions locally and sync on reconnect.

---

## 8) Delivery Phases (48h MVP)

Phase 1 (0-4h):

- scaffolding, route shell, theme system, env wiring, permission baseline

Phase 2 (4-16h):

- map + flood/drain report flow + queueing + pending/confirmed rendering

Phase 3 (16-28h):

- alert model + decision UI + realtime/fallback polling + push behavior

Phase 4 (28-40h):

- centers + route + offline cache behavior + SMS fallback path

Phase 5 (40-48h):

- preparedness module polish + offline QA + scope-gate validation + demo data

Parallel (non-blocking, gated):

- donation/relief schema contracts and screen stubs only

---

## 9) Definition of Done (MVP Exit Criteria)

- Barangay-level alert appears and triggers correct severity UI and CTA.
- Flood and drain reports can be submitted online and queued offline.
- Confirmation logic uses **3 reports / 200m** where gating applies.
- User can discover nearby centers and access route guidance.
- Offline mode exposes cached map/centers/instructions and sync messaging.
- SMS fallback path exists for high-severity continuity events.
- Preparedness checklist is usable and complete.
- Donation/relief production flow is not exposed in MVP release surface.

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

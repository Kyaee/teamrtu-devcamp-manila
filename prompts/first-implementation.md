# AGOS AI Implementation Playbook

Version: v1.1
Project: AGOS (React Native + Expo Router + Supabase)
Primary references: `product.md`, `ui/ui-guidelines.md`, `ui/on-the-go-mode.mermaid`

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

> If a listed model is unavailable in your Cursor plan, use the named fallback or closest equivalent for that role.

---

## 1) Product Scope Lock (Non-Negotiable)

MVP includes ONLY:

- Real-time barangay-specific alerts
- Street-level depth map + report submission
- Evacuation center finder + routing
- Offline/SMS fallback

Out of scope for MVP:

- Donation flow
- Expanded preparedness gamification
- Non-critical exploratory modules

Core product rule:

- AGOS solves last-mile communication, not infrastructure flooding control.

---

## 2) Global Engineering Rules

- Stack: Expo Router + React Native + Supabase.
- Keep feature-first architecture under `src/features/*`.
- No direct backend calls in presentational components.
- Use service/repository pattern.
- Filipino-first copy for alerts and emergency CTAs.
- Severity must always be conveyed with text + icon + color.
- Optimize lists (virtualized lists, lightweight rows).
- Keep map/report UX fast (<10s report intent path).
- Prefer stable references, derived state, and minimal re-renders.

---

## 3) UI System Requirements (From `ui/ui-guidelines.md`)

- Dark mode only for MVP.
- Severity colors reserved strictly for alert semantics:
  - MONITOR `#3B82F6`
  - PREPARE `#F59E0B`
  - LEAVE `#F97316`
  - EVACUATE `#EF4444`
- Primary CTA: square corners (0 radius), high emphasis.
- Typography: Outfit (headings), DM Sans (body), legibility first.
- Minimum functional text size: 15px.
- One primary action per emergency state.
- Alert card is the dominant home component.
- Map is source of truth across flows.

---

## 4) Target App Structure

Routes:

- `app/(tabs)/home.tsx`
- `app/(tabs)/map.tsx`
- `app/(tabs)/centers.tsx`
- `app/(tabs)/report.tsx`
- `app/alert/[id].tsx`
- `app/center/[id].tsx`
- `app/settings/index.tsx`

Core folders:

- `src/design/` (tokens, typography, spacing)
- `src/features/alerts/`
- `src/features/map/`
- `src/features/centers/`
- `src/features/reports/`
- `src/features/offline/`
- `src/services/` (supabase/maps/weather/tts/sms adapters)
- `src/store/` (app state slices)
- `src/types/` (domain contracts)

---

## 5) Agent Definitions

### Agent A — UI Foundation Agent

Model: Gemini 3.0 Pro
Scope:

- Create AGOS tokens/theme primitives.
- Build reusable UI components.
- Replace starter template visuals.
- Implement 4-tab shell and shared layouts.

Deliverables:

- Unified visual system with AGOS rules.
- Reusable components ready for feature teams.

### Agent B — Map + Reports Agent

Model: Opus 4.6 (fallback: Claude 3.7 Sonnet)
Scope:

- Map screen implementation and pin rendering.
- Report flow (depth -> optional photo -> location confirm).
- Pending vs confirmed report states.
- Offline queue + sync-on-reconnect for report submissions.

Deliverables:

- Functional map/report flow with local resilience.

### Agent C — Alerts + Decision Engine Agent

Model: Claude 3.7 Sonnet
Scope:

- Alert domain + realtime subscriptions.
- Decision state rendering (MONITOR/PREPARE/LEAVE/EVACUATE).
- Push notifications and TTS trigger behavior.
- Integrate alert CTA handoffs to route/centers.

Deliverables:

- End-to-end alert pipeline from backend event to user action.

### Agent D — Centers + Routing + SMS Agent

Model: Opus 4.6 (fallback: Claude 3.7 Sonnet)
Scope:

- Evacuation center list/filter/detail.
- Route action and passability-aware recommendation hook.
- SMS provider abstraction and fallback dispatch flow.

Deliverables:

- Usable center discovery + resilient fallback communications path.

### Agent E — QA Gate Agent

Model: Haiku 4.5 (fallback: Claude 3.7 Sonnet)
Scope:

- Validate UX, accessibility, offline behavior, and MVP compliance.
- Ensure out-of-scope features are not leaking in.
- Run release checklist and defect triage.

Deliverables:

- Go/No-Go report with findings and severity tags.

---

## 6) Technical Blueprint (UI + Backend)

### Data model (Supabase)

Required tables:

- `users`
- `flood_reports`
- `alerts`
- `evac_centers`
- `registered_buddies`
- `flood_zones`

Must-have controls:

- RLS policies by role and access context.
- Geospatial query support for proximity checks.
- Consensus enforcement for reports (2 reports / 500m / 30min).

### Backend execution

- Edge Function: decision engine run cadence (active weather windows).
- Realtime subscriptions:
  - alerts updates
  - report inserts/confirmations
  - center status changes
- Fallback polling if realtime socket is unstable.

### Client behavior

- Cached latest alert + nearby centers + pending actions.
- Offline-safe UI with "last updated" state visible.
- No blank map/report/center screens during connectivity issues.
- Sync pending report queue on reconnect.

---

## 7) Delivery Phases (48h MVP)

Phase 1 (0-4h):

- project scaffolding, routing shell, token/theme baseline, env wiring

Phase 2 (4-16h):

- map screen, report flow, local queue behavior, report display states

Phase 3 (16-28h):

- alert model + realtime + decision state UI + push/TTS trigger path

Phase 4 (28-40h):

- centers list/filter/detail + route handoff + passability hook + SMS adapter

Phase 5 (40-48h):

- hardening, accessibility pass, demo seed data, QA signoff

---

## 8) Definition of Done (MVP Exit Criteria)

- Barangay-level alert appears live and drives correct state UI.
- Flood report can be submitted quickly and survives offline interruptions.
- Consensus logic controls public confirmation state.
- User can find open center and start routing.
- Orange/Red path supports SMS fallback dispatch behavior.
- All core emergency copy is Filipino-first.
- Performance acceptable on low/mid-range devices.

---

## 9) Orchestrator Prompt (Use this in Cursor)

"You are the AGOS integration orchestrator. Enforce MVP scope from `product.md`, UI constraints from `ui/ui-guidelines.md`, and flow constraints from `ui/on-the-go-mode.mermaid`. Coordinate specialized agents by ownership boundaries, prevent overlap conflicts, and gate merges on Definition of Done. Prioritize emergency clarity, offline resilience, and barangay-specific decision support over feature expansion."

---

## 10) Agent Prompt Base Template

"You are [AGENT_NAME] using [MODEL_NAME] for AGOS.
Your scope is limited to: [SCOPE].
Follow: `product.md`, `ui/ui-guidelines.md`, `ui/on-the-go-mode.mermaid`.
Do not introduce non-MVP features.
Preserve Filipino-first emergency UX and severity semantics.
Output:

1. files touched
2. key decisions
3. risks
4. test checklist
5. integration notes for other agents."

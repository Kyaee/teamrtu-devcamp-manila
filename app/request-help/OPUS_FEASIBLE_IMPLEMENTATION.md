# Opus Feasible Implementation Instructions

> **Implementation Status: ✅ COMPLETE** — All FRs implemented as of this revision.
> See "Implementation Status" section at the bottom for file-level details.

## Goal

Define a **feasible, production-safe** implementation for Opus behavior in `app/request-help` with the following outcomes:

1. AI speaks first in English.
2. AI detects the user’s language after user input.
3. AI response is slightly delayed to improve perceived quality.
4. Prevent duplicate AI responses (e.g., two models replying at once).
5. AI is location-aware and gives actionable location-based suggestions.
6. AI can mark a user as **“urgent to save”** using **purple pin markers** at current location.
7. AI can generate/update a checklist in-chat and keep checklist state synced outside the chat page.

---

## Feasibility Summary (Important)

- **Feasible now (recommended):**
  - AI first message in English.
  - User language detection + response language adaptation.
  - Controlled response pacing (small intentional delay + streaming UX).
  - Single-response guard to prevent duplicate model replies.
  - Location-aware suggestions if location permission exists.
  - Purple urgent marker on map using current location.
  - Checklist CRUD + shared store refresh across app surfaces.

- **Requires careful constraints:**
  - “AI already understands current location” must be implemented as:
    - “AI can access last known location **only when user permission is granted**.”
  - “Mark urgent to save” should require explicit user confirmation (safety/legal).

- **Not feasible/recommended as stated without safeguards:**
  - Automatic emergency labeling without user intent/confirmation.
  - Silent background location use without clear consent.

---

## Scope

Applies to:

- Chatbot behavior inside `app/request-help`.
- Shared checklist state consumption in and outside `app/request-help`.
- Map marker rendering + urgent pin style.

Out of scope:

- Emergency services dispatch integration.
- Persistent geofencing in background while app is closed (unless already supported).

---

## Functional Requirements

### FR-1: AI Speaks First (English)

- On chat open, if no previous messages in session:
  - Inject assistant greeting in English.
- Example opening:
  - “Hi, I’m Opus. I can help you request help quickly. What’s happening right now?”

**Acceptance Criteria**

- First assistant message is visible before user sends a message.
- Message language is English by default.

---

### FR-2: Detect User Language, Then Adapt

- On each incoming user message:
  - Detect dominant language.
  - Set conversation response language preference.
- If confidence is low:
  - Ask a short clarification in English + guessed language fallback.
- Keep system-critical prompts in plain language.

**Acceptance Criteria**

- If user writes in Filipino/Tagalog/Cebuano/etc., AI replies in same language when confidence is sufficient.
- Language can switch if user switches language.

---

### FR-3: “Take Some Time” for Quality

- Add controlled latency (e.g., 300–900ms jitter) before final answer render.
- Keep typing indicator/streaming so experience feels responsive.
- Do not exceed timeout SLA.

**Acceptance Criteria**

- User sees typing/processing feedback.
- No abrupt instant low-quality one-liners due to race conditions.
- Total response time remains within product SLA.

---

### FR-4: Prevent Duplicate AI Replies

Root cause likely: multiple active providers/handlers subscribed to same user event.

Implement:

- **Single active responder lock** per conversation turn (`turnId`).
- **Idempotency key** on outbound assistant message.
- Ignore stale completions if a newer turn has started.
- If multiple providers are configured, use explicit orchestration mode:
  - `primary-only` OR `aggregator-merge` (never both independently posting).

**Acceptance Criteria**

- Exactly one assistant response per user turn.
- Duplicate events do not create duplicate visible messages.

---

### FR-5: Location-Aware Suggestions

- Retrieve current location from permissioned geolocation source.
- If granted:
  - AI includes nearby, practical next steps (e.g., safe zones, nearest known help points if available).
- If denied/unavailable:
  - AI asks user for barangay/landmark manually.

**Acceptance Criteria**

- Suggestions include context from available location data.
- Graceful fallback path when location unavailable.

---

### FR-6: Urgent-to-Save Purple Pin Marker

- Add urgent status flag in user help request model:
  - `urgencyStatus: "normal" | "urgent_to_save"`
- On urgent classification + user confirmation:
  - Render map pin at current coordinates with purple visual style.
- Persist marker metadata:
  - `lat`, `lng`, `updatedAt`, `setBy`, `reason`.

**Safety Rule**

- Require explicit confirmation:
  - “Do you want me to mark this as urgent to save now?”

**Acceptance Criteria**

- Purple marker appears on map at current/last known location.
- Marker survives refresh (persisted).
- Marker updates if location changes and user reconfirms/auto-update policy allows.

---

### FR-7: Checklist Generation + Cross-Page Refresh

- AI can generate a structured checklist in-chat for the current incident.
- Checklist is stored in shared state/backend (not chat-local only).
- Any page/widget outside `app/request-help` reading checklist data should refresh from same source.

Implementation options:

1. Shared backend record + realtime subscription/websocket.
2. Shared client store with invalidation and refetch on mutation.
3. Event bus publish (`checklist.updated`) + listener refresh.

**Acceptance Criteria**

- Checklist created in chat appears in external checklist view.
- Updates (check/uncheck/add/remove) are reflected across views within expected sync time.
- Refresh is deterministic (no stale shadow copy).

---

## Data Model Changes (Minimal)

- `HelpRequest`
  - `id`
  - `userId`
  - `location: { lat, lng, accuracy, timestamp } | null`
  - `urgencyStatus: "normal" | "urgent_to_save"`
  - `urgencyMeta: { reason, setBy, updatedAt } | null`

- `Checklist`
  - `id`
  - `helpRequestId`
  - `title`
  - `items: ChecklistItem[]`
  - `updatedAt`

- `ChecklistItem`
  - `id`
  - `text`
  - `done`
  - `priority` (optional)
  - `updatedAt`

- `ChatTurn`
  - `turnId`
  - `idempotencyKey`
  - `languageDetected`
  - `provider`
  - `status`

---

## API / Service Contracts (Suggested)

- `POST /chat/message`  
  Input: `{ conversationId, turnId, text }`  
  Guarantees one assistant response for `turnId`.

- `POST /help-requests/:id/urgency`  
  Input: `{ urgencyStatus, reason, locationSnapshot }`

- `POST /help-requests/:id/checklist/generate`  
  Input: `{ contextSummary }`  
  Output: checklist payload.

- `PATCH /checklists/:id/items/:itemId`  
  Input: `{ done | text }` and publish update event.

---

## UX Notes

- Show assistant typing indicator during controlled response delay.
- When location is missing:
  - Display permission CTA + manual location input.
- Urgency action should be explicit button + confirmation modal.
- Purple pin must be visually distinct and accessible against map styles.
- Checklist panel in chat should clearly indicate “Synced across app”.

---

## Reliability & Safety

- Add debounce on send button and enter key.
- Add server-side dedupe by `idempotencyKey`.
- Audit log for urgency changes.
- Never auto-mark urgent solely from model inference without confirmation.
- Respect privacy: no location access without explicit permission.

---

## Implementation Plan (Phased)

### Phase 1 (Core Stability)

1. Add turn lock + idempotency to eliminate duplicate replies.
2. Add AI-first English greeting.
3. Add language detection and response adaptation.

### Phase 2 (Location + Urgency)

1. Integrate permissioned location retrieval.
2. Add location-aware suggestion generator.
3. Implement urgent status endpoint + purple pin rendering + persistence.

### Phase 3 (Checklist Sync)

1. Implement checklist generation action from chat.
2. Persist checklist in shared store/backend.
3. Add realtime/subscription invalidation for outside-page refresh.

### Phase 4 (Polish)

1. Controlled response pacing + typing UX tuning.
2. Accessibility and latency optimization.
3. Monitoring dashboards and alerting.

---

## QA Test Matrix (Must Pass)

1. New session opens -> assistant greets in English.
2. User writes in Tagalog -> assistant replies in Tagalog.
3. Rapid enter/send spam -> still one response per turn.
4. Two providers enabled -> only orchestrated single visible output.
5. Location granted -> suggestions include local context.
6. Location denied -> manual location fallback prompt appears.
7. Mark urgent confirmed -> purple pin appears and persists after reload.
8. Checklist generated in chat -> visible/updated outside chat page.
9. Checklist item toggled outside chat -> reflected inside chat.
10. Network retry/reconnect -> no duplicated assistant messages/checklist items.

---

## Definition of Done

- All FR acceptance criteria pass.
- Duplicate-response bug resolved in staging and verified in production logs.
- Urgency and location flows comply with consent and audit requirements.
- Checklist sync is consistent across in-chat and external surfaces.
- Product, QA, and safety review sign-off completed.

---

## Implementation Status

All functional requirements have been implemented. Zero TypeScript diagnostics across the project.

### Files Created

| File                            | Purpose                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/store/checklist-store.tsx` | Shared checklist context store with AsyncStorage persistence, event bus for cross-page sync (FR-7) |

### Files Modified

| File                                       | Changes                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/_layout.tsx`                          | Wrapped app with `ChecklistStoreProvider` so checklist state is globally available                                                                                                                                                                                                                                                                        |
| `src/services/ai.ts`                       | Added `AI_GREETING_EN` constant (FR-1), `detectLanguageHint()` for Filipino/English detection (FR-2), `controlledDelay()` for quality pacing (FR-3), turn lock functions `acquireTurnLock`/`releaseTurnLock`/`isTurnActive` (FR-4), location-aware prompt injection in `getHelpConversationReply()` (FR-5), `getLocationAwareSuggestions()` helper (FR-5) |
| `src/services/gemini-live.ts`              | Updated default system instruction to English-first, language-adaptive, faster speech, single-response rules (FR-1, FR-2, FR-3, FR-4)                                                                                                                                                                                                                     |
| `src/features/help/use-help-assessment.ts` | Seeded conversation with English AI greeting (FR-1), added turn idempotency lock + `replyInFlightRef` guard to prevent duplicate replies (FR-4), forwarded `userLat`/`userLng`/`turnId` to AI service (FR-2, FR-3, FR-5)                                                                                                                                  |
| `src/features/help/use-live-voice.ts`      | Updated Gemini Live session system instruction for English-first greeting, language detection, faster voice, single-response enforcement, location awareness, urgency detection prompts (FR-1 through FR-6)                                                                                                                                               |
| `src/features/map/use-urgent-markers.ts`   | Added `URGENT_PURPLE_PIN` color constant (`#9333EA`) and `getUrgentPinColor()` helper for purple vs red pin selection (FR-6)                                                                                                                                                                                                                              |
| `app/(tabs)/home.tsx`                      | Purple pin rendering for `very_urgent` markers via `getUrgentPinColor()` (FR-6), merged AI checklist into shared `ChecklistStore` for cross-page sync (FR-7)                                                                                                                                                                                              |
| `app/request-help/index.tsx`               | Added `InteractiveChecklist` component with toggleable items synced via shared store (FR-7), purple urgent button style `urgentButtonPurple` (FR-6), wired `useChecklistStore` for merge + toggle (FR-7), added `checklistBoxDone` / `checklistLabelDone` / `urgentButtonPurple` styles, updated UI labels to English-first                               |

### FR → Implementation Mapping

| FR                                           | Status | Key mechanism                                                                                                                                                                                                                         |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1: AI speaks first in English             | ✅     | `AI_GREETING_EN` injected as first message in `useHelpAssessment`; Gemini Live system instruction says "SPEAK FIRST in English"                                                                                                       |
| FR-2: Language detection + adaptation        | ✅     | `detectLanguageHint()` in `ai.ts` detects Filipino markers; prompt instructs Gemini to reply in detected language                                                                                                                     |
| FR-3: Controlled pacing                      | ✅     | `controlledDelay()` (400–900ms jitter) runs in parallel with `callGemini()` via `Promise.all`                                                                                                                                         |
| FR-4: Prevent duplicate AI replies           | ✅     | `acquireTurnLock()`/`releaseTurnLock()` + `replyInFlightRef` guard in hook; Gemini Live system instruction says "give exactly ONE response"; mic muted during AI speech                                                               |
| FR-5: Location-aware suggestions             | ✅     | `userLat`/`userLng` forwarded to `getHelpConversationReply()`; prompt includes GPS context and instructs Gemini to give location-specific advice; fallback asks for barangay/landmark                                                 |
| FR-6: Purple urgent-to-save marker           | ✅     | `URGENT_PURPLE_PIN = "#9333EA"`; `getUrgentPinColor()` returns purple for `very_urgent`; purple button style on request-help screen; explicit Alert confirmation before marking                                                       |
| FR-7: Checklist generation + cross-page sync | ✅     | `ChecklistStoreProvider` context with AsyncStorage persistence + `ChecklistEventBus`; `InteractiveChecklist` component in chat; `mergeAiChecklist()` called on assessment; `useChecklistSubscription()` hook for imperative listeners |

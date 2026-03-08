---
name: Help Request Gemini Live Voice Stabilization
overview: Stabilize the Request Help live-voice experience by enforcing single-speaker behavior, speeding up AI speech cadence, auto-starting voice from Home CTA, providing chat fallback when voice is unavailable, and ensuring active-state animation visibility.
todos:
  - id: audit-current-voice-entrypoints
    content: Identify all places where AI audio can start, including legacy TTS and Gemini live playback
    status: completed
  - id: enforce-single-audio-pipeline
    content: Disable/guard duplicate speech outputs so only one Gemini voice can speak at a time
    status: completed
  - id: increase-speech-cadence
    content: Reduce response latency and perceived speaking pace in live voice playback pipeline
    status: completed
  - id: remove-voice-mode-button
    content: Remove manual voice mode button from request-help and rely on Home CTA auto-start
    status: completed
  - id: auto-start-voice-from-home
    content: Pass intent param from Home Humingi ng Tulong and auto-start live voice on request-help mount
    status: completed
  - id: add-chat-fallback-ui
    content: If voice unavailable/error, show Chat fallback button and embedded chatbot panel with safe-area padding
    status: completed
  - id: show-active-animation
    content: Display/keep animation while AI is active (listening/speaking/connecting), including re-entry
    status: completed
  - id: harden-and-verify
    content: Add logging, guards, and manual QA checklist for no-dup-audio and fallback behavior
    status: completed
isProject: false
---

# Request Help — Live Gemini Voice Stabilization Plan (for Opus)

## Problem Statement

The current live-voice flow has functional regressions:

1. Multiple Gemini voices overlap (duplicate outputs).
2. AI voice response feels slow (high latency / slow cadence).
3. `request-help` still has a manual **“Gamitin ang Voice Mode”** button.
4. Voice should auto-start after tapping **“Humingi ng Tulong”** from Home.
5. If live voice is unavailable, user needs an explicit fallback to chat and visible chatbot UI.
6. Chat UI needs bottom padding to avoid Android navigator overlap.
7. If AI is active, the screen should clearly show the active animation.

This plan assumes existing implementation is mostly done and focuses on stabilization + UX correction.

## Scope and Non-Goals

### In scope

- Request-help entry behavior and voice startup contract.
- De-duplication of AI output streams.
- Live voice pacing/latency improvements that do not require backend model changes.
- Chat fallback UX and layout safety.
- Active animation state correctness.

### Out of scope

- Rewriting the entire Gemini live service.
- Migrating away from current Gemini model unless required for blocking bug.
- New backend APIs.

## High-Level Strategy

1. Unify voice output ownership: only one component controls playback.
2. Gate all speak paths behind a single state machine.
3. Make Home CTA the only voice auto-start entry.
4. Provide graceful fallback to text chat on unsupported/native-module failures.
5. Render state-driven animation for active AI phases.

## File Targets (expected)

- `app/(tabs)/home.tsx`
- `app/request-help/index.tsx` (or equivalent request-help route file)
- `src/features/help/use-live-voice.ts`
- `src/services/gemini-live.ts`
- Any legacy TTS helper currently used in request-help (likely `expo-speech` usage or helper service)
- Request-help styles/components related to animation and chatbot rendering

## Phase 1 — Diagnose and Eliminate Multi-Response Audio

### 1.1 Audit all speak/playback entrypoints

- Search for:
  - `expo-speech` usage (`Speech.speak`, wrappers)
  - `createAudioPlayer`, `player.play()`
  - Gemini live `onAudioChunk`, `onModelTurnComplete`
  - Any callback that triggers both TTS and live PCM playback.
- Build a short map of:
  - Source of generated response (`live` / `text` / fallback).
  - Renderer of audio (live PCM player vs TTS).
  - Current guard conditions.

### 1.2 Enforce single-speaker policy

Implement hard guard rules:

- If `useLiveVoice` session is active (`connecting|active`), disable any fallback TTS speak calls.
- If fallback chat/TTS is engaged, ensure live session audio playback queue is stopped/reset.
- Before starting playback of a new AI response:
  - Stop/remove existing `AudioPlayer` if still playing.
  - Clear stale queue on interruption and turn transitions.
- Prevent duplicate listeners:
  - Ensure `LiveAudioStream.on("data", ...)` is registered once per session start.
  - Ensure it is removed/invalidated on stop/unmount/session reset.

### 1.3 Add runtime logs for verification

Add concise tagged logs:

- `[VoiceGate] source=<live|tts|chat> allowed=<true|false> reason=...`
- `[LivePlayback] queue=<n> playing=<bool> turn=<state>`
- `[Fallback] activated reason=<permissions|native_unavailable|connect_error>`

Acceptance:

- In one interaction turn, only one audio renderer speaks.
- No overlapping double Gemini responses in 10 consecutive prompts.

## Phase 2 — Make AI Speak Faster (Perceived Cadence + Latency)

### 2.1 Reduce buffering delay in live playback

In `use-live-voice.ts`, tune:

- Lower `PLAYBACK_BUFFER_CHUNKS` (currently 3) → target 1–2.
- Lower drain interval if safe (`PLAYBACK_DRAIN_INTERVAL_MS`).
- Ensure first chunk starts faster while preserving intelligibility.

### 2.2 Prioritize immediate playback start

- Start playback as soon as minimum chunk threshold is met.
- Continue appending subsequent chunks in near-real-time (or short micro-batches).
- Avoid waiting for `turnComplete` to begin first audio output.

### 2.3 Keep turn state responsive

- Ensure `turnState` transitions to `speaking` immediately on first audio chunk.
- Avoid delayed UI state transitions that make response feel slow.

Acceptance:

- Noticeably faster first audio response after user speech.
- No stutter/regression in playback completion.

## Phase 3 — Remove Manual Voice Button and Auto-Start from Home CTA

### 3.1 Home CTA navigation contract

In `app/(tabs)/home.tsx`:

- Update **Humingi ng Tulong** navigation to include an intent param, e.g.:
  - `autoStartVoice: "1"`
  - optionally `entry: "home_cta"`.

### 3.2 Request-help auto-start on mount

In request-help screen:

- On initial mount, if `autoStartVoice === "1"`:
  - trigger live voice `start()`.
  - set internal flag to prevent repeated auto-start on re-render.
- Handle idempotency:
  - if already active/connecting, do nothing.

### 3.3 Remove “Gamitin ang Voice Mode” button

- Delete/hide manual voice-mode activation CTA in request-help UI.
- Keep internal controls for stop/retry if needed (debug-safe), but not this user-facing button.

Acceptance:

- Tapping Home “Humingi ng Tulong” opens request-help and starts live voice automatically.
- No visible “Gamitin ang Voice Mode” button remains.

## Phase 4 — Add Chat Fallback Button + Embedded Chatbot with Safe Padding

### 4.1 Fallback trigger conditions

When live voice unavailable:

- Native module unavailable
- Mic permission denied
- Connect failure / session error
- Explicit user choice to switch to chat

Show a clear fallback button:

- Label example: `Mag-chat na lang`
- Place near voice status/error banner.

### 4.2 Render chatbot panel below

On fallback button tap:

- Show embedded chatbot component/panel directly below status area.
- Reuse existing message pipeline for text (Gemini text endpoint / existing chat flow).

### 4.3 Fix Android bottom overlap

Add bottom-safe spacing:

- Use safe-area inset (`useSafeAreaInsets`) and apply:
  - `paddingBottom: insets.bottom + <extra>`
- Ensure text input/send button remain fully visible above native navigation.

Acceptance:

- On voice failure, user can switch to chat in one tap.
- Chat input is never blocked by Android nav bar.

## Phase 5 — Active Animation Visibility Rules

### 5.1 Animation state mapping

Show active animation whenever AI is in:

- Voice state: `connecting` or `active`
- Turn state: `listening` or `speaking`
- Optional: while playback queue is non-empty.

### 5.2 Preserve animation through transitions

- Avoid flicker between reconnect/turn changes.
- Keep animation mounted while transitioning from listening ↔ speaking.

### 5.3 Visual precedence

- Ensure active animation remains visible even when fallback/chat controls are shown (unless explicitly hidden for chat-only mode).

Acceptance:

- If AI is active, animation is visible and stable.
- No missing animation during active live session.

## Implementation Notes for Opus

1. Prefer minimal, targeted edits over large refactors.
2. Do not remove existing resilience logic (retry/disconnect guards).
3. Keep Filipino UX copy style consistent with existing app strings.
4. If both live voice and legacy TTS currently exist, keep TTS only as fallback-only, never parallel.
5. Add comments where state guards prevent duplicate outputs.

## QA Checklist (Manual)

1. From Home, tap **Humingi ng Tulong**:
   - Request-help opens.
   - Voice auto-starts without manual button.
2. Speak 5–10 prompts:
   - Only one AI voice responds each time.
   - No overlap/echo/double playback.
3. Measure perceived speed:
   - AI starts speaking faster than before.
4. Force voice failure (deny mic / disable module):
   - Fallback chat button appears.
   - Tapping shows chatbot panel.
   - Input is visible above Android nav bar.
5. During active session:
   - Animation is visible in connecting/listening/speaking states.
6. Return/reopen flow:
   - No duplicate event listeners.
   - No stale playback from previous session.

## Done Criteria

- [ ] No duplicate Gemini voice output in normal flow.
- [ ] Faster live voice response start (chunk buffering reduced).
- [ ] No `Gamitin ang Voice Mode` button in request-help UI.
- [ ] Home CTA auto-starts voice in request-help.
- [ ] Chat fallback button + chatbot panel implemented with safe bottom padding.
- [ ] Active animation consistently shown while AI is active.
- [ ] Regression checks pass for connect/disconnect/reconnect and unmount cleanup.

import { useCallback, useRef, useState } from "react";

import type { HelpAssessment } from "@/src/types/ai";

import {
  AI_GREETING_EN,
  acquireTurnLock,
  assessHelpRequest,
  getHelpConversationReply,
  releaseTurnLock,
} from "@/src/services/ai";

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

type AssessmentState = "idle" | "conversing" | "assessing" | "done" | "error";

/**
 * Hook for managing the help-request conversation and AI assessment.
 *
 * Opus spec enhancements:
 * - FR-1: AI speaks first with an English greeting on session start.
 * - FR-2: Language detection + adaptive replies (delegated to ai.ts).
 * - FR-3: Controlled pacing delay (delegated to ai.ts).
 * - FR-4: Turn idempotency lock — exactly one AI response per user turn.
 *         Prevents duplicate replies even under rapid re-renders or race conditions.
 * - FR-5: Location context forwarded to AI for location-aware suggestions.
 */
export function useHelpAssessment(userLat: number, userLng: number) {
  // Seed the conversation with the AI greeting (FR-1: AI speaks first in English)
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: "greeting-opus",
      role: "assistant",
      text: AI_GREETING_EN,
      timestamp: Date.now(),
    },
  ]);
  const [assessment, setAssessment] = useState<HelpAssessment | null>(null);
  const [state, setState] = useState<AssessmentState>("idle");
  const [error, setError] = useState<string | null>(null);
  const assessmentCountRef = useRef(0);

  /**
   * Monotonic turn counter. Each call to sendMessage increments this.
   * Used as the idempotency key for the turn lock (FR-4).
   */
  const turnCounterRef = useRef(0);

  /**
   * Guard ref to prevent concurrent sendMessage calls from producing
   * duplicate AI replies. Set to true while an AI reply is in-flight.
   */
  const replyInFlightRef = useRef(false);

  const sendMessage = useCallback(
    async (text: string) => {
      // FR-4: Prevent overlapping reply requests
      if (replyInFlightRef.current) {
        return;
      }

      // Generate a unique turn ID and acquire the lock
      turnCounterRef.current += 1;
      const turnId = `turn-${turnCounterRef.current}-${Date.now()}`;

      if (!acquireTurnLock(turnId)) {
        // Another turn is already active — skip
        return;
      }

      replyInFlightRef.current = true;

      const userMsg: ConversationMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        text,
        timestamp: Date.now(),
      };

      // Append user message immediately
      setMessages((prev) => [...prev, userMsg]);
      setState("conversing");
      setError(null);

      try {
        // Build simplified message history for the AI
        // (includes the greeting + all prior messages + new user message)
        const allMessages = [...messages, userMsg];
        const simplified = allMessages.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        // FR-2 + FR-3 + FR-5: Language-adaptive, paced, location-aware reply
        const reply = await getHelpConversationReply(simplified, {
          userLat,
          userLng,
          turnId,
        });

        // FR-4: If reply is empty, the turn was superseded — discard silently
        if (!reply) {
          return;
        }

        const assistantMsg: ConversationMessage = {
          id: `msg-${Date.now()}-ai`,
          role: "assistant",
          text: reply,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setError("The AI couldn't reply. Please try again.");
      } finally {
        // Release the turn lock so the next message can proceed
        releaseTurnLock(turnId);
        replyInFlightRef.current = false;
      }
    },
    [messages, userLat, userLng],
  );

  const runAssessment = useCallback(async () => {
    // Need at least 2 user messages for a meaningful assessment
    const userMsgCount = messages.filter((m) => m.role === "user").length;
    if (userMsgCount < 2) {
      setError(
        "More information is needed before assessment. Please describe your situation further.",
      );
      return null;
    }

    setState("assessing");
    setError(null);
    assessmentCountRef.current += 1;

    try {
      const simplified = messages.map((m) => ({
        role: m.role,
        text: m.text,
      }));
      const result = await assessHelpRequest(simplified, userLat, userLng);
      setAssessment(result);
      setState("done");
      return result;
    } catch {
      setState("error");
      setError("The AI could not assess your situation. Please try again.");
      return null;
    }
  }, [messages, userLat, userLng]);

  const reset = useCallback(() => {
    // Reset to initial state with fresh greeting
    setMessages([
      {
        id: `greeting-opus-${Date.now()}`,
        role: "assistant",
        text: AI_GREETING_EN,
        timestamp: Date.now(),
      },
    ]);
    setAssessment(null);
    setState("idle");
    setError(null);
    turnCounterRef.current = 0;
    replyInFlightRef.current = false;
  }, []);

  return {
    messages,
    assessment,
    state,
    error,
    sendMessage,
    runAssessment,
    reset,
    hasEnoughMessages: messages.filter((m) => m.role === "user").length >= 2,
  };
}

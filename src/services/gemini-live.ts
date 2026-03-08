/**
 * Gemini Live API service for speech-to-speech streaming.
 *
 * Uses the @google/genai SDK's `live.connect()` to open a persistent
 * bidirectional session with the Gemini native-audio model.
 *
 * Responsibilities:
 * - Session lifecycle (connect / disconnect / reconnect)
 * - Sending real-time PCM audio chunks from the microphone
 * - Receiving audio response chunks and dispatching them to a callback
 * - Turn management (listening ↔ speaking states)
 * - Interruption handling (clear playback queue when server signals interruption)
 * - Automatic retry with exponential back-off on transient failures
 *
 * FIX: Overlapping sessions on reconnect — old session is now explicitly
 * closed before creating a new one, and a monotonic generation counter
 * ensures stale callbacks are silently ignored.
 */

import { GoogleGenAI, Modality } from "./genai-web";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LiveSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type TurnState = "listening" | "speaking" | "idle";

export type LiveAudioChunk = {
  /** Base-64 encoded PCM audio data from Gemini */
  data: string;
};

export type LiveTranscript = {
  text: string;
  isFinal: boolean;
};

export type LiveSessionCallbacks = {
  /** Called whenever the session state changes */
  onSessionStateChange?: (state: LiveSessionState) => void;
  /** Called whenever the turn state changes */
  onTurnStateChange?: (turn: TurnState) => void;
  /** Called with each audio chunk received from the model */
  onAudioChunk?: (chunk: LiveAudioChunk) => void;
  /** Called when the server signals an interruption (model was cut off) */
  onInterrupted?: () => void;
  /** Called on unrecoverable errors */
  onError?: (error: string) => void;
  /** Called when the model's turn is complete for a given server response */
  onModelTurnComplete?: () => void;
};

export type LiveSessionConfig = {
  /** System instruction for the Gemini model */
  systemInstruction?: string;
  callbacks: LiveSessionCallbacks;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasApiKey(): boolean {
  return API_KEY.length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// GeminiLiveSession
// ---------------------------------------------------------------------------

/**
 * Wraps a single Gemini Live API session.
 *
 * Usage:
 * ```
 * const session = new GeminiLiveSession({ callbacks: { ... } });
 * await session.connect();
 * session.sendAudio(base64PcmChunk);   // from microphone
 * session.disconnect();
 * ```
 */
export class GeminiLiveSession {
  // SDK instances ---------------------------------------------------------
  private ai: GoogleGenAI | null = null;

  private session: any = null; // SDK live session handle

  // State -----------------------------------------------------------------
  private _sessionState: LiveSessionState = "idle";
  private _turnState: TurnState = "idle";
  private retryCount = 0;
  private disposed = false;

  /**
   * Monotonic generation counter. Bumped on every attemptConnect() call.
   * Callbacks captured for a stale generation are silently ignored,
   * preventing audio from an old WebSocket leaking into the current
   * playback queue — the root cause of "two Geminis talking".
   */
  private connectGen = 0;

  // Config ----------------------------------------------------------------
  private systemInstruction: string;
  private callbacks: LiveSessionCallbacks;

  constructor(config: LiveSessionConfig) {
    this.systemInstruction =
      config.systemInstruction ??
      "You are a compassionate and helpful AI emergency assistant for Metro Manila, Philippines. " +
        "IMPORTANT RULES:\n" +
        "1. SPEAK FIRST: When the session starts, immediately greet the user in English. Say something like: " +
        "'Hi, I'm here to help. Tell me what's happening — are you in a flood, do you need rescue, or do you need supplies?'\n" +
        "2. LANGUAGE ADAPTATION: After the user speaks, detect their language. If they speak in Filipino/Tagalog, " +
        "switch to Filipino for all subsequent responses. If they speak English, continue in English. " +
        "If you're unsure, reply in English with a brief Filipino translation.\n" +
        "3. VOICE SPEED: Speak at a slightly faster pace than normal. Be concise and direct — no filler words.\n" +
        "4. SINGLE RESPONSE: Give exactly ONE response per user turn. Never repeat yourself or give multiple answers.\n" +
        "5. LOCATION AWARENESS: The user is in Metro Manila. Provide location-relevant suggestions " +
        "(nearby evacuation centers, barangay hotlines, flood-prone area warnings).\n" +
        "6. URGENCY DETECTION: If the user is in immediate danger (trapped, injured, rising water), " +
        "tell them you will mark their location as urgent and ask for confirmation.\n" +
        "7. Be calm, clear, and direct. Help them assess their situation — " +
        "ask where they are, how high the water is, if they're injured, and if they need rescue.";
    this.callbacks = config.callbacks;
  }

  // -- Getters ------------------------------------------------------------

  get sessionState(): LiveSessionState {
    return this._sessionState;
  }

  get turnState(): TurnState {
    return this._turnState;
  }

  get isConnected(): boolean {
    return this._sessionState === "connected";
  }

  // -- State transitions --------------------------------------------------

  private setSessionState(next: LiveSessionState) {
    if (this._sessionState === next) return;
    this._sessionState = next;
    this.callbacks.onSessionStateChange?.(next);
  }

  private setTurnState(next: TurnState) {
    if (this._turnState === next) return;
    this._turnState = next;
    this.callbacks.onTurnStateChange?.(next);
  }

  // -- Connect / Disconnect -----------------------------------------------

  async connect(): Promise<void> {
    if (this.disposed) return;

    if (!hasApiKey()) {
      this.setSessionState("error");
      this.callbacks.onError?.("Walang Gemini API key. Hindi maka-connect.");
      return;
    }

    this.setSessionState("connecting");
    this.retryCount = 0;

    await this.attemptConnect();
  }

  /**
   * Safely close and discard the current SDK session, if any.
   * This ensures no stale WebSocket continues to deliver messages
   * into our callbacks after a reconnect.
   */
  private closeCurrentSession(): void {
    if (this.session) {
      try {
        this.session.close?.();
      } catch {
        // Ignore — socket may already be dead
      }
      this.session = null;
    }
  }

  private async attemptConnect(): Promise<void> {
    if (this.disposed) return;

    // Bump generation counter — any callbacks bound to the previous
    // generation will see a mismatch and bail out.
    const gen = ++this.connectGen;

    // Close old session first so its onmessage can never fire again
    // into our handleMessage. This is the critical fix for overlapping
    // audio responses ("two Geminis talking").
    this.closeCurrentSession();

    try {
      this.ai = new GoogleGenAI({ apiKey: API_KEY });

      const sdkConfig = {
        responseModalities: [Modality.AUDIO],
        systemInstruction: this.systemInstruction,
      };

      this.session = await this.ai.live.connect({
        model: LIVE_MODEL,
        config: sdkConfig,
        callbacks: {
          onopen: () => {
            // Guard: stale generation or disposed
            if (this.disposed || this.connectGen !== gen) return;
            this.retryCount = 0;
            this.setSessionState("connected");
            this.setTurnState("listening");
          },
          onmessage: (message: unknown) => {
            // Guard: stale generation or disposed
            if (this.disposed || this.connectGen !== gen) return;
            this.handleMessage(message);
          },
          onerror: (e: { message?: string }) => {
            if (this.disposed || this.connectGen !== gen) return;
            console.error("[GeminiLive] session error:", e?.message);
            // Don't immediately error — the onclose handler will retry.
          },
          onclose: (_e: { reason?: string }) => {
            // Guard: stale generation or disposed
            if (this.disposed || this.connectGen !== gen) return;
            this.session = null;
            if (
              this._sessionState === "connected" ||
              this._sessionState === "reconnecting"
            ) {
              void this.handleDisconnect();
            } else {
              this.setSessionState("disconnected");
            }
          },
        },
      });

      // If generation changed while we were awaiting connect, close
      // the session we just created — it's already stale.
      if (this.connectGen !== gen) {
        console.log(
          "[GeminiLive] stale session created during connect, closing",
        );
        try {
          this.session?.close?.();
        } catch {
          // ignore
        }
        this.session = null;
      }
    } catch (err) {
      console.error("[GeminiLive] connect failed:", err);
      if (!this.disposed && this.connectGen === gen) {
        await this.handleDisconnect();
      }
    }
  }

  private async handleDisconnect(): Promise<void> {
    if (this.disposed) return;

    this.setTurnState("idle");

    if (this.retryCount < MAX_RETRIES) {
      this.retryCount += 1;
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, this.retryCount - 1);
      console.log(
        `[GeminiLive] retry ${this.retryCount}/${MAX_RETRIES} in ${delay}ms`,
      );
      this.setSessionState("reconnecting");
      await sleep(delay);
      if (!this.disposed) {
        await this.attemptConnect();
      }
    } else {
      this.setSessionState("error");
      this.callbacks.onError?.(
        "Hindi maka-connect sa Gemini Live API pagkatapos ng ilang pagsubok.",
      );
    }
  }

  disconnect(): void {
    this.disposed = true;
    // Bump generation to invalidate any in-flight callbacks
    this.connectGen++;
    this.setTurnState("idle");

    this.closeCurrentSession();

    this.setSessionState("disconnected");
  }

  // -- Send audio ---------------------------------------------------------

  /**
   * Send a chunk of microphone audio to Gemini.
   * @param base64Pcm Base-64 encoded PCM audio (16-bit, mono, 16 kHz)
   */
  sendAudio(base64Pcm: string): void {
    if (!this.session || this._sessionState !== "connected") return;

    try {
      this.session.sendRealtimeInput({
        audio: {
          data: base64Pcm,
          mimeType: "audio/pcm;rate=16000",
        },
      });
    } catch (err) {
      console.error("[GeminiLive] sendAudio error:", err);
    }
  }

  /**
   * Send a text message into the live session (e.g. push-to-talk transcript
   * or typed fallback).
   */
  sendText(text: string): void {
    if (!this.session || this._sessionState !== "connected") return;

    try {
      this.session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      });
      this.setTurnState("speaking"); // expect model response
    } catch (err) {
      console.error("[GeminiLive] sendText error:", err);
    }
  }

  // -- Handle incoming messages -------------------------------------------

  private handleMessage(message: any): void {
    // Double-check disposed — the guard in onmessage should have caught this
    // but belt-and-suspenders for safety.
    if (!message || this.disposed) return;

    const serverContent = message.serverContent;
    if (!serverContent) return;

    // --- Interruption ---
    if (serverContent.interrupted) {
      this.setTurnState("listening");
      this.callbacks.onInterrupted?.();
      return;
    }

    // --- Model audio turn ---
    if (serverContent.modelTurn?.parts) {
      this.setTurnState("speaking");

      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.callbacks.onAudioChunk?.({
            data: part.inlineData.data as string,
          });
        }
      }
    }

    // --- Turn complete ---
    if (serverContent.turnComplete) {
      this.setTurnState("listening");
      this.callbacks.onModelTurnComplete?.();
    }
  }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Create and connect a new Gemini Live session.
 * Returns the session handle. Caller is responsible for calling `disconnect()`.
 */
export async function createLiveSession(
  config: LiveSessionConfig,
): Promise<GeminiLiveSession> {
  const session = new GeminiLiveSession(config);
  await session.connect();
  return session;
}

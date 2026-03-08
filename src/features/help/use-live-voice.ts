/**
 * Hook for managing live speech-to-speech with Gemini Live API.
 *
 * Responsibilities:
 * - Microphone capture via react-native-live-audio-stream (16-bit PCM, 16 kHz, mono)
 * - Streaming captured audio to GeminiLiveSession
 * - Receiving audio response chunks and queuing them for playback
 * - Audio playback via expo-audio (single-speaker enforced)
 * - Turn state management (listening / speaking / idle)
 * - Graceful fallback: if live session fails, caller can fall back to text mode
 *
 * FIX: Drain race condition resolved with synchronous lock flag that is set
 * BEFORE any async work. Mic is muted while AI is speaking to prevent echo
 * feedback that causes the "two Geminis talking" bug.
 */

import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules, Platform } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";

import type {
  LiveAudioChunk,
  LiveSessionState,
  TurnState,
} from "@/src/services/gemini-live";
import { GeminiLiveSession } from "@/src/services/gemini-live";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LiveVoiceState =
  | "idle"
  | "requesting_permissions"
  | "connecting"
  | "active"
  | "error"
  | "disconnected";

export type UseLiveVoiceReturn = {
  /** Overall state of the live voice feature */
  state: LiveVoiceState;
  /** Gemini session connection state */
  sessionState: LiveSessionState;
  /** Current turn: who is "talking" */
  turnState: TurnState;
  /** Whether the microphone is actively streaming */
  isMicActive: boolean;
  /** Human-readable error message, if any */
  error: string | null;
  /** Whether the native audio module is available */
  isNativeAvailable: boolean;
  /** Start the live voice session (requests permissions, connects, starts mic) */
  start: () => Promise<void>;
  /** Stop everything and tear down */
  stop: () => void;
  /** Send a text message as fallback (push-to-talk transcript) */
  sendText: (text: string) => void;
};

// ---------------------------------------------------------------------------
// Audio playback helpers
// ---------------------------------------------------------------------------

/**
 * Decode base-64 PCM (16-bit LE, 24 kHz, mono) into a WAV Uint8Array
 * so expo-audio can play it.
 */
function pcmToWav(
  base64Pcm: string,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16,
): Uint8Array {
  // Decode base64 → raw bytes
  const binaryString = atob(base64Pcm);
  const pcmBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmBytes[i] = binaryString.charCodeAt(i);
  }

  const dataLength = pcmBytes.length;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // PCM data
  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, headerLength);

  return wavBytes;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Convert Uint8Array to base-64 string (works in RN / Hermes).
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Constants — tuned for faster perceived speech
// ---------------------------------------------------------------------------

/**
 * How many audio chunks to buffer before creating a WAV for playback.
 * Set to 1 so the first chunk plays immediately, reducing perceived latency.
 */
const PLAYBACK_BUFFER_CHUNKS = 1;

/**
 * Interval (ms) to drain the playback queue.
 * 50ms is a good balance between responsiveness and not busy-looping.
 */
const PLAYBACK_DRAIN_INTERVAL_MS = 50;

// ---------------------------------------------------------------------------
// Native module availability check (cached once)
// ---------------------------------------------------------------------------

const NATIVE_AVAILABLE = !!NativeModules.RNLiveAudioStream;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLiveVoice(): UseLiveVoiceReturn {
  const [state, setState] = useState<LiveVoiceState>("idle");
  const [sessionState, setSessionState] = useState<LiveSessionState>("idle");
  const [turnState, setTurnState] = useState<TurnState>("idle");
  const [isMicActive, setIsMicActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const audioQueueRef = useRef<string[]>([]); // base-64 PCM chunks
  const playbackDrainRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPlayerRef = useRef<AudioPlayer | null>(null);
  const disposedRef = useRef(false);

  /**
   * Synchronous drain lock. This MUST be checked and set synchronously
   * (no await between check and set) to prevent the setInterval from
   * firing two concurrent drain calls that both pass the guard.
   *
   * This is the fix for the race condition where two drainPlaybackQueue
   * calls could both see isPlaying=false before either set it to true,
   * resulting in two AudioPlayers playing simultaneously.
   */
  const isDrainingRef = useRef(false);

  /**
   * Whether the mic is currently muted (not sending data to Gemini).
   * We mute the mic while the AI is speaking to prevent echo feedback
   * where the device's own speaker output gets picked up by the mic,
   * sent to Gemini, and triggers a second response — the core cause
   * of the "two Geminis talking back" bug.
   */
  const micMutedRef = useRef(false);

  /**
   * Guard flag: true while a mic "data" listener is registered.
   * Prevents duplicate listeners.
   */
  const micListenerActiveRef = useRef(false);

  /**
   * Monotonic session generation counter. Every call to start() bumps
   * this. Callbacks captured from a stale generation are silently ignored.
   */
  const sessionGenRef = useRef(0);

  // -----------------------------------------------------------------------
  // Single-speaker enforcement helpers
  // -----------------------------------------------------------------------

  /**
   * Kill any in-flight audio player immediately.
   * Called before starting a new playback and on interruption.
   */
  const killCurrentPlayer = useCallback(() => {
    if (currentPlayerRef.current) {
      try {
        currentPlayerRef.current.remove();
      } catch {
        // ignore — player may already be released
      }
      currentPlayerRef.current = null;
    }
    isDrainingRef.current = false;
  }, []);

  // -----------------------------------------------------------------------
  // Audio playback queue
  // -----------------------------------------------------------------------

  const drainPlaybackQueue = useCallback(async () => {
    // *** SYNCHRONOUS LOCK ***
    // This check-and-set MUST happen synchronously (no awaits above).
    // If isDraining is already true, another drain call is in-flight — bail.
    if (isDrainingRef.current) return;
    if (audioQueueRef.current.length < PLAYBACK_BUFFER_CHUNKS) return;

    // Set lock SYNCHRONOUSLY before any async work
    isDrainingRef.current = true;

    // Grab all buffered chunks and merge into one WAV
    const chunks = audioQueueRef.current.splice(
      0,
      audioQueueRef.current.length,
    );
    const merged = chunks.join("");

    try {
      // Kill any lingering player before creating a new one
      if (currentPlayerRef.current) {
        try {
          currentPlayerRef.current.remove();
        } catch {
          // ignore
        }
        currentPlayerRef.current = null;
      }

      const wavBytes = pcmToWav(merged, 24000, 1, 16);
      const wavBase64 = uint8ToBase64(wavBytes);
      const dataUri = `data:audio/wav;base64,${wavBase64}`;

      const player = createAudioPlayer(dataUri);
      currentPlayerRef.current = player;

      player.play();

      // Wait for playback to finish
      await new Promise<void>((resolve) => {
        const checkDone = setInterval(() => {
          if (!player.playing) {
            clearInterval(checkDone);
            resolve();
          }
        }, 30);

        // Safety timeout: max 10 seconds per chunk batch
        setTimeout(() => {
          clearInterval(checkDone);
          resolve();
        }, 10_000);
      });

      // Clean up this player
      try {
        player.remove();
      } catch {
        // ignore
      }
      if (currentPlayerRef.current === player) {
        currentPlayerRef.current = null;
      }
    } catch (err) {
      console.error("[useLiveVoice] playback error:", err);
    } finally {
      // Release lock so next drain can proceed
      isDrainingRef.current = false;
    }
  }, []);

  const startPlaybackDrain = useCallback(() => {
    if (playbackDrainRef.current) return;
    playbackDrainRef.current = setInterval(() => {
      void drainPlaybackQueue();
    }, PLAYBACK_DRAIN_INTERVAL_MS);
  }, [drainPlaybackQueue]);

  const stopPlaybackDrain = useCallback(() => {
    if (playbackDrainRef.current) {
      clearInterval(playbackDrainRef.current);
      playbackDrainRef.current = null;
    }
    audioQueueRef.current = [];

    // Ensure current player is killed on stop
    killCurrentPlayer();
  }, [killCurrentPlayer]);

  // -----------------------------------------------------------------------
  // Microphone
  // -----------------------------------------------------------------------

  const startMicrophone = useCallback((gen: number) => {
    try {
      if (!NATIVE_AVAILABLE) {
        throw new Error(
          "RNLiveAudioStream native module is not available. " +
            "Make sure you are running a custom development build (expo run:android / expo run:ios) " +
            "and not Expo Go.",
        );
      }

      // Prevent duplicate listeners
      if (micListenerActiveRef.current) {
        console.log(
          "[VoiceGate] mic listener already active — skipping duplicate init",
        );
        return;
      }

      LiveAudioStream.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        audioSource: Platform.OS === "android" ? 6 : undefined, // VOICE_RECOGNITION on Android
        wavFile: "live_audio.wav", // required by typings but not used for streaming
      });

      LiveAudioStream.on("data", (base64Pcm: string) => {
        // Guard: ignore data from stale session generation
        if (disposedRef.current || sessionGenRef.current !== gen) return;

        // *** MIC MUTE GATE ***
        // When the AI is speaking, do NOT send mic audio to Gemini.
        // The device speaker output can get picked up by the mic,
        // causing Gemini to interpret it as new user input and
        // generate a second overlapping response.
        if (micMutedRef.current) return;

        // Stream audio to Gemini
        sessionRef.current?.sendAudio(base64Pcm);
      });

      micListenerActiveRef.current = true;
      micMutedRef.current = false;

      LiveAudioStream.start();
      setIsMicActive(true);
      console.log("[VoiceGate] mic started, gen=", gen);
    } catch (err) {
      console.error("[useLiveVoice] mic start error:", err);
      setError("Hindi ma-access ang microphone.");
      setState("error");
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    try {
      LiveAudioStream.stop();
    } catch {
      // ignore
    }
    micListenerActiveRef.current = false;
    micMutedRef.current = false;
    setIsMicActive(false);
    console.log("[VoiceGate] mic stopped");
  }, []);

  // -----------------------------------------------------------------------
  // Session lifecycle
  // -----------------------------------------------------------------------

  const start = useCallback(async () => {
    if (disposedRef.current) {
      disposedRef.current = false;
    }

    // Bump generation so stale callbacks from any prior session are ignored
    const gen = ++sessionGenRef.current;
    console.log("[VoiceGate] start() called, gen=", gen);

    // If there's already a session running, tear it down first
    if (sessionRef.current) {
      console.log("[VoiceGate] tearing down existing session before restart");
      stopMicrophone();
      stopPlaybackDrain();
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }

    setError(null);
    setState("requesting_permissions");

    // Check native module availability first
    if (!NATIVE_AVAILABLE) {
      console.log("[Fallback] activated reason=native_unavailable");
      setError(
        "Voice mode ay hindi available sa build na ito. Gamitin ang chat.",
      );
      setState("error");
      return;
    }

    // Request audio permissions
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        console.log("[Fallback] activated reason=permissions");
        setError("Kailangan ng microphone permission para sa voice mode.");
        setState("error");
        return;
      }

      // Configure audio session for playback + recording
      await setAudioModeAsync({
        playsInSilentMode: true,
      });
    } catch (err) {
      console.error("[useLiveVoice] permission error:", err);
      console.log("[Fallback] activated reason=permissions");
      setError("Hindi ma-access ang audio permissions.");
      setState("error");
      return;
    }

    // Check generation — if another start() was called in the meantime, bail
    if (sessionGenRef.current !== gen) return;

    setState("connecting");

    // Create Gemini Live session
    const geminiSession = new GeminiLiveSession({
      systemInstruction:
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
        "ask where they are, how high the water is, if they're injured, and if they need rescue.",
      callbacks: {
        onSessionStateChange: (s: LiveSessionState) => {
          // Ignore callbacks from stale generation
          if (disposedRef.current || sessionGenRef.current !== gen) return;
          setSessionState(s);

          if (s === "connected") {
            setState("active");
            startMicrophone(gen);
            startPlaybackDrain();
          } else if (s === "error" || s === "disconnected") {
            stopMicrophone();
            stopPlaybackDrain();
            if (s === "error") {
              console.log("[Fallback] activated reason=connect_error");
              setState("error");
            } else {
              setState("disconnected");
            }
          } else if (s === "reconnecting") {
            setState("connecting");
          }
        },
        onTurnStateChange: (t: TurnState) => {
          if (disposedRef.current || sessionGenRef.current !== gen) return;
          setTurnState(t);

          // *** MIC MUTE/UNMUTE based on turn state ***
          // Mute mic when AI is speaking to prevent echo feedback.
          // Unmute when AI finishes and it's the user's turn to speak.
          if (t === "speaking") {
            micMutedRef.current = true;
            console.log("[VoiceGate] mic MUTED — AI is speaking");
          } else if (t === "listening") {
            micMutedRef.current = false;
            console.log("[VoiceGate] mic UNMUTED — user's turn");
          }
        },
        onAudioChunk: (chunk: LiveAudioChunk) => {
          if (disposedRef.current || sessionGenRef.current !== gen) return;
          audioQueueRef.current.push(chunk.data);
        },
        onInterrupted: () => {
          if (disposedRef.current || sessionGenRef.current !== gen) return;
          console.log("[LivePlayback] interrupted — flushing queue");
          // Kill current player + clear queue immediately
          audioQueueRef.current = [];
          killCurrentPlayer();
          stopPlaybackDrain();
          // Unmute mic — user interrupted, so it's their turn
          micMutedRef.current = false;
          startPlaybackDrain();
        },
        onError: (msg: string) => {
          if (disposedRef.current || sessionGenRef.current !== gen) return;
          setError(msg);
        },
        onModelTurnComplete: () => {
          if (sessionGenRef.current !== gen) return;
          // Flush remaining audio in the queue
          if (audioQueueRef.current.length > 0) {
            console.log(
              `[LivePlayback] turnComplete — flushing remaining ${audioQueueRef.current.length} chunks`,
            );
            void drainPlaybackQueue();
          }
        },
      },
    });

    sessionRef.current = geminiSession;

    try {
      await geminiSession.connect();
    } catch (err) {
      console.error("[useLiveVoice] connect error:", err);
      if (sessionGenRef.current === gen) {
        console.log("[Fallback] activated reason=connect_error");
        setError("Hindi maka-connect sa Gemini Live.");
        setState("error");
      }
    }
  }, [
    startMicrophone,
    stopMicrophone,
    startPlaybackDrain,
    stopPlaybackDrain,
    drainPlaybackQueue,
    killCurrentPlayer,
  ]);

  const stop = useCallback(() => {
    console.log("[VoiceGate] stop() called");
    disposedRef.current = true;
    // Bump generation to invalidate any in-flight callbacks
    sessionGenRef.current++;

    stopMicrophone();
    stopPlaybackDrain();

    if (sessionRef.current) {
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }

    setState("disconnected");
    setSessionState("disconnected");
    setTurnState("idle");
  }, [stopMicrophone, stopPlaybackDrain]);

  const sendText = useCallback((text: string) => {
    sessionRef.current?.sendText(text);
  }, []);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    disposedRef.current = false;
    // Capture ref value at effect time so cleanup doesn't read a stale ref
    const genAtMount = sessionGenRef.current;
    void genAtMount; // used to satisfy eslint; cleanup bumps via the ref

    return () => {
      disposedRef.current = true;
      // Bump generation to kill any stale callbacks
      sessionGenRef.current = genAtMount + 1;
      stopMicrophone();
      stopPlaybackDrain();

      if (sessionRef.current) {
        sessionRef.current.disconnect();
        sessionRef.current = null;
      }
    };
  }, [stopMicrophone, stopPlaybackDrain]);

  return {
    state,
    sessionState,
    turnState,
    isMicActive,
    error,
    isNativeAvailable: NATIVE_AVAILABLE,
    start,
    stop,
    sendText,
  };
}

type Language = "tl" | "ceb";

const LANG_PREFIXES: Record<Language, Record<string, string>> = {
  tl: {
    rerouting: "Nagre-reroute. Sandali lang.",
    arrived: "Nakarating ka na sa iyong destinasyon.",
    offRoute: "Lumihis ka sa ruta.",
    uncertainty: "Pinakamainam na ruta. I-verify ang kondisyon sa lugar.",
  },
  ceb: {
    rerouting: "Nag-reroute. Kadiyot lang.",
    arrived: "Nakaabot ka na sa imong destinasyon.",
    offRoute: "Nilihis ka sa ruta.",
    uncertainty: "Pinakamaayo nga ruta. I-verify ang kahimtang sa lugar.",
  },
};

type Urgency = "normal" | "warning" | "critical";

type VoiceQueueItem = {
  text: string;
  urgency: Urgency;
  timestamp: number;
};

const URGENCY_PRIORITY: Record<Urgency, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

const DEDUPE_WINDOW_MS = 5000;

let currentLanguage: Language = "tl";
let queue: VoiceQueueItem[] = [];
let speaking = false;

export function setVoiceLanguage(lang: Language) {
  currentLanguage = lang;
}

export function getLocalizedPhrase(key: string): string {
  return LANG_PREFIXES[currentLanguage]?.[key] ?? key;
}

function isDuplicate(text: string): boolean {
  const now = Date.now();
  return queue.some(
    (item) => item.text === text && now - item.timestamp < DEDUPE_WINDOW_MS,
  );
}

export function enqueueVoice(text: string, urgency: Urgency = "normal") {
  if (isDuplicate(text)) return;

  const item: VoiceQueueItem = { text, urgency, timestamp: Date.now() };

  queue.push(item);
  queue.sort(
    (a, b) => URGENCY_PRIORITY[b.urgency] - URGENCY_PRIORITY[a.urgency],
  );

  void processQueue();
}

async function processQueue() {
  if (speaking || queue.length === 0) return;
  speaking = true;

  const item = queue.shift();
  if (!item) {
    speaking = false;
    return;
  }

  try {
    // expo-audio TTS via speech synthesis API
    // On native, we use expo-speech if available, otherwise skip gracefully
    await speakText(item.text);
  } catch {
    // Voice unavailable — degrade silently
  } finally {
    speaking = false;
    if (queue.length > 0) void processQueue();
  }
}

async function speakText(text: string): Promise<void> {
  try {
    const Speech = await import("expo-speech");
    const langCode = currentLanguage === "tl" ? "fil-PH" : "ceb-PH";
    return new Promise<void>((resolve) => {
      Speech.speak(text, {
        language: langCode,
        onDone: resolve,
        onError: () => resolve(),
      });
    });
  } catch {
    // expo-speech not available — silent fallback
  }
}

export function clearVoiceQueue() {
  queue = [];
}

export function stopSpeaking() {
  queue = [];
  speaking = false;
  import("expo-speech").then((Speech) => Speech.stop()).catch(() => {});
}

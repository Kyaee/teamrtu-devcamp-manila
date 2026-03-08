import type {
  ChecklistItem,
  GeminiCenterChoice,
  GeminiCenterGuidance,
  GeminiRouteContext,
  GeminiTriggerEvent,
  HelpAssessment,
  UrgencyLevel,
} from "@/src/types/ai";
import type { EvacCenter } from "@/src/types/domain";

export type CenterRiskContext = {
  centerId: string;
  blocked: boolean;
  riskScore: number;
  shortReason: string;
};

export type RiskContext = {
  typhoonMode: boolean;
  centerAnnotations: CenterRiskContext[];
};

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Controlled pacing — adds a small intentional delay so the AI response
// feels more considered rather than instant low-quality one-liners.
// ---------------------------------------------------------------------------

const MIN_RESPONSE_DELAY_MS = 400;
const MAX_RESPONSE_DELAY_MS = 900;

function controlledDelay(): Promise<void> {
  const ms =
    MIN_RESPONSE_DELAY_MS +
    Math.random() * (MAX_RESPONSE_DELAY_MS - MIN_RESPONSE_DELAY_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Language detection helper
// ---------------------------------------------------------------------------

/**
 * Lightweight heuristic to detect Tagalog/Filipino vs English.
 * Returns a language hint for the AI prompt so it replies in the same language.
 */
export function detectLanguageHint(text: string): "en" | "fil" | "unknown" {
  const lower = text.toLowerCase();

  // Common Tagalog/Filipino markers
  const filMarkers = [
    "ako",
    "ko",
    "mo",
    "siya",
    "niya",
    "namin",
    "nila",
    "kami",
    "tayo",
    "ang",
    "mga",
    "sa",
    "ng",
    "na",
    "po",
    "opo",
    "hindi",
    "oo",
    "ito",
    "iyon",
    "dito",
    "doon",
    "meron",
    "wala",
    "paano",
    "nasaan",
    "bakit",
    "kasi",
    "dahil",
    "kailangan",
    "tulong",
    "baha",
    "tubig",
    "bahay",
    "pamilya",
    "anak",
    "nanay",
    "tatay",
    "kuya",
    "ate",
    "lagay",
    "taas",
    "gabi",
    "umaga",
    "ngayon",
    "kahapon",
    "bukas",
    "saan",
    "sino",
    "ano",
    "magkano",
    "punta",
    "pumunta",
    "takbo",
    "takot",
    "ligtas",
    "sugat",
    "gamot",
    "sakit",
    "ulan",
    "hangin",
    "lindol",
  ];

  const words = lower.split(/\s+/);
  let filCount = 0;
  for (const w of words) {
    if (filMarkers.includes(w)) filCount++;
  }

  const filRatio = filCount / Math.max(words.length, 1);
  if (filRatio >= 0.15) return "fil";
  if (filRatio < 0.05 && words.length >= 3) return "en";
  return "unknown";
}

// ---------------------------------------------------------------------------
// AI greeting (English first, per FR-1)
// ---------------------------------------------------------------------------

export const AI_GREETING_EN =
  "Hi, I'm here to help you request emergency assistance. " +
  "Tell me what's happening right now — are you in a flood, do you need rescue, or do you need supplies? " +
  "You can speak in English or Filipino, whichever is more comfortable.";

// ---------------------------------------------------------------------------
// Turn idempotency tracking (prevents duplicate AI replies — FR-4)
// ---------------------------------------------------------------------------

let _activeTurnId: string | null = null;

/**
 * Acquire a turn lock. Returns true if this turnId is now the active turn.
 * Returns false if another turn is already in progress (caller should abort).
 */
export function acquireTurnLock(turnId: string): boolean {
  if (_activeTurnId !== null && _activeTurnId !== turnId) {
    return false; // another turn is active
  }
  _activeTurnId = turnId;
  return true;
}

/** Release the turn lock so the next message can be processed. */
export function releaseTurnLock(turnId: string): void {
  if (_activeTurnId === turnId) {
    _activeTurnId = null;
  }
}

/** Check if a turn is still the active one (not superseded). */
export function isTurnActive(turnId: string): boolean {
  return _activeTurnId === turnId;
}

function hasApiKey(): boolean {
  return API_KEY.length > 0;
}

async function callGemini(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractJson(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in Gemini response");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

/**
 * Ask Gemini to choose the best evacuation center from nearby candidates.
 * Sends real GPS coordinates, distance data, and flood/drain risk context.
 * In typhoon mode, blocked centers are excluded from selection.
 * Falls back to nearest-by-distance if Gemini is unavailable or returns invalid.
 */
export async function chooseCenterFromCandidates(
  userLat: number,
  userLng: number,
  candidates: EvacCenter[],
  riskContext?: RiskContext,
): Promise<GeminiCenterChoice> {
  if (candidates.length === 0) {
    return {
      centerId: "",
      reason: "Walang nahanap na evacuation center malapit sa iyo.",
      isFallback: true,
    };
  }

  const safeCandidates = riskContext?.typhoonMode
    ? candidates.filter((c) => {
        const ann = riskContext.centerAnnotations.find(
          (a) => a.centerId === c.id,
        );
        return !ann?.blocked;
      })
    : candidates;

  if (safeCandidates.length === 0) {
    return {
      centerId: "",
      reason:
        "Lahat ng malapit na evacuation center ay naka-block dahil sa baha. Manatili sa ligtas na lugar.",
      isFallback: true,
    };
  }

  const nearest = safeCandidates[0];
  const fallback: GeminiCenterChoice = {
    centerId: nearest.id,
    reason: `Pinakamalapit na sentro: ${nearest.name} (${nearest.distanceKm.toFixed(1)} km).`,
    isFallback: true,
  };

  if (!hasApiKey()) return fallback;

  const annotations = riskContext?.centerAnnotations ?? [];

  const candidateList = safeCandidates
    .slice(0, 8)
    .map((c, i) => {
      const ann = annotations.find((a) => a.centerId === c.id);
      const riskInfo = ann
        ? ` | Risk: ${ann.riskScore}/100 (${ann.shortReason})`
        : "";
      return `${i + 1}. ID: "${c.id}" | Name: "${c.name}" | Type: ${c.barangay} | Distance: ${c.distanceKm.toFixed(2)} km | Status: ${c.status} | Address: ${c.address || "N/A"}${riskInfo}`;
    })
    .join("\n");

  const typhoonClause = riskContext?.typhoonMode
    ? "\nIMPORTANT: There is an active typhoon/heavy rain event. Prioritize SAFETY over distance. Avoid centers with high risk scores. Centers with confirmed flooding nearby have already been removed from this list."
    : "";

  const prompt = `You are an emergency flood evacuation assistant for Metro Manila, Philippines.
The user is at GPS coordinates: latitude ${userLat.toFixed(6)}, longitude ${userLng.toFixed(6)}.
These are the nearest potential evacuation shelters discovered via Google Maps and local databases:

${candidateList}
${typhoonClause}

Choose the BEST evacuation center for this user. Consider:
1. Distance (closer is better for flood emergencies)
2. Facility type (schools and government buildings are preferred shelters)
3. Status ("open" is preferred over "limited")
4. Suitability as an actual evacuation center (hospitals are good, malls are last resort)
5. Flood/drain risk near the center (lower risk score is better)

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation outside JSON):
{"centerId": "<exact id of chosen center>", "reason": "<1-2 sentence explanation in Filipino/Tagalog why this is the best choice>"}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = extractJson(raw);
    const chosenId = typeof parsed.centerId === "string" ? parsed.centerId : "";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    const isValid = safeCandidates.some((c) => c.id === chosenId);

    if (!isValid || !chosenId) return fallback;

    return { centerId: chosenId, reason, isFallback: false };
  } catch {
    return fallback;
  }
}

/**
 * Ask Gemini for contextual guidance text for a selected evacuation center.
 * Enriched with route distance/duration after route is fetched.
 */
export async function getCenterGuidance(
  center: EvacCenter,
  routeContext?: { distanceText: string; durationText: string },
): Promise<GeminiCenterGuidance> {
  const fallback: GeminiCenterGuidance = {
    summary: `Ang ${center.name} ay isang evacuation shelter${center.address ? ` sa ${center.address}` : ""}.`,
    preparation:
      "Magdala ng go-bag, valid ID, pagkain, at tubig para sa 3 araw.",
    routeCaution: routeContext
      ? `Ang ruta ay ${routeContext.distanceText} (${routeContext.durationText}). Mag-ingat sa baha at trapiko.`
      : null,
    isFallback: true,
  };

  if (!hasApiKey()) return fallback;

  const routeInfo = routeContext
    ? `Route: ${routeContext.distanceText}, estimated ${routeContext.durationText}.`
    : "Route not yet fetched.";

  const prompt = `You are an emergency flood evacuation assistant for Metro Manila.
The user is heading to this evacuation shelter:
Name: ${center.name}
Type: ${center.barangay}
Address: ${center.address || "Not available"}
Status: ${center.status}
Distance: ${center.distanceKm} km
${routeInfo}

Respond ONLY with valid JSON (no markdown):
{
  "summary": "<1 sentence why this is a good choice, in Filipino/Tagalog>",
  "preparation": "<1-2 sentences what to bring/prepare, in Filipino/Tagalog>",
  "routeCaution": "<1 sentence safety reminder about flooding, in Filipino/Tagalog, or null>"
}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = extractJson(raw);

    return {
      summary:
        typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      preparation:
        typeof parsed.preparation === "string"
          ? parsed.preparation
          : fallback.preparation,
      routeCaution:
        typeof parsed.routeCaution === "string"
          ? parsed.routeCaution
          : fallback.routeCaution,
      isFallback: false,
    };
  } catch {
    return fallback;
  }
}

/**
 * Ask Gemini for a brief verbal phrase at key navigation moments.
 * Non-blocking: callers should not await this if latency is a concern.
 */
export async function getRouteVerbalContext(
  destinationName: string,
  distanceText: string,
  durationText: string,
  triggerEvent: GeminiTriggerEvent,
): Promise<GeminiRouteContext> {
  const FALLBACK_PHRASES: Record<GeminiTriggerEvent, string> = {
    start: `Nagsisimula ng ruta patungo sa ${destinationName}. Distansya: ${distanceText}, ETA: ${durationText}. Maging maingat sa daan.`,
    reroute: `Nire-reroute patungo sa ${destinationName}. Mangyaring sundan ang bagong direksyon.`,
    offRoute: `Lumayo ka sa ruta. Mag-ingat at hintayin ang bagong direksyon.`,
  };

  if (!hasApiKey()) {
    return { phrase: FALLBACK_PHRASES[triggerEvent], isFallback: true };
  }

  const contextMap: Record<GeminiTriggerEvent, string> = {
    start: `The user is starting navigation to "${destinationName}". Distance: ${distanceText}, ETA: ${durationText}.`,
    reroute: `The user went off-route and is being rerouted to "${destinationName}".`,
    offRoute: `The user has strayed from the route to "${destinationName}".`,
  };

  const prompt = `You are an emergency navigation voice assistant for flood evacuation in Metro Manila.
Situation: ${contextMap[triggerEvent]}
Generate a short spoken phrase (1-2 sentences) in Filipino/Tagalog to tell the user now.
The phrase should be calm, clear, and actionable. Respond with the phrase only, no JSON, no quotes.`;

  try {
    const raw = await callGemini(prompt);
    const phrase = raw.replace(/^["']|["']$/g, "").trim();
    if (!phrase) {
      return { phrase: FALLBACK_PHRASES[triggerEvent], isFallback: true };
    }
    return { phrase, isFallback: false };
  } catch {
    return { phrase: FALLBACK_PHRASES[triggerEvent], isFallback: true };
  }
}

// ---------------------------------------------------------------------------
// Help Request Assessment
// ---------------------------------------------------------------------------

const VALID_URGENCY_LEVELS: UrgencyLevel[] = [
  "low",
  "medium",
  "high",
  "very_urgent",
];

const VALID_CATEGORIES = new Set([
  "documents",
  "food_water",
  "clothing",
  "medical",
  "electronics",
  "tools",
  "other",
]);

const FALLBACK_ASSESSMENT: HelpAssessment = {
  urgencyLevel: "medium",
  summary:
    "Hindi ma-evaluate ng AI ang sitwasyon. Maghanda na at pumunta sa pinakamalapit na evacuation center kung kinakailangan.",
  recommendedActions: [
    "Ihanda ang go-bag na may pagkain, tubig, at gamot.",
    "I-monitor ang weather updates.",
    "Kontakin ang barangay hotline para sa tulong.",
  ],
  checklistItems: [
    { label: "Pagkain (3 araw)", category: "food_water" },
    { label: "Tubig (3 litro/tao)", category: "food_water" },
    { label: "Gamot at first-aid kit", category: "medical" },
    { label: "Valid ID at documents", category: "documents" },
    { label: "Flashlight at battery", category: "electronics" },
    { label: "Extra damit", category: "clothing" },
  ],
  navigationIntent: true,
  destinationHint: null,
  isFallback: true,
};

function validateChecklistItems(raw: unknown[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const item of raw) {
    if (
      typeof item === "object" &&
      item !== null &&
      "label" in item &&
      "category" in item &&
      typeof (item as { label: unknown }).label === "string" &&
      typeof (item as { category: unknown }).category === "string" &&
      VALID_CATEGORIES.has((item as { category: string }).category)
    ) {
      items.push({
        label: (item as { label: string }).label,
        category: (item as { category: string })
          .category as ChecklistItem["category"],
      });
    }
  }
  return items;
}

export function buildConversationPrompt(
  messages: { role: "user" | "assistant"; text: string }[],
  userLat: number,
  userLng: number,
): string {
  const convoText = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  return `You are an emergency flood assistance AI for Metro Manila, Philippines.
Based on the conversation below, assess the user's situation.

User GPS: latitude ${userLat.toFixed(6)}, longitude ${userLng.toFixed(6)}

Conversation:
${convoText}

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{
  "urgencyLevel": "low" | "medium" | "high" | "very_urgent",
  "summary": "<1-2 sentence summary of the user's situation in Filipino/Tagalog>",
  "recommendedActions": ["<action 1>", "<action 2>", ...],
  "checklistItems": [
    {"label": "<item name in Filipino>", "category": "documents|food_water|clothing|medical|electronics|tools|other"},
    ...
  ],
  "navigationIntent": true/false,
  "destinationHint": "<suggested destination or null>"
}

Rules:
- urgencyLevel "very_urgent" = trapped, injured, rising water, immediate danger
- urgencyLevel "high" = flooding nearby, needs to evacuate soon
- urgencyLevel "medium" = potential flooding, should prepare
- urgencyLevel "low" = monitoring, no immediate threat
- checklistItems must have 4-10 items, categorized
- recommendedActions must have 2-5 items
- All text responses in Filipino/Tagalog`;
}

export async function assessHelpRequest(
  messages: { role: "user" | "assistant"; text: string }[],
  userLat: number,
  userLng: number,
): Promise<HelpAssessment> {
  if (!hasApiKey() || messages.length === 0) return FALLBACK_ASSESSMENT;

  const prompt = buildConversationPrompt(messages, userLat, userLng);

  try {
    const raw = await callGemini(prompt);
    const parsed = extractJson(raw);

    const urgencyLevel =
      typeof parsed.urgencyLevel === "string" &&
      VALID_URGENCY_LEVELS.includes(parsed.urgencyLevel as UrgencyLevel)
        ? (parsed.urgencyLevel as UrgencyLevel)
        : FALLBACK_ASSESSMENT.urgencyLevel;

    const summary =
      typeof parsed.summary === "string" && parsed.summary.length > 0
        ? parsed.summary
        : FALLBACK_ASSESSMENT.summary;

    const recommendedActions = Array.isArray(parsed.recommendedActions)
      ? (parsed.recommendedActions.filter(
          (a) => typeof a === "string" && a.length > 0,
        ) as string[])
      : FALLBACK_ASSESSMENT.recommendedActions;

    const checklistItems = Array.isArray(parsed.checklistItems)
      ? validateChecklistItems(parsed.checklistItems)
      : FALLBACK_ASSESSMENT.checklistItems;

    const navigationIntent =
      typeof parsed.navigationIntent === "boolean"
        ? parsed.navigationIntent
        : true;

    const destinationHint =
      typeof parsed.destinationHint === "string"
        ? parsed.destinationHint
        : null;

    if (recommendedActions.length < 2) {
      return { ...FALLBACK_ASSESSMENT, urgencyLevel };
    }
    if (checklistItems.length < 2) {
      return {
        ...FALLBACK_ASSESSMENT,
        urgencyLevel,
        summary,
        recommendedActions,
      };
    }

    return {
      urgencyLevel,
      summary,
      recommendedActions,
      checklistItems,
      navigationIntent,
      destinationHint,
      isFallback: false,
    };
  } catch {
    return FALLBACK_ASSESSMENT;
  }
}

/**
 * Generate an AI reply in the help conversation to guide the user
 * toward providing the information needed for urgency assessment.
 *
 * Enhancements (Opus spec):
 * - Detects user language and replies in kind (FR-2)
 * - Includes location context when available (FR-5)
 * - Adds controlled pacing delay for quality (FR-3)
 * - Turn-locked via idempotency key (FR-4) — caller must use acquireTurnLock
 */
export async function getHelpConversationReply(
  messages: { role: "user" | "assistant"; text: string }[],
  options?: {
    userLat?: number;
    userLng?: number;
    locationDescription?: string;
    turnId?: string;
  },
): Promise<string> {
  const fallback =
    "Thank you for the information. Can you describe more about your current situation? Are you in a flood or are you still safe?";

  if (!hasApiKey()) return fallback;

  // FR-4: Check turn lock (if turnId provided)
  if (options?.turnId && !isTurnActive(options.turnId)) {
    return ""; // stale turn — return empty to signal caller should discard
  }

  // FR-2: Detect language from latest user message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const langHint = lastUserMsg ? detectLanguageHint(lastUserMsg.text) : "en";

  const languageInstruction =
    langHint === "fil"
      ? "Respond in Filipino/Tagalog since the user is writing in Filipino."
      : langHint === "en"
        ? "Respond in English since the user is writing in English."
        : "Respond in the same language the user is using. If unsure, respond in English with a brief Filipino translation.";

  // FR-5: Location context
  const locationCtx =
    options?.userLat && options?.userLng
      ? `\nUser's current GPS: latitude ${options.userLat.toFixed(6)}, longitude ${options.userLng.toFixed(6)}.` +
        (options.locationDescription
          ? ` Location description: ${options.locationDescription}.`
          : "") +
        "\nUse this location to give relevant, specific suggestions (nearby landmarks, barangay context, flood-prone areas, nearest evacuation routes)."
      : "\nUser location is not available. Ask the user for their barangay or nearest landmark.";

  const convoText = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const prompt = `You are an emergency flood assistance AI for Metro Manila, Philippines.
You are having a conversation to assess the user's situation and help them get to safety.

${languageInstruction}
${locationCtx}

Conversation so far:
${convoText}

Generate a short reply (1-3 sentences) to:
1. Acknowledge what the user said
2. Ask a follow-up to assess their urgency (location, water level, injuries, if they need rescue)
3. If you know their location, suggest specific actionable next steps (nearest safe area, evacuation center direction, etc.)
4. Be calm, compassionate, and direct
5. If the user seems in immediate danger, strongly recommend marking their location as urgent

If you have enough information to assess (at least 2 user messages with substantive detail), say so and tell them you will now assess their situation.
Respond with the reply text only, no JSON, no quotes.`;

  try {
    // FR-3: Controlled pacing for quality perception
    const [raw] = await Promise.all([callGemini(prompt), controlledDelay()]);

    // FR-4: Re-check turn is still active after await
    if (options?.turnId && !isTurnActive(options.turnId)) {
      return "";
    }

    const cleaned = raw.replace(/^["']|["']$/g, "").trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Location-aware suggestion generator (FR-5)
// ---------------------------------------------------------------------------

/**
 * Generate location-aware suggestions based on user's GPS coordinates.
 * Used for the AI greeting or when location becomes available.
 */
export async function getLocationAwareSuggestions(
  userLat: number,
  userLng: number,
): Promise<string> {
  const fallback =
    "I can see your location. If you need help, tell me what's happening and I'll guide you to safety.";

  if (!hasApiKey()) return fallback;

  const prompt = `You are an emergency flood assistance AI for Metro Manila, Philippines.
The user is at GPS coordinates: latitude ${userLat.toFixed(6)}, longitude ${userLng.toFixed(6)}.

Based on this location in Metro Manila, generate a brief (2-3 sentences) English message that:
1. Acknowledges you can see their approximate location area
2. Mentions what they can do right now (check flood status, find evacuation centers, report flooding)
3. Asks them to describe their situation if they need help

Be calm and helpful. Respond with the message text only, no JSON, no quotes.`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/^["']|["']$/g, "").trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

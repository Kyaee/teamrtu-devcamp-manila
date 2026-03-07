import type {
  GeminiCenterChoice,
  GeminiCenterGuidance,
  GeminiRouteContext,
  GeminiTriggerEvent,
} from "@/src/types/ai";
import type { EvacCenter } from "@/src/types/domain";

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 10000;

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
 * Sends real GPS coordinates and distance data from Google Maps/Places.
 * Prioritizes proximity + open status + suitability as shelter.
 * Falls back to nearest-by-distance if Gemini is unavailable or returns invalid.
 */
export async function chooseCenterFromCandidates(
  userLat: number,
  userLng: number,
  candidates: EvacCenter[],
): Promise<GeminiCenterChoice> {
  if (candidates.length === 0) {
    return {
      centerId: "",
      reason: "Walang nahanap na evacuation center malapit sa iyo.",
      isFallback: true,
    };
  }

  const nearest = candidates[0];
  const fallback: GeminiCenterChoice = {
    centerId: nearest.id,
    reason: `Pinakamalapit na sentro: ${nearest.name} (${nearest.distanceKm.toFixed(1)} km).`,
    isFallback: true,
  };

  if (!hasApiKey()) return fallback;

  const candidateList = candidates
    .slice(0, 8)
    .map(
      (c, i) =>
        `${i + 1}. ID: "${c.id}" | Name: "${c.name}" | Type: ${c.barangay} | Distance: ${c.distanceKm.toFixed(2)} km | Status: ${c.status} | Address: ${c.address || "N/A"}`,
    )
    .join("\n");

  const prompt = `You are an emergency flood evacuation assistant for Metro Manila, Philippines.
The user is at GPS coordinates: latitude ${userLat.toFixed(6)}, longitude ${userLng.toFixed(6)}.
These are the nearest potential evacuation shelters discovered via Google Maps and local databases:

${candidateList}

Choose the BEST evacuation center for this user. Consider:
1. Distance (closer is better for flood emergencies)
2. Facility type (schools and government buildings are preferred shelters)
3. Status ("open" is preferred over "limited")
4. Suitability as an actual evacuation center (hospitals are good, malls are last resort)

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation outside JSON):
{"centerId": "<exact id of chosen center>", "reason": "<1-2 sentence explanation in Filipino/Tagalog why this is the best choice>"}`;

  try {
    const raw = await callGemini(prompt);
    const parsed = extractJson(raw);
    const chosenId = typeof parsed.centerId === "string" ? parsed.centerId : "";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    const isValid = candidates.some((c) => c.id === chosenId);

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

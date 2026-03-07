import axios from "axios";

import { readJson, writeJson } from "@/src/features/offline/storage";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const ROUTE_CACHE_KEY = "agos:cached-route";
const ROUTE_CACHE_PREFIX = "agos:route:";

export type MapsErrorReason = "NO_API_KEY" | "NETWORK_ERROR" | "API_ERROR";

export class MapsServiceError extends Error {
  reason: MapsErrorReason;
  constructor(reason: MapsErrorReason, message: string) {
    super(message);
    this.name = "MapsServiceError";
    this.reason = reason;
  }
}

export type LatLng = { latitude: number; longitude: number };

export type RouteStep = {
  instruction: string;
  distance: string;
  duration: string;
};

export type RouteResult = {
  polyline: LatLng[];
  distanceText: string;
  durationText: string;
  steps: RouteStep[];
  fetchedAt: string;
  fromLabel: string;
  toLabel: string;
};

/**
 * Decode a Google Maps encoded polyline string into an array of LatLng points.
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function routeCacheKey(to: LatLng): string {
  return `${ROUTE_CACHE_PREFIX}${to.latitude.toFixed(4)},${to.longitude.toFixed(4)}`;
}

export async function getRouteGuidance(
  from: LatLng,
  to: LatLng,
  fromLabel = "Current location",
  toLabel = "Evacuation center",
  mode: "walking" | "driving" = "walking",
): Promise<RouteResult> {
  if (!API_KEY) {
    throw new MapsServiceError(
      "NO_API_KEY",
      "Google Maps API key is not configured",
    );
  }

  try {
    const { data } = await axios.get(DIRECTIONS_URL, {
      params: {
        origin: `${from.latitude},${from.longitude}`,
        destination: `${to.latitude},${to.longitude}`,
        mode,
        key: API_KEY,
      },
      timeout: 15000,
    });

    if (data.status !== "OK" || !data.routes?.length) {
      throw new MapsServiceError(
        "API_ERROR",
        `Directions API error: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
      );
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const polyline = decodePolyline(route.overview_polyline.points);

    const steps: RouteStep[] = (leg.steps ?? []).map(
      (s: {
        html_instructions: string;
        distance: { text: string };
        duration: { text: string };
      }) => ({
        instruction: stripHtml(s.html_instructions),
        distance: s.distance.text,
        duration: s.duration.text,
      }),
    );

    const result: RouteResult = {
      polyline,
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      steps,
      fetchedAt: new Date().toISOString(),
      fromLabel,
      toLabel,
    };

    // Cache both globally and per-destination
    await Promise.all([
      writeJson(ROUTE_CACHE_KEY, result),
      writeJson(routeCacheKey(to), result),
    ]);
    return result;
  } catch (err) {
    if (err instanceof MapsServiceError) throw err;
    throw new MapsServiceError("NETWORK_ERROR", "Cannot reach Directions API");
  }
}

/**
 * Request multiple route alternatives from Google Directions API.
 * Returns up to 3 routes (Google's maximum for alternatives).
 */
export async function getRouteAlternatives(
  from: LatLng,
  to: LatLng,
  fromLabel = "Current location",
  toLabel = "Evacuation center",
  mode: "walking" | "driving" = "walking",
): Promise<RouteResult[]> {
  if (!API_KEY) {
    throw new MapsServiceError(
      "NO_API_KEY",
      "Google Maps API key is not configured",
    );
  }

  try {
    const { data } = await axios.get(DIRECTIONS_URL, {
      params: {
        origin: `${from.latitude},${from.longitude}`,
        destination: `${to.latitude},${to.longitude}`,
        mode,
        alternatives: true,
        key: API_KEY,
      },
      timeout: 15000,
    });

    if (data.status !== "OK" || !data.routes?.length) {
      throw new MapsServiceError(
        "API_ERROR",
        `Directions API error: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
      );
    }

    return data.routes.map(
      (route: {
        overview_polyline: { points: string };
        legs: {
          distance: { text: string };
          duration: { text: string };
          steps?: {
            html_instructions: string;
            distance: { text: string };
            duration: { text: string };
          }[];
        }[];
      }) => {
        const leg = route.legs[0];
        const polyline = decodePolyline(route.overview_polyline.points);
        const steps: RouteStep[] = (leg.steps ?? []).map(
          (s: {
            html_instructions: string;
            distance: { text: string };
            duration: { text: string };
          }) => ({
            instruction: stripHtml(s.html_instructions),
            distance: s.distance.text,
            duration: s.duration.text,
          }),
        );
        return {
          polyline,
          distanceText: leg.distance.text,
          durationText: leg.duration.text,
          steps,
          fetchedAt: new Date().toISOString(),
          fromLabel,
          toLabel,
        } satisfies RouteResult;
      },
    );
  } catch (err) {
    if (err instanceof MapsServiceError) throw err;
    throw new MapsServiceError("NETWORK_ERROR", "Cannot reach Directions API");
  }
}

export async function getCachedRoute(): Promise<RouteResult | null> {
  return readJson<RouteResult | null>(ROUTE_CACHE_KEY, null);
}

export async function getCachedRouteForDestination(
  to: LatLng,
): Promise<RouteResult | null> {
  const specific = await readJson<RouteResult | null>(routeCacheKey(to), null);
  if (specific) return specific;
  return getCachedRoute();
}

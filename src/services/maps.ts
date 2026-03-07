import axios from "axios";

import { readJson, writeJson } from "@/src/features/offline/storage";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const ROUTE_CACHE_KEY = "agos:cached-route";

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

export async function getRouteGuidance(
  from: LatLng,
  to: LatLng,
  fromLabel = "Current location",
  toLabel = "Evacuation center",
  mode: "walking" | "driving" = "walking",
): Promise<RouteResult> {
  const { data } = await axios.get(DIRECTIONS_URL, {
    params: {
      origin: `${from.latitude},${from.longitude}`,
      destination: `${to.latitude},${to.longitude}`,
      mode,
      key: API_KEY,
    },
  });

  if (data.status !== "OK" || !data.routes?.length) {
    throw new Error(`Directions API error: ${data.status}`);
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

  await writeJson(ROUTE_CACHE_KEY, result);
  return result;
}

export async function getCachedRoute(): Promise<RouteResult | null> {
  return readJson<RouteResult | null>(ROUTE_CACHE_KEY, null);
}

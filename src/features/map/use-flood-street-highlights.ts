import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";

import type { RouteOverlay } from "./MapDisplay";
import type { FloodCoverageEntry } from "./use-flood-coverage";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const CACHE_PREFIX = "agos:street-highlight:";

type LatLng = { latitude: number; longitude: number };

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

const HAZARD_POLYLINE_COLORS: Record<string, string> = {
  High: "#EF444499",
  MediumHigh: "#F9731699",
  Medium: "#EAB30899",
  Low: "#22C55E99",
};

function cacheKey(lat: number, lng: number): string {
  return `${CACHE_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function getStreetPolyline(
  lat: number,
  lng: number,
): Promise<LatLng[] | null> {
  if (!API_KEY) return null;

  const key = cacheKey(lat, lng);
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached) as LatLng[];
  } catch {
    /* continue */
  }

  const offset = 0.003;
  const origin = `${lat - offset},${lng - offset}`;
  const destination = `${lat + offset},${lng + offset}`;

  try {
    const { data } = await axios.get(
      "https://maps.googleapis.com/maps/api/directions/json",
      {
        params: {
          origin,
          destination,
          mode: "walking",
          key: API_KEY,
        },
        timeout: 10_000,
      },
    );

    if (data.status !== "OK" || !data.routes?.[0]) return null;

    const points = decodePolyline(data.routes[0].overview_polyline.points);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(points));
    } catch {
      /* non-critical */
    }

    return points;
  } catch {
    return null;
  }
}

export function useFloodStreetHighlights(
  entries: FloodCoverageEntry[],
): RouteOverlay[] {
  const [overlays, setOverlays] = useState<RouteOverlay[]>([]);

  const stableKey = useMemo(
    () => entries.map((e) => e.city).join(","),
    [entries],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results: RouteOverlay[] = [];

      const batchSize = 4;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const polylines = await Promise.all(
          batch.map((e) => getStreetPolyline(e.lat, e.lng)),
        );

        for (let j = 0; j < batch.length; j++) {
          const pts = polylines[j];
          if (!pts || pts.length < 2) continue;
          results.push({
            polyline: pts,
            color: HAZARD_POLYLINE_COLORS[batch[j].hazardLevel] ?? "#EF444499",
            width: 6,
          });
        }
      }

      if (!cancelled) setOverlays(results);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [stableKey, entries]);

  return overlays;
}

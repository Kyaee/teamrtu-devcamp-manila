import { useEffect, useMemo, useState } from "react";

import type { Severity } from "@/src/design/tokens";
import type { NearbyPlace } from "@/src/services/places";
import { searchNearbyShelters } from "@/src/services/places";
import type { FloodReport } from "@/src/types/domain";
import type { MapMarker } from "./MapDisplay";

const HIGH_RISK_SEVERITIES: Severity[] = ["LEAVE", "EVACUATE"];
const HIGH_DEPTH_LEVELS = new Set(["waist", "chest"]);
const NEARBY_RADIUS_DEG = 0.005; // ~500m in lat/lng

const SHELTER_PIN_COLORS: Record<string, string> = {
  school: "#1A1A1A",
  hospital: "#404040",
  shopping_mall: "#6B6B6B",
};

const SHELTER_LABELS: Record<string, string> = {
  school: "School (possible shelter)",
  hospital: "Hospital (possible shelter)",
  shopping_mall: "Mall (possible shelter)",
};

const SHELTER_LABELS_URGENT: Record<string, string> = {
  school: "School — go here for shelter",
  hospital: "Hospital — go here for shelter",
  shopping_mall: "Mall — go here for shelter",
};

function hasNearbyHighWater(
  lat: number,
  lng: number,
  floodReports: FloodReport[],
): boolean {
  return floodReports.some(
    (r) =>
      r.status === "confirmed" &&
      HIGH_DEPTH_LEVELS.has(r.depth) &&
      Math.abs(r.lat - lat) < NEARBY_RADIUS_DEG &&
      Math.abs(r.lng - lng) < NEARBY_RADIUS_DEG,
  );
}

export function useShelterMarkers(
  lat: number | undefined,
  lng: number | undefined,
  signal: Severity,
  floodReports: FloodReport[],
): MapMarker[] {
  const [shelters, setShelters] = useState<NearbyPlace[]>([]);

  useEffect(() => {
    if (!lat || !lng) return;

    let cancelled = false;
    searchNearbyShelters(lat, lng, 5000).then((results) => {
      if (!cancelled) setShelters(results);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return useMemo(() => {
    const isHighRisk = HIGH_RISK_SEVERITIES.includes(signal);
    const labels = isHighRisk ? SHELTER_LABELS_URGENT : SHELTER_LABELS;

    return shelters
      .filter((s) => !hasNearbyHighWater(s.latitude, s.longitude, floodReports))
      .map((s) => ({
        id: `shelter-${s.placeId}`,
        latitude: s.latitude,
        longitude: s.longitude,
        pinColor: isHighRisk
          ? "#22C55E"
          : (SHELTER_PIN_COLORS[s.shelterType] ?? "#6B6B6B"),
        opacity: isHighRisk ? 1 : 0.85,
        title: s.name,
        description: labels[s.shelterType] ?? "Possible shelter",
      }));
  }, [shelters, signal, floodReports]);
}

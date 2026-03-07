import type { Severity } from "@/src/design/tokens";
import type { RouteResult } from "@/src/services/maps";
import type { EvacCenter, FloodReport } from "@/src/types/domain";
import type { WeatherData } from "@/src/types/weather";

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  MONITOR: 0,
  PREPARE: 1,
  LEAVE: 2,
  EVACUATE: 3,
};

const HIGH_DEPTH_LEVELS = new Set(["waist", "chest"]);
const NEARBY_RADIUS_KM = 0.5;

function haversineDist(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function scoreWeatherRisk(
  signal: Severity,
  weather: WeatherData | null,
): { score: number; reason: string } {
  const base = SEVERITY_WEIGHTS[signal] * 25;
  if (!weather?.current) {
    return { score: base, reason: `Weather signal: ${signal} (no live data)` };
  }

  const qpf = weather.current.precipitation?.qpf?.quantity ?? 0;
  const precip = weather.current.precipitation?.probability?.percent ?? 0;
  const qpfBonus = Math.min(qpf * 2, 20);
  const precipBonus = precip > 70 ? 10 : 0;

  const total = base + qpfBonus + precipBonus;
  const reason =
    `Weather signal: ${signal}` +
    (qpf > 0 ? ` — ${qpf.toFixed(1)} mm/h rain` : "") +
    (precip > 70 ? `, ${precip}% probability` : "");

  return { score: Math.min(total, 100), reason };
}

export function scoreFloodReports(
  lat: number,
  lng: number,
  floodReports: FloodReport[],
): { score: number; reason: string } {
  const nearby = floodReports.filter(
    (r) => haversineDist(lat, lng, r.lat, r.lng) < NEARBY_RADIUS_KM,
  );

  const confirmedHigh = nearby.filter(
    (r) => r.status === "confirmed" && HIGH_DEPTH_LEVELS.has(r.depth),
  );
  const confirmedAny = nearby.filter((r) => r.status === "confirmed");

  let score = 0;
  if (confirmedHigh.length >= 3) score = 80;
  else if (confirmedHigh.length >= 1) score = 50;
  else if (confirmedAny.length >= 3) score = 30;
  else if (nearby.length > 0) score = 10;

  const reason =
    nearby.length === 0
      ? "No flood reports nearby"
      : `${confirmedAny.length} confirmed reports within 500m` +
        (confirmedHigh.length > 0
          ? ` (${confirmedHigh.length} waist/chest depth)`
          : "");

  return { score, reason };
}

export function scoreRouteRisk(
  route: RouteResult | null,
  floodReports: FloodReport[],
): { score: number; reason: string } {
  if (!route) {
    return {
      score: 50,
      reason: "No route available — cannot assess path safety",
    };
  }

  let hazardPoints = 0;
  for (const point of route.polyline) {
    const nearbyHigh = floodReports.some(
      (r) =>
        r.status === "confirmed" &&
        HIGH_DEPTH_LEVELS.has(r.depth) &&
        haversineDist(point.latitude, point.longitude, r.lat, r.lng) < 0.15,
    );
    if (nearbyHigh) hazardPoints++;
  }

  const hazardRatio =
    route.polyline.length > 0 ? hazardPoints / route.polyline.length : 0;
  const score = Math.min(Math.round(hazardRatio * 100), 100);
  const reason =
    hazardPoints === 0
      ? `Route appears clear (${route.distanceText}, ${route.durationText})`
      : `${hazardPoints} route points near confirmed high water`;

  return { score, reason };
}

export function scoreCenterReadiness(center: EvacCenter): {
  score: number;
  reason: string;
} {
  const statusScore = center.status === "open" ? 0 : 30;
  const distancePenalty = Math.min(center.distanceKm * 10, 50);

  const score = statusScore + distancePenalty;
  const reason =
    `${center.name}: ${center.status}` +
    ` — ${center.distanceKm.toFixed(1)} km away`;

  return { score: Math.min(score, 100), reason };
}

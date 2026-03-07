import type { Severity } from "@/src/design/tokens";
import type { DrainReport, FloodReport, ReportDepth } from "@/src/types/domain";

// ---------------------------------------------------------------------------
// Thresholds — tunable from one place
// ---------------------------------------------------------------------------

export const RISK_POLICY = {
  /** Minimum confirmed high-depth flood reports within radius to hard-block */
  floodBlockMinCount: 3,
  /** Radius (km) to scan for flood reports near a route point or center */
  floodProximityKm: 0.2,
  /** Depth levels considered dangerous enough to trigger a hard block */
  highDepthLevels: new Set<ReportDepth>(["waist", "chest"]),

  /** Drain report count within radius to start adding soft risk */
  drainSoftMinCount: 3,
  /** Radius (km) to scan for drain reports near a center */
  drainProximityKm: 0.3,
  /** Soft risk score added per drain cluster that meets threshold */
  drainSoftPenalty: 15,

  /** Time window for recent reports (hours) */
  reportRecencyHours: 24,
} as const;

// ---------------------------------------------------------------------------
// Severity ordering for typhoon-mode predicate
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = {
  MONITOR: 0,
  PREPARE: 1,
  LEAVE: 2,
  EVACUATE: 3,
};

export function isTyphoonMode(signal: Severity): boolean {
  return SEVERITY_ORDER[signal] >= SEVERITY_ORDER.PREPARE;
}

// ---------------------------------------------------------------------------
// Haversine helper (shared with scoring.ts — keep consistent)
// ---------------------------------------------------------------------------

export function haversineKm(
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

// ---------------------------------------------------------------------------
// Report freshness filter
// ---------------------------------------------------------------------------

function isRecent(createdAt: string): boolean {
  const age = Date.now() - new Date(createdAt).getTime();
  return age < RISK_POLICY.reportRecencyHours * 3600_000;
}

// ---------------------------------------------------------------------------
// Flood risk evidence for a single lat/lng point (center or route point)
// ---------------------------------------------------------------------------

export type FloodRiskEvidence = {
  confirmedHighCount: number;
  confirmedAnyCount: number;
  blocked: boolean;
  reason: string;
};

export function evaluateFloodRisk(
  lat: number,
  lng: number,
  floodReports: FloodReport[],
  typhoonActive: boolean,
): FloodRiskEvidence {
  const nearby = floodReports.filter(
    (r) =>
      isRecent(r.createdAt) &&
      haversineKm(lat, lng, r.lat, r.lng) < RISK_POLICY.floodProximityKm,
  );

  const confirmedHigh = nearby.filter(
    (r) => r.status === "confirmed" && RISK_POLICY.highDepthLevels.has(r.depth),
  );
  const confirmedAny = nearby.filter((r) => r.status === "confirmed");

  const blocked =
    typhoonActive && confirmedHigh.length >= RISK_POLICY.floodBlockMinCount;

  const reason = blocked
    ? `BLOCKED: ${confirmedHigh.length} confirmed high-depth reports within ${RISK_POLICY.floodProximityKm * 1000}m`
    : confirmedAny.length > 0
      ? `${confirmedAny.length} confirmed flood reports nearby (${confirmedHigh.length} high-depth)`
      : "No flood reports nearby";

  return {
    confirmedHighCount: confirmedHigh.length,
    confirmedAnyCount: confirmedAny.length,
    blocked,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Drain risk evidence for a single lat/lng point
// ---------------------------------------------------------------------------

export type DrainRiskEvidence = {
  nearbyCount: number;
  softPenalty: number;
  reason: string;
};

export function evaluateDrainRisk(
  lat: number,
  lng: number,
  drainReports: DrainReport[],
): DrainRiskEvidence {
  const nearby = drainReports.filter(
    (r) =>
      isRecent(r.createdAt) &&
      haversineKm(lat, lng, r.lat, r.lng) < RISK_POLICY.drainProximityKm,
  );

  const meetsThreshold = nearby.length >= RISK_POLICY.drainSoftMinCount;
  const softPenalty = meetsThreshold ? RISK_POLICY.drainSoftPenalty : 0;

  const reason =
    nearby.length === 0
      ? "No drain reports nearby"
      : `${nearby.length} drain reports within ${RISK_POLICY.drainProximityKm * 1000}m` +
        (meetsThreshold ? " — elevated flood risk from clogged drains" : "");

  return { nearbyCount: nearby.length, softPenalty, reason };
}

// ---------------------------------------------------------------------------
// Combined center risk annotation (used by engine + Gemini prompt)
// ---------------------------------------------------------------------------

export type CenterRiskAnnotation = {
  centerId: string;
  flood: FloodRiskEvidence;
  drain: DrainRiskEvidence;
  blocked: boolean;
  riskScore: number;
  shortReason: string;
};

export function annotateCenterRisk(
  centerId: string,
  centerLat: number,
  centerLng: number,
  floodReports: FloodReport[],
  drainReports: DrainReport[],
  typhoonActive: boolean,
): CenterRiskAnnotation {
  const flood = evaluateFloodRisk(
    centerLat,
    centerLng,
    floodReports,
    typhoonActive,
  );
  const drain = evaluateDrainRisk(centerLat, centerLng, drainReports);

  let riskScore = 0;
  if (flood.confirmedHighCount >= 3) riskScore += 80;
  else if (flood.confirmedHighCount >= 1) riskScore += 50;
  else if (flood.confirmedAnyCount >= 3) riskScore += 30;
  else if (flood.confirmedAnyCount > 0) riskScore += 10;
  riskScore += drain.softPenalty;
  riskScore = Math.min(riskScore, 100);

  const parts: string[] = [];
  if (flood.blocked) parts.push("Flooded area (blocked)");
  else if (flood.confirmedAnyCount > 0)
    parts.push(`${flood.confirmedAnyCount} flood reports`);
  if (drain.nearbyCount > 0) parts.push(`${drain.nearbyCount} drain reports`);

  const shortReason =
    parts.length > 0 ? parts.join("; ") : "No nearby hazard reports";

  return {
    centerId,
    flood,
    drain,
    blocked: flood.blocked,
    riskScore,
    shortReason,
  };
}

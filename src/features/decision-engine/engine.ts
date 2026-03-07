import type { Severity } from "@/src/design/tokens";
import { getRouteGuidance, type RouteResult } from "@/src/services/maps";

import { isTyphoonMode, annotateCenterRisk } from "./risk-policy";
import {
  evaluateRouteBlock,
  scoreCenterReadiness,
  scoreFloodReports,
  scoreRouteRisk,
  scoreWeatherRisk,
} from "./scoring";
import type {
  CenterEvaluation,
  DecisionInput,
  DecisionOutcome,
  GlobalAction,
} from "./types";

const ACTION_MAP: Record<Severity, GlobalAction> = {
  MONITOR: "STAY_MONITOR",
  PREPARE: "PREPARE_GO_BAG",
  LEAVE: "LEAVE_NOW",
  EVACUATE: "EVACUATE_NOW",
};

const MAX_CENTERS_TO_EVALUATE = 5;

function deriveGlobalAction(
  weatherScore: number,
  reportScore: number,
  signal: Severity,
): GlobalAction {
  const combined = weatherScore * 0.5 + reportScore * 0.5;

  if (combined >= 70 || signal === "EVACUATE") return "EVACUATE_NOW";
  if (combined >= 45 || signal === "LEAVE") return "LEAVE_NOW";
  if (combined >= 25 || signal === "PREPARE") return "PREPARE_GO_BAG";
  return ACTION_MAP[signal];
}

function deriveConfidence(
  weatherScore: number,
  reportScore: number,
  hasRoute: boolean,
): number {
  let base = 0.5;
  if (weatherScore > 0) base += 0.2;
  if (reportScore > 0) base += 0.2;
  if (hasRoute) base += 0.1;
  return Math.min(base, 1);
}

export async function buildEvacuationDecision(
  input: DecisionInput,
): Promise<DecisionOutcome> {
  const { userLocation, weather, signal, floodReports, drainReports, centers } =
    input;

  const typhoonActive = isTyphoonMode(signal);

  const { score: weatherScore, reason: weatherReason } = scoreWeatherRisk(
    signal,
    weather,
  );
  const { score: reportScore, reason: reportReason } = scoreFloodReports(
    userLocation.latitude,
    userLocation.longitude,
    floodReports,
  );

  const globalAction = deriveGlobalAction(weatherScore, reportScore, signal);

  const candidateCenters = centers.slice(0, MAX_CENTERS_TO_EVALUATE);

  // -----------------------------------------------------------------------
  // Phase 1: Score all centers WITHOUT route calls (instant, no API cost).
  // We rank by center readiness (distance + status) and flood/drain risk.
  // -----------------------------------------------------------------------
  const evaluations: CenterEvaluation[] = [];
  for (const center of candidateCenters) {
    const centerRisk = annotateCenterRisk(
      center.id,
      center.lat,
      center.lng,
      floodReports,
      drainReports,
      typhoonActive,
    );

    const { score: readinessScore, reason: centerReason } =
      scoreCenterReadiness(center);

    const drainPenalty = centerRisk.drain.softPenalty;
    // Without a route, routeRiskScore = 50 ("no route available").
    // Readiness (distance) dominates the ranking — nearest wins.
    const compositeScore = 50 * 0.4 + readinessScore * 0.6 + drainPenalty;

    const blocked = centerRisk.blocked;

    const riskLevel: Severity =
      blocked || compositeScore >= 60
        ? "EVACUATE"
        : compositeScore >= 40
          ? "LEAVE"
          : compositeScore >= 20
            ? "PREPARE"
            : "MONITOR";

    const reasons = [centerReason];
    if (blocked) reasons.unshift(centerRisk.shortReason);
    if (drainPenalty > 0) reasons.push(centerRisk.drain.reason);

    evaluations.push({
      center,
      route: null,
      score: blocked ? 999 : Math.min(compositeScore, 100),
      riskLevel,
      reasons,
      blocked,
    });
  }

  evaluations.sort((a, b) => a.score - b.score);

  let recommended = typhoonActive
    ? evaluations.filter((e) => !e.blocked)
    : evaluations;

  // If all nearby centers are blocked, prefer the nearest by distance.
  if (recommended.length === 0 && evaluations.length > 0) {
    recommended = [...evaluations].sort(
      (a, b) => a.center.distanceKm - b.center.distanceKm,
    );
  }

  // -----------------------------------------------------------------------
  // Phase 2: Fetch a route ONLY for the top recommended center.
  // This keeps the decision fast (1 API call instead of 5-10).
  // -----------------------------------------------------------------------
  const best = recommended[0];
  if (best) {
    try {
      const route = await getRouteGuidance(
        userLocation,
        { latitude: best.center.lat, longitude: best.center.lng },
        "Kasalukuyang lokasyon",
        best.center.name,
      );

      best.route = route;

      // Re-evaluate route blocking for the chosen route
      const routeBlock = evaluateRouteBlock(route, floodReports, typhoonActive);
      const { score: routeRiskScore, reason: routeReason } = scoreRouteRisk(
        route,
        floodReports,
      );

      best.reasons.unshift(routeReason);
      if (routeBlock.blocked) {
        best.reasons.unshift(routeBlock.reason);
        best.blocked = true;
      }

      // Update composite score now that we have route data
      const { score: readinessScore } = scoreCenterReadiness(best.center);
      const centerRisk = annotateCenterRisk(
        best.center.id,
        best.center.lat,
        best.center.lng,
        floodReports,
        drainReports,
        typhoonActive,
      );
      best.score = routeBlock.blocked
        ? 999
        : Math.min(
            routeRiskScore * 0.4 +
              readinessScore * 0.6 +
              centerRisk.drain.softPenalty,
            100,
          );
    } catch {
      // Route unavailable — center is still recommended, navigate screen
      // will fetch its own route independently.
    }
  }

  const hasAnyRoute = recommended.some((e) => e.route !== null);
  const confidence = deriveConfidence(weatherScore, reportScore, hasAnyRoute);

  const bestRoute = recommended[0]?.route;
  const routeReason = bestRoute
    ? `Best route: ${bestRoute.distanceText}, ${bestRoute.durationText}`
    : recommended.length === 0
      ? "Lahat ng ruta ay naka-block dahil sa baha. Hintayin ang update."
      : "Route will be fetched when navigation starts";

  return {
    globalAction,
    recommendedCenters: recommended.length > 0 ? recommended : evaluations,
    confidence,
    explainability: {
      weatherReason,
      reportReason,
      routeReason,
    },
    disclaimerText:
      recommended.length === 0 && typhoonActive
        ? "WARNING: Lahat ng ruta ay may confirmed flood reports. Manatili sa ligtas na lugar habang hinihintay ang bagong assessment."
        : "Ito ay rekomendasyon lamang. Palaging i-verify ang kondisyon sa lugar. Hindi guaranteed safe ang anumang ruta.",
  };
}

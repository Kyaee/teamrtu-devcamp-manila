import type { Severity } from "@/src/design/tokens";
import {
  getRouteGuidance,
  getRouteAlternatives,
  type RouteResult,
} from "@/src/services/maps";

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

    let route: RouteResult | null = null;
    let routeBlock = evaluateRouteBlock(null, floodReports, typhoonActive);

    try {
      if (typhoonActive && floodReports.length > 0) {
        // Request alternatives so we can pick a non-blocked route
        const alternatives = await getRouteAlternatives(
          userLocation,
          { latitude: center.lat, longitude: center.lng },
          "Kasalukuyang lokasyon",
          center.name,
        );

        // Evaluate each alternative and pick the first non-blocked route
        let bestNonBlocked: RouteResult | null = null;
        let bestBlock = evaluateRouteBlock(null, floodReports, typhoonActive);

        for (const alt of alternatives) {
          const block = evaluateRouteBlock(alt, floodReports, typhoonActive);
          if (!block.blocked) {
            bestNonBlocked = alt;
            bestBlock = block;
            break;
          }
          // Track least-hazardous blocked route as fallback
          if (!route || block.hazardPoints < routeBlock.hazardPoints) {
            route = alt;
            routeBlock = block;
          }
        }

        if (bestNonBlocked) {
          route = bestNonBlocked;
          routeBlock = bestBlock;
        }
      } else {
        route = await getRouteGuidance(
          userLocation,
          { latitude: center.lat, longitude: center.lng },
          "Kasalukuyang lokasyon",
          center.name,
        );
        routeBlock = evaluateRouteBlock(route, floodReports, typhoonActive);
      }
    } catch {
      // route unavailable — continue with null
    }

    const { score: routeRiskScore, reason: routeReason } = scoreRouteRisk(
      route,
      floodReports,
    );
    const { score: readinessScore, reason: centerReason } =
      scoreCenterReadiness(center);

    const drainPenalty = centerRisk.drain.softPenalty;
    const compositeScore =
      routeRiskScore * 0.4 + readinessScore * 0.6 + drainPenalty;

    const blocked = centerRisk.blocked || routeBlock.blocked;

    const riskLevel: Severity =
      blocked || compositeScore >= 60
        ? "EVACUATE"
        : compositeScore >= 40
          ? "LEAVE"
          : compositeScore >= 20
            ? "PREPARE"
            : "MONITOR";

    const reasons = [routeReason, centerReason];
    if (blocked) reasons.unshift(centerRisk.shortReason);
    if (routeBlock.blocked) reasons.unshift(routeBlock.reason);
    if (drainPenalty > 0) reasons.push(centerRisk.drain.reason);

    evaluations.push({
      center,
      route,
      score: blocked ? 999 : Math.min(compositeScore, 100),
      riskLevel,
      reasons,
      blocked,
    });
  }

  evaluations.sort((a, b) => a.score - b.score);

  const recommended = typhoonActive
    ? evaluations.filter((e) => !e.blocked)
    : evaluations;

  const hasAnyRoute = recommended.some((e) => e.route !== null);
  const confidence = deriveConfidence(weatherScore, reportScore, hasAnyRoute);

  const bestRoute = recommended[0]?.route;
  const routeReason = bestRoute
    ? `Best route: ${bestRoute.distanceText}, ${bestRoute.durationText}`
    : recommended.length === 0
      ? "Lahat ng ruta ay naka-block dahil sa baha. Hintayin ang update."
      : "No route currently available";

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

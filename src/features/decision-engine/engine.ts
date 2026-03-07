import type { Severity } from "@/src/design/tokens";
import { getRouteGuidance, type RouteResult } from "@/src/services/maps";

import {
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
  const { userLocation, weather, signal, floodReports, centers } = input;

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
    let route: RouteResult | null = null;
    try {
      route = await getRouteGuidance(
        userLocation,
        { latitude: center.lat, longitude: center.lng },
        "Kasalukuyang lokasyon",
        center.name,
      );
    } catch {
      // route unavailable — continue with null
    }

    const { score: routeRisk, reason: routeReason } = scoreRouteRisk(
      route,
      floodReports,
    );
    const { score: centerRisk, reason: centerReason } =
      scoreCenterReadiness(center);

    const compositeScore = routeRisk * 0.4 + centerRisk * 0.6;

    const riskLevel: Severity =
      compositeScore >= 60
        ? "EVACUATE"
        : compositeScore >= 40
          ? "LEAVE"
          : compositeScore >= 20
            ? "PREPARE"
            : "MONITOR";

    evaluations.push({
      center,
      route,
      score: compositeScore,
      riskLevel,
      reasons: [routeReason, centerReason],
    });
  }

  evaluations.sort((a, b) => a.score - b.score);

  const hasAnyRoute = evaluations.some((e) => e.route !== null);
  const confidence = deriveConfidence(weatherScore, reportScore, hasAnyRoute);

  const bestRoute = evaluations[0]?.route;
  const routeReason = bestRoute
    ? `Best route: ${bestRoute.distanceText}, ${bestRoute.durationText}`
    : "No route currently available";

  return {
    globalAction,
    recommendedCenters: evaluations,
    confidence,
    explainability: {
      weatherReason,
      reportReason,
      routeReason,
    },
    disclaimerText:
      "Ito ay rekomendasyon lamang. Palaging i-verify ang kondisyon sa lugar. Hindi guaranteed safe ang anumang ruta.",
  };
}

import type { Severity } from "@/src/design/tokens";
import { getRouteGuidance } from "@/src/services/maps";

import { annotateCenterRisk, isTyphoonMode } from "./risk-policy";
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
  // Phase 2: Fetch routes for the top 3 recommended centers sequentially.
  // Evaluate each route against flood pins and mark flooded ones so the UI
  // can show red route lines.
  // -----------------------------------------------------------------------
  const ROUTE_FETCH_COUNT = 3;
  const topPicks = recommended.slice(0, ROUTE_FETCH_COUNT);

  let routeFetched = false;
  for (const pick of topPicks) {
    try {
      const route = await getRouteGuidance(
        userLocation,
        { latitude: pick.center.lat, longitude: pick.center.lng },
        "Current location",
        pick.center.name,
      );

      pick.route = route;

      const routeBlock = evaluateRouteBlock(route, floodReports, typhoonActive);
      const { score: routeRiskScore, reason: routeReason } = scoreRouteRisk(
        route,
        floodReports,
      );

      pick.reasons.unshift(routeReason);

      // Mark flooded when ANY hazard points are detected along the route,
      // regardless of typhoon mode. This drives the red route color in the UI.
      if (routeBlock.hazardPoints > 0) {
        pick.flooded = true;
      }

      if (routeBlock.blocked) {
        pick.reasons.unshift(
          `⚠ FLOODED: ${routeBlock.reason.replace("Route BLOCKED: ", "")}`,
        );
      }

      // Update composite score with real route data
      const { score: readinessScore } = scoreCenterReadiness(pick.center);
      const cRisk = annotateCenterRisk(
        pick.center.id,
        pick.center.lat,
        pick.center.lng,
        floodReports,
        drainReports,
        typhoonActive,
      );
      pick.score = Math.min(
        routeRiskScore * 0.4 + readinessScore * 0.6 + cRisk.drain.softPenalty,
        100,
      );
      routeFetched = true;
    } catch (err) {
      console.warn(
        "[DecisionEngine] Route fetch failed for",
        pick.center.name,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // NOTE: We do NOT re-sort here. The recommended list preserves its original
  // distance-based ranking. The UI uses `navTarget` (first non-flooded center)
  // to decide which center the navigate button points to.

  const hasAnyRoute = routeFetched || recommended.some((e) => e.route !== null);
  const confidence = deriveConfidence(weatherScore, reportScore, hasAnyRoute);

  const top3 = recommended.slice(0, 3);
  const allFlooded = top3.length > 0 && top3.every((e) => e.flooded);
  const bestPick = top3.find((e) => !e.flooded) ?? top3[0];
  const bestRoute = bestPick?.route;
  const routeReason = bestRoute
    ? allFlooded
      ? `All routes pass through flooded areas. Nearest: ${bestRoute.distanceText}, ${bestRoute.durationText}`
      : `Best route: ${bestRoute.distanceText}, ${bestRoute.durationText}`
    : recommended.length === 0
      ? "All routes are blocked due to flooding. Wait for updates."
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
        ? "WARNING: All routes have confirmed flood reports. Stay in a safe place while waiting for a new assessment."
        : "This is a recommendation only. Always verify conditions on site. No route is guaranteed safe.",
  };
}

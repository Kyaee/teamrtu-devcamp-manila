import type { Severity } from "@/src/design/tokens";
import type { LatLng, RouteResult } from "@/src/services/maps";
import {
  getRouteAlternatives,
  getRouteGuidance,
  getCachedRouteForDestination,
} from "@/src/services/maps";
import type { FloodReport } from "@/src/types/domain";

import { evaluateRouteBlock } from "@/src/features/decision-engine/scoring";
import { isTyphoonMode } from "@/src/features/decision-engine/risk-policy";

export type FloodSafeResult = {
  route: RouteResult;
  allBlocked: boolean;
  warning: string | null;
};

/**
 * Get the safest route to a destination by requesting alternatives from Google
 * and picking the first route that isn't blocked by flood reports.
 *
 * Falls back to the least-hazardous route if all alternatives are blocked.
 */
export async function getFloodSafeRoute(
  from: LatLng,
  to: LatLng,
  floodReports: FloodReport[],
  signal: Severity,
  fromLabel = "Kasalukuyang lokasyon",
  toLabel = "Evacuation center",
): Promise<FloodSafeResult> {
  const typhoonActive = isTyphoonMode(signal);

  let routes: RouteResult[];
  try {
    routes = await getRouteAlternatives(from, to, fromLabel, toLabel);
  } catch {
    // If alternatives fail, fall back to single route
    try {
      const single = await getRouteGuidance(from, to, fromLabel, toLabel);
      routes = [single];
    } catch {
      const cached = await getCachedRouteForDestination(to);
      if (cached) routes = [cached];
      else throw new Error("No route available");
    }
  }

  if (!typhoonActive || floodReports.length === 0) {
    return { route: routes[0], allBlocked: false, warning: null };
  }

  // Evaluate each route against flood data
  const evaluated = routes.map((route) => ({
    route,
    block: evaluateRouteBlock(route, floodReports, typhoonActive),
  }));

  // Pick first non-blocked route
  const safe = evaluated.find((e) => !e.block.blocked);
  if (safe) {
    const warning =
      safe.block.hazardPoints > 0
        ? `Route may pass near flooded areas. ${safe.block.hazardPoints} points near high water.`
        : null;
    return { route: safe.route, allBlocked: false, warning };
  }

  // All routes blocked — pick the one with fewest hazard points
  evaluated.sort((a, b) => a.block.hazardPoints - b.block.hazardPoints);
  const least = evaluated[0];
  return {
    route: least.route,
    allBlocked: true,
    warning:
      "BABALA: Lahat ng ruta ay dumadaan sa may baha. Mag-ingat at i-verify ang kondisyon sa lugar.",
  };
}

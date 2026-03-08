import type { Severity } from "@/src/design/tokens";
import type { LatLng, RouteResult } from "@/src/services/maps";
import {
  getCachedRouteForDestination,
  getRouteGuidance,
} from "@/src/services/maps";
import type { FloodReport } from "@/src/types/domain";

import { isTyphoonMode } from "@/src/features/decision-engine/risk-policy";
import { evaluateRouteBlock } from "@/src/features/decision-engine/scoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FloodSafeResult = {
  route: RouteResult;
  /** True when the route passes through a flooded area. */
  flooded: boolean;
  warning: string | null;
};

// ---------------------------------------------------------------------------
// Simple single-destination route with flood evaluation
// ---------------------------------------------------------------------------

/**
 * Fetch a route to the destination and evaluate it against flood reports.
 *
 * The route is ALWAYS returned — it is never discarded. If the route
 * passes through flood pins, `flooded` is set to true so the UI can
 * show a red route line and a "Flooded" label instead of blocking.
 */
export async function getFloodSafeRoute(
  from: LatLng,
  to: LatLng,
  floodReports: FloodReport[],
  signal: Severity,
  fromLabel = "Current location",
  toLabel = "Evacuation center",
): Promise<FloodSafeResult> {
  const typhoonActive = isTyphoonMode(signal);

  let route: RouteResult;
  try {
    route = await getRouteGuidance(from, to, fromLabel, toLabel);
  } catch {
    const cached = await getCachedRouteForDestination(to);
    if (cached) {
      route = cached;
    } else {
      throw new Error("No route available");
    }
  }

  // No flood data — route is fine
  if (floodReports.length === 0) {
    return { route, flooded: false, warning: null };
  }

  // Evaluate route against flood pins (always check, regardless of typhoon mode)
  const block = evaluateRouteBlock(route, floodReports, typhoonActive);

  if (block.blocked) {
    return {
      route,
      flooded: true,
      warning:
        "WARNING: Route passes through flooded area. Stay alert and verify conditions on site.",
    };
  }

  // Mark flooded when ANY hazard points detected along the route
  if (block.hazardPoints > 0) {
    return {
      route,
      flooded: true,
      warning: `Route may pass near flooded areas. ${block.hazardPoints} points near high water.`,
    };
  }

  return { route, flooded: false, warning: null };
}

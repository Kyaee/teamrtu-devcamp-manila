/**
 * Evacuation Cache — persists the startup evacuation assessment + primary
 * route directions into AsyncStorage so the Actions tab can display them
 * even when the device goes offline.
 */
import type { DecisionOutcome } from "@/src/features/decision-engine/types";
import type { RouteResult } from "@/src/services/maps";

import { readJson, writeJson } from "./storage";

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------
const EVAC_DECISION_KEY = "agos:evac-decision";
const EVAC_ROUTE_KEY = "agos:evac-primary-route";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type CachedEvacuation = {
  decision: DecisionOutcome;
  primaryRoute: RouteResult | null;
  /** Center name for the primary route target */
  primaryCenterName: string;
  primaryCenterDistance: string;
  cachedAt: string;
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
export async function cacheEvacuation(data: CachedEvacuation): Promise<void> {
  await writeJson(EVAC_DECISION_KEY, data);
}

export async function cachePrimaryRoute(route: RouteResult): Promise<void> {
  await writeJson(EVAC_ROUTE_KEY, route);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function getCachedEvacuation(): Promise<CachedEvacuation | null> {
  return readJson<CachedEvacuation | null>(EVAC_DECISION_KEY, null);
}

export async function getCachedPrimaryRoute(): Promise<RouteResult | null> {
  return readJson<RouteResult | null>(EVAC_ROUTE_KEY, null);
}

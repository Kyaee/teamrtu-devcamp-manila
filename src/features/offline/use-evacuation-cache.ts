/**
 * useEvacuationCache — runs the decision engine + route fetch once at startup
 * (when online) and persists the result so the Actions tab has evacuation
 * directions available offline.
 *
 * Consumers get:
 *  - cached  : CachedEvacuation | null
 *  - loading  : boolean
 *  - fromCache: boolean (true if data was loaded from AsyncStorage, not fresh)
 *  - refresh  : () => void
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { buildEvacuationDecision } from "@/src/features/decision-engine/engine";
import type { DecisionOutcome } from "@/src/features/decision-engine/types";
import { useAlerts } from "@/src/features/alerts/use-alerts";
import { useWeatherSignal } from "@/src/features/alerts/use-weather-signal";
import { useCenters } from "@/src/features/centers/use-centers";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { getRouteGuidance, type RouteResult } from "@/src/services/maps";
import type { EvacCenter } from "@/src/types/domain";

import type { CachedEvacuation } from "./evacuation-cache";
import { cacheEvacuation, getCachedEvacuation } from "./evacuation-cache";

export function useEvacuationCache() {
  const { location } = useUserLocation();
  const { isConnected } = useConnectivity();
  const { highestSeverityAlert } = useAlerts(
    location?.latitude,
    location?.longitude,
  );
  const { signal, weather } = useWeatherSignal(
    location?.latitude,
    location?.longitude,
    highestSeverityAlert?.severity,
  );
  const { centers, loading: centersLoading } = useCenters(
    location?.latitude,
    location?.longitude,
  );
  const { floodReports, drainReports, reportsLoaded } = useMapReports();

  const [cached, setCached] = useState<CachedEvacuation | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const generatedRef = useRef(false);

  // 1. On mount, load any existing cache immediately
  useEffect(() => {
    void getCachedEvacuation().then((data) => {
      if (data) {
        setCached(data);
        setFromCache(true);
      }
      setLoading(false);
    });
  }, []);

  // 2. When all data is ready + online, run the engine once and cache
  useEffect(() => {
    if (generatedRef.current) return;
    if (!isConnected || !location || centersLoading || centers.length === 0)
      return;
    if (!reportsLoaded) return;

    generatedRef.current = true;
    void generateAndCache(
      location,
      weather,
      signal,
      floodReports,
      drainReports,
      centers,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isConnected,
    location,
    centersLoading,
    centers,
    reportsLoaded,
    weather,
    signal,
    floodReports,
    drainReports,
  ]);

  const generateAndCache = useCallback(
    async (
      loc: { latitude: number; longitude: number },
      w: typeof weather,
      sig: typeof signal,
      floods: typeof floodReports,
      drains: typeof drainReports,
      ctrs: EvacCenter[],
    ) => {
      setLoading(true);
      try {
        const decision: DecisionOutcome = await buildEvacuationDecision({
          userLocation: loc,
          weather: w,
          signal: sig,
          floodReports: floods,
          drainReports: drains,
          centers: ctrs,
        });

        // Identify the primary (best) center and fetch its walking route
        const primary =
          decision.recommendedCenters.find((ev) => !ev.flooded) ??
          decision.recommendedCenters[0] ??
          null;

        let primaryRoute: RouteResult | null = primary?.route ?? null;

        if (!primaryRoute && primary) {
          try {
            primaryRoute = await getRouteGuidance(
              loc,
              { latitude: primary.center.lat, longitude: primary.center.lng },
              "Kasalukuyang lokasyon",
              primary.center.name,
            );
          } catch {
            // Route fetch failed — continue without it
          }
        }

        const evacData: CachedEvacuation = {
          decision,
          primaryRoute,
          primaryCenterName: primary?.center.name ?? "Unknown",
          primaryCenterDistance:
            primary?.center.distanceKm != null
              ? `${primary.center.distanceKm.toFixed(1)} km`
              : "",
          cachedAt: new Date().toISOString(),
        };

        await cacheEvacuation(evacData);
        setCached(evacData);
        setFromCache(false);
      } catch (err) {
        console.warn("[EvacCache] generation failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refresh = useCallback(() => {
    if (!location || !isConnected) return;
    generatedRef.current = false;
    void generateAndCache(
      location,
      weather,
      signal,
      floodReports,
      drainReports,
      centers,
    );
  }, [
    generateAndCache,
    location,
    isConnected,
    weather,
    signal,
    floodReports,
    drainReports,
    centers,
  ]);

  return { cached, loading, fromCache, refresh };
}

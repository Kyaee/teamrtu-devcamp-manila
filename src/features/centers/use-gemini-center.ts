import { useEffect, useMemo, useState } from "react";

import type { Severity } from "@/src/design/tokens";
import {
  type CenterRiskAnnotation,
  annotateCenterRisk,
  isTyphoonMode,
} from "@/src/features/decision-engine/risk-policy";
import {
  chooseCenterFromCandidates,
  type RiskContext,
} from "@/src/services/ai";
import type { GeminiCenterChoice } from "@/src/types/ai";
import type { DrainReport, EvacCenter, FloodReport } from "@/src/types/domain";

type GeminiCenterState = {
  choice: GeminiCenterChoice | null;
  loading: boolean;
  riskAnnotations: CenterRiskAnnotation[];
};

/**
 * Calls Gemini to choose the best evacuation center from the provided nearby candidates.
 * Re-runs whenever user location, centers list, or report-derived risk context changes.
 * In typhoon mode (PREPARE+), blocked centers are excluded from Gemini's selection.
 * Falls back to nearest-by-distance if Gemini is unavailable or returns an invalid response.
 */
export function useGeminiCenter(
  userLat: number | undefined,
  userLng: number | undefined,
  centers: EvacCenter[],
  signal: Severity = "MONITOR",
  floodReports: FloodReport[] = [],
  drainReports: DrainReport[] = [],
): GeminiCenterState {
  const [state, setState] = useState<GeminiCenterState>({
    choice: null,
    loading: false,
    riskAnnotations: [],
  });

  const riskAnnotations = useMemo(() => {
    if (centers.length === 0) return [];
    const typhoon = isTyphoonMode(signal);
    return centers.map((c) =>
      annotateCenterRisk(
        c.id,
        c.lat,
        c.lng,
        floodReports,
        drainReports,
        typhoon,
      ),
    );
  }, [centers, signal, floodReports, drainReports]);

  useEffect(() => {
    if (
      userLat === undefined ||
      userLng === undefined ||
      centers.length === 0
    ) {
      return;
    }

    let cancelled = false;
    setState({ choice: null, loading: true, riskAnnotations });

    const riskCtx: RiskContext = {
      typhoonMode: isTyphoonMode(signal),
      centerAnnotations: riskAnnotations.map((a) => ({
        centerId: a.centerId,
        blocked: a.blocked,
        riskScore: a.riskScore,
        shortReason: a.shortReason,
      })),
    };

    void chooseCenterFromCandidates(userLat, userLng, centers, riskCtx).then(
      (choice) => {
        if (!cancelled) setState({ choice, loading: false, riskAnnotations });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [userLat, userLng, centers, signal, riskAnnotations]);

  return state;
}

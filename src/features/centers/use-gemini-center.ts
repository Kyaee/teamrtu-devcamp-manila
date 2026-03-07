import { useEffect, useState } from "react";

import { chooseCenterFromCandidates } from "@/src/services/ai";
import type { GeminiCenterChoice } from "@/src/types/ai";
import type { EvacCenter } from "@/src/types/domain";

type GeminiCenterState = {
  choice: GeminiCenterChoice | null;
  loading: boolean;
};

/**
 * Calls Gemini to choose the best evacuation center from the provided nearby candidates.
 * Re-runs whenever user location or the centers list changes.
 * Falls back to nearest-by-distance if Gemini is unavailable or returns an invalid response.
 */
export function useGeminiCenter(
  userLat: number | undefined,
  userLng: number | undefined,
  centers: EvacCenter[],
): GeminiCenterState {
  const [state, setState] = useState<GeminiCenterState>({
    choice: null,
    loading: false,
  });

  useEffect(() => {
    if (
      userLat === undefined ||
      userLng === undefined ||
      centers.length === 0
    ) {
      return;
    }

    let cancelled = false;
    setState({ choice: null, loading: true });

    void chooseCenterFromCandidates(userLat, userLng, centers).then(
      (choice) => {
        if (!cancelled) setState({ choice, loading: false });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [userLat, userLng, centers]);

  return state;
}

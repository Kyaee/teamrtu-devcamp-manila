import { useCallback, useState } from "react";

import type { Severity } from "@/src/design/tokens";
import type { DrainReport, EvacCenter, FloodReport } from "@/src/types/domain";
import type { WeatherData } from "@/src/types/weather";

import { buildEvacuationDecision } from "./engine";
import type { DecisionOutcome } from "./types";

type DecisionHookInput = {
  userLocation: { latitude: number; longitude: number };
  weather: WeatherData | null;
  signal: Severity;
  floodReports: FloodReport[];
  drainReports: DrainReport[];
  centers: EvacCenter[];
};

export function useEvacuationDecision() {
  const [decision, setDecision] = useState<DecisionOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async (input: DecisionHookInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await buildEvacuationDecision(input);
      setDecision(result);
    } catch {
      setError("Hindi makumpleto ang evaluation. Subukan muli.");
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setDecision(null);
    setError(null);
  }, []);

  return { decision, loading, error, evaluate, clear };
}

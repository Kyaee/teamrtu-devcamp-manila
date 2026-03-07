import type { Severity } from "@/src/design/tokens";
import type { RouteResult } from "@/src/services/maps";
import type { DrainReport, EvacCenter, FloodReport } from "@/src/types/domain";
import type { WeatherData } from "@/src/types/weather";

export type GlobalAction =
  | "STAY_MONITOR"
  | "PREPARE_GO_BAG"
  | "LEAVE_NOW"
  | "EVACUATE_NOW";

export type DecisionInput = {
  userLocation: { latitude: number; longitude: number };
  weather: WeatherData | null;
  signal: Severity;
  floodReports: FloodReport[];
  drainReports: DrainReport[];
  centers: EvacCenter[];
};

export type CenterEvaluation = {
  center: EvacCenter;
  route: RouteResult | null;
  score: number;
  riskLevel: Severity;
  reasons: string[];
  blocked?: boolean;
  /** True when the route to this center passes through a flooded area. */
  flooded?: boolean;
};

export type DecisionExplainability = {
  weatherReason: string;
  reportReason: string;
  routeReason: string;
};

export type DecisionOutcome = {
  globalAction: GlobalAction;
  recommendedCenters: CenterEvaluation[];
  confidence: number;
  explainability: DecisionExplainability;
  disclaimerText: string;
};

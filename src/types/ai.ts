export type GeminiCenterChoice = {
  centerId: string;
  reason: string;
  isFallback: boolean;
};

export type GeminiCenterGuidance = {
  summary: string;
  preparation: string;
  routeCaution: string | null;
  isFallback: boolean;
};

export type GeminiRouteContext = {
  phrase: string;
  isFallback: boolean;
};

export type GeminiTriggerEvent = "start" | "reroute" | "offRoute";

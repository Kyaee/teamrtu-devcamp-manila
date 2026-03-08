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

export type UrgencyLevel = "low" | "medium" | "high" | "very_urgent";

export type ChecklistCategory =
  | "documents"
  | "food_water"
  | "clothing"
  | "medical"
  | "electronics"
  | "tools"
  | "other";

export type ChecklistItem = {
  label: string;
  category: ChecklistCategory;
};

export type HelpAssessment = {
  urgencyLevel: UrgencyLevel;
  summary: string;
  recommendedActions: string[];
  checklistItems: ChecklistItem[];
  navigationIntent: boolean;
  destinationHint: string | null;
  isFallback: boolean;
};

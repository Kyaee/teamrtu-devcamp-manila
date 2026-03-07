import type { Alert } from "@/src/types/domain";

export const mockAlerts: Alert[] = [
  {
    id: "alert-prepare-1",
    barangay: "Concepcion Dos",
    city: "Marikina",
    severity: "PREPARE",
    headline: "Maghanda na",
    instruction: "Posibleng bahain ang barangay sa loob ng 2 oras.",
    primaryCtaLabel: "Hanapin ang Shelter",
    primaryCtaPath: "/(tabs)/centers",
    updatedAt: new Date().toISOString(),
    rationale: "Batay sa ulan, antas ng tubig, at ulat ng komunidad.",
  },
  {
    id: "alert-leave-1",
    barangay: "Tañong",
    city: "Malabon",
    severity: "LEAVE",
    headline: "Umalis sa loob ng 30 minuto",
    instruction: "Tumungo sa pinakamalapit na evacuation center.",
    primaryCtaLabel: "Tingnan ang Ruta",
    primaryCtaPath: "/(tabs)/centers",
    updatedAt: new Date().toISOString(),
    rationale: "May tumataas na tubig at dumaraming confirmed reports.",
  },
];

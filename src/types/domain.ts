import type { Severity } from "@/src/design/tokens";

export type Alert = {
  id: string;
  barangay: string;
  city: string;
  severity: Severity;
  headline: string;
  instruction: string;
  primaryCtaLabel: string;
  primaryCtaPath: string;
  updatedAt: string;
  rationale: string;
};

export type ReportDepth = "ankle" | "knee" | "waist" | "chest";

export type FloodReport = {
  id: string;
  lat: number;
  lng: number;
  depth: ReportDepth;
  status: "pending" | "confirmed";
  createdAt: string;
  reporterLabel: string;
  photoUrl?: string | null;
};

export type DrainReport = {
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  description: string;
  photoUrl?: string | null;
  status: "pending" | "confirmed";
};

export type EvacCenter = {
  id: string;
  name: string;
  barangay: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  status: "open" | "limited";
  uncertaintyNote: string;
};

export type PreparednessTask = {
  id: string;
  label: string;
  category?: string;
  level: "easy" | "moderate" | "complex";
  done: boolean;
};

export type UrgentRescueMarker = {
  id: string;
  lat: number;
  lng: number;
  urgencyLevel: "high" | "very_urgent";
  summary: string;
  status: "active" | "resolved";
  createdAt: string;
};

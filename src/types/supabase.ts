/** Row from the flood_reports_with_latlng view (lat/lng pre-extracted). */
export type DbFloodReport = {
  id: string;
  lat: number;
  lng: number;
  depth: "ankle" | "knee" | "waist" | "chest";
  status: "pending" | "confirmed";
  reporter_label: string;
  barangay: string | null;
  created_at: string;
};

/** Raw row from flood_reports table (realtime payloads use this). */
export type DbFloodReportRaw = {
  id: string;
  location: string;
  depth: "ankle" | "knee" | "waist" | "chest";
  status: "pending" | "confirmed";
  reporter_label: string;
  barangay: string | null;
  created_at: string;
};

/** Row from the drain_reports_with_latlng view (lat/lng pre-extracted). */
export type DbDrainReport = {
  id: string;
  lat: number;
  lng: number;
  description: string;
  status: "pending" | "confirmed";
  created_at: string;
};

export type DbAlert = {
  id: string;
  barangay: string;
  city: string;
  severity: "MONITOR" | "PREPARE" | "LEAVE" | "EVACUATE";
  headline: string;
  instruction: string;
  primary_cta_label: string;
  primary_cta_path: string;
  rationale: string;
  updated_at: string;
};

export type DbEvacCenter = {
  id: string;
  name: string;
  barangay: string;
  address: string;
  location: string;
  status: "open" | "limited";
  uncertainty_note: string;
};

export type DbFloodZone = {
  id: string;
  barangay: string;
  city: string;
  center_lat: number;
  center_lng: number;
  risk_level: "low" | "moderate" | "high";
};

export type DbRegisteredBuddy = {
  id: string;
  phone: string;
  barangay: string;
  created_at: string;
};

/** Row returned by the `nearby_evac_centers` RPC function */
export type NearbyEvacCenterRow = {
  id: string;
  name: string;
  barangay: string;
  address: string;
  lat: number;
  lng: number;
  status: "open" | "limited";
  uncertainty_note: string;
  distance_km: number;
};

export type FloodReportInsert = {
  location: string; // e.g. 'POINT(lng lat)'
  depth: "ankle" | "knee" | "waist" | "chest";
  status?: "pending" | "confirmed";
  reporter_label?: string;
  barangay?: string;
};

export type DrainReportInsert = {
  location: string;
  description: string;
  status?: "pending" | "confirmed";
};

/** Row returned by the `nearby_report_summary` RPC function */
export type NearbyReportSummaryRow = {
  flood_pending_count: number;
  flood_confirmed_count: number;
  flood_confirmed_high_count: number;
  drain_count: number;
};

/** Row from the urgent_rescue_markers table */
export type DbUrgentRescueMarker = {
  id: string;
  location: string;
  urgency_level: "high" | "very_urgent";
  summary: string;
  status: "active" | "resolved";
  created_at: string;
};

export type UrgentRescueMarkerInsert = {
  location: string;
  urgency_level: "high" | "very_urgent";
  summary: string;
  status?: "active" | "resolved";
};

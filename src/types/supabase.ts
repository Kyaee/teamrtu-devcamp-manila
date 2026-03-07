export type DbFloodReport = {
  id: string;
  location: string; // PostGIS geography serialized as GeoJSON or WKT
  depth: "ankle" | "knee" | "waist" | "chest";
  status: "pending" | "confirmed";
  reporter_label: string;
  barangay: string | null;
  created_at: string;
};

export type DbDrainReport = {
  id: string;
  location: string;
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

import {
  createClient,
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  DbAlert,
  DbDrainReport,
  DbFloodReport,
  DrainReportInsert,
  FloodReportInsert,
  NearbyEvacCenterRow,
  NearbyReportSummaryRow,
} from "@/src/types/supabase";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function fetchAlerts(): Promise<DbAlert[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function subscribeToAlerts(
  onInsertOrUpdate: (alert: DbAlert) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel("alerts-realtime")
    .on<DbAlert>(
      "postgres_changes",
      { event: "*", schema: "public", table: "alerts" },
      (payload) => {
        if (
          payload.new &&
          typeof payload.new === "object" &&
          "id" in payload.new
        ) {
          onInsertOrUpdate(payload.new as DbAlert);
        }
      },
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Flood Reports
// ---------------------------------------------------------------------------

export async function fetchFloodReports(): Promise<DbFloodReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("flood_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function insertFloodReport(
  report: FloodReportInsert,
): Promise<DbFloodReport | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("flood_reports")
    .insert(report)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToFloodReports(
  onInsert: (report: DbFloodReport) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel("flood-reports-realtime")
    .on<DbFloodReport>(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "flood_reports" },
      (payload) => {
        if (
          payload.new &&
          typeof payload.new === "object" &&
          "id" in payload.new
        ) {
          onInsert(payload.new as DbFloodReport);
        }
      },
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Drain Reports
// ---------------------------------------------------------------------------

export async function fetchDrainReports(): Promise<DbDrainReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("drain_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function insertDrainReport(
  report: DrainReportInsert,
): Promise<DbDrainReport | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("drain_reports")
    .insert(report)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Evacuation Centers (proximity via RPC)
// ---------------------------------------------------------------------------

export async function fetchNearbyEvacCenters(
  lat: number,
  lng: number,
  radiusKm = 10,
): Promise<NearbyEvacCenterRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("nearby_evac_centers", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  });
  if (error) throw error;
  return (data as NearbyEvacCenterRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// Report confirmation (3 reports / 200m threshold)
// ---------------------------------------------------------------------------

export async function checkNearbyReportCount(
  lat: number,
  lng: number,
  radiusM = 200,
  minCount = 3,
): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("check_nearby_report_count", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_min_count: minCount,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function confirmNearbyReports(
  lat: number,
  lng: number,
  radiusM = 200,
): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("confirm_nearby_reports", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ---------------------------------------------------------------------------
// Nearby Report Summary (aggregated counts for risk context)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY: NearbyReportSummaryRow = {
  flood_pending_count: 0,
  flood_confirmed_count: 0,
  flood_confirmed_high_count: 0,
  drain_count: 0,
};

export async function fetchNearbyReportSummary(
  lat: number,
  lng: number,
  radiusM = 200,
): Promise<NearbyReportSummaryRow> {
  if (!supabase) return EMPTY_SUMMARY;
  const { data, error } = await supabase.rpc("nearby_report_summary", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
  });
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) {
    return data[0] as NearbyReportSummaryRow;
  }
  return (data as NearbyReportSummaryRow) ?? EMPTY_SUMMARY;
}

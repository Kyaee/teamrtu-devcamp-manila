import {
  createClient,
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  DbAlert,
  DbDrainReport,
  DbDrainReportRaw,
  DbFloodReport,
  DbFloodReportRaw,
  DbUrgentRescueMarker,
  DrainReportInsert,
  FloodReportInsert,
  NearbyEvacCenterRow,
  NearbyReportSummaryRow,
  UrgentRescueMarkerInsert,
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
    .from("flood_reports_with_latlng" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as DbFloodReport[] | null) ?? [];
}

export async function insertFloodReport(
  report: FloodReportInsert,
): Promise<DbFloodReportRaw | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("flood_reports")
    .insert(report)
    .select()
    .single();
  if (error) throw error;
  return data as DbFloodReportRaw | null;
}

export function subscribeToFloodReports(
  onInsert: (report: DbFloodReportRaw) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel("flood-reports-realtime")
    .on<DbFloodReportRaw>(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "flood_reports" },
      (payload) => {
        if (
          payload.new &&
          typeof payload.new === "object" &&
          "id" in payload.new
        ) {
          onInsert(payload.new as DbFloodReportRaw);
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
    .from("drain_reports_with_latlng" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as DbDrainReport[] | null) ?? [];
}

export async function insertDrainReport(
  report: DrainReportInsert,
): Promise<{ id: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("drain_reports")
    .insert(report)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export function subscribeToDrainReports(
  onInsert: (report: DbDrainReportRaw) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel("drain-reports-realtime")
    .on<DbDrainReportRaw>(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "drain_reports" },
      (payload) => {
        if (
          payload.new &&
          typeof payload.new === "object" &&
          "id" in payload.new
        ) {
          onInsert(payload.new as DbDrainReportRaw);
        }
      },
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Storage — report photo uploads
// ---------------------------------------------------------------------------

/**
 * Upload a photo from a local file URI to Supabase Storage (`image` bucket).
 * Returns the public URL on success, or null if unavailable.
 */
export async function uploadReportPhoto(
  localUri: string,
  reportId: string,
  kind: "flood" | "drain",
): Promise<string | null> {
  if (!supabase) return null;

  // Read the file as a blob from the local URI
  const response = await fetch(localUri);
  const blob = await response.blob();

  const ext = localUri.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `reports/${kind}/${reportId}.${ext}`;

  const { error } = await supabase.storage.from("image").upload(path, blob, {
    contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
    upsert: true,
  });

  if (error) {
    console.warn("Photo upload failed:", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("image").getPublicUrl(path);

  return urlData?.publicUrl ?? null;
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

// ---------------------------------------------------------------------------
// Urgent Rescue Markers
// ---------------------------------------------------------------------------

export async function fetchUrgentRescueMarkers(): Promise<
  DbUrgentRescueMarker[]
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("urgent_rescue_markers")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as DbUrgentRescueMarker[] | null) ?? [];
}

export async function insertUrgentRescueMarker(
  marker: UrgentRescueMarkerInsert,
): Promise<DbUrgentRescueMarker | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("urgent_rescue_markers")
    .insert(marker)
    .select()
    .single();
  if (error) throw error;
  return data as DbUrgentRescueMarker | null;
}

export function subscribeToUrgentRescueMarkers(
  onPayload: (row: DbUrgentRescueMarker) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel("urgent-rescue-markers-realtime")
    .on<DbUrgentRescueMarker>(
      "postgres_changes",
      { event: "*", schema: "public", table: "urgent_rescue_markers" },
      (payload) => {
        if (
          payload.new &&
          typeof payload.new === "object" &&
          "id" in payload.new
        ) {
          onPayload(payload.new as DbUrgentRescueMarker);
        }
      },
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Nearby Report Summary (aggregated counts for risk context)
// ---------------------------------------------------------------------------

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

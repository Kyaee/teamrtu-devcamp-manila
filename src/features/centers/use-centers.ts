import { useEffect, useMemo, useState } from "react";

import type { EvacCenter } from "@/src/types/domain";
import type { NearbyEvacCenterRow } from "@/src/types/supabase";

import { filterCentersByAllowlist } from "@/src/features/centers/csv-allowlist";
import { evacCenters as seedCenters } from "@/src/features/centers/data";
import { CSV_EVAC_CENTERS } from "@/src/features/centers/data/evacuation-centers-metro-manila";
import { useGeocodedCenters } from "@/src/features/centers/use-geocoded-centers";
import { readJson, writeJson } from "@/src/features/offline/storage";
import { fetchNearbyEvacCenters } from "@/src/services/supabase";

const CACHE_KEY = "agos:evac-centers";

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type GeoOverrides = Record<string, { lat: number; lng: number }>;

function buildCsvCenters(
  userLat: number,
  userLng: number,
  geoOverrides: GeoOverrides,
): EvacCenter[] {
  return CSV_EVAC_CENTERS.map((c) => {
    const override = geoOverrides[c.id];
    const lat = override?.lat ?? c.lat;
    const lng = override?.lng ?? c.lng;
    return {
      id: c.id,
      name: c.name,
      barangay: c.barangay,
      address: `${c.barangay}, ${c.city}, Metro Manila`,
      lat,
      lng,
      distanceKm:
        Math.round(haversineKm(userLat, userLng, lat, lng) * 100) / 100,
      status: "open" as const,
      uncertaintyNote: override
        ? "Location verified via Google Maps geocoding."
        : "Based on DSWD evacuation center list. Verify status on arrival.",
    };
  });
}

function rowToDomain(row: NearbyEvacCenterRow): EvacCenter {
  return {
    id: row.id,
    name: row.name,
    barangay: row.barangay,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    distanceKm: Math.round(row.distance_km * 100) / 100,
    status: row.status,
    uncertaintyNote: row.uncertainty_note,
  };
}

function mergeCenters(
  supabaseCenters: EvacCenter[],
  csvCenters: EvacCenter[],
): EvacCenter[] {
  const seen = new Set(supabaseCenters.map((c) => c.id));
  const nameSet = new Set(
    supabaseCenters.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  const merged = [...supabaseCenters];
  for (const c of csvCenters) {
    const normName = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!seen.has(c.id) && !nameSet.has(normName)) {
      merged.push(c);
      seen.add(c.id);
      nameSet.add(normName);
    }
  }
  return merged;
}

export function useCenters(userLat?: number, userLng?: number) {
  const [allCenters, setAllCenters] = useState<EvacCenter[]>([]);
  const [openOnly, setOpenOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lat = userLat ?? 14.6308;
  const lng = userLng ?? 121.1023;

  const { overrides: geoOverrides } = useGeocodedCenters();

  const csvCenters = useMemo(
    () => buildCsvCenters(lat, lng, geoOverrides),
    [lat, lng, geoOverrides],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cached = await readJson<EvacCenter[]>(CACHE_KEY, []);
      if (!cancelled && cached.length > 0) {
        setAllCenters(mergeCenters(cached, csvCenters));
        setLoading(false);
      }

      try {
        const rows = await fetchNearbyEvacCenters(lat, lng, 20);
        if (!cancelled) {
          const mapped = rows.map(rowToDomain);
          const merged = mergeCenters(mapped, csvCenters);
          setAllCenters(merged);
          setError(null);
          await writeJson(CACHE_KEY, mapped);
        }
      } catch {
        if (!cancelled) {
          setError(
            "Hindi makuha ang mga evacuation center. Gamit ang cached data.",
          );
        }
      } finally {
        if (!cancelled) {
          setAllCenters((prev) =>
            prev.length > 0 ? prev : mergeCenters(seedCenters, csvCenters),
          );
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, csvCenters]);

  const centers = useMemo<EvacCenter[]>(() => {
    const filtered = filterCentersByAllowlist(allCenters);
    if (!openOnly) return filtered;
    return filtered.filter((c) => c.status === "open");
  }, [openOnly, allCenters]);

  return {
    centers,
    openOnly,
    setOpenOnly,
    loading,
    error,
  };
}

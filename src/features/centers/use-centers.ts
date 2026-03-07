import { useEffect, useMemo, useState } from "react";

import type { EvacCenter } from "@/src/types/domain";
import type { NearbyEvacCenterRow } from "@/src/types/supabase";

import { filterCentersByAllowlist } from "@/src/features/centers/csv-allowlist";
import { evacCenters as seedCenters } from "@/src/features/centers/data";
import { readJson, writeJson } from "@/src/features/offline/storage";
import { fetchNearbyEvacCenters } from "@/src/services/supabase";

const CACHE_KEY = "agos:evac-centers";

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

export function useCenters(userLat?: number, userLng?: number) {
  const [allCenters, setAllCenters] = useState<EvacCenter[]>([]);
  const [openOnly, setOpenOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cached = await readJson<EvacCenter[]>(CACHE_KEY, []);
      if (!cancelled && cached.length > 0) {
        setAllCenters(cached);
        setLoading(false);
      }

      const lat = userLat ?? 14.6308;
      const lng = userLng ?? 121.1023;

      try {
        const rows = await fetchNearbyEvacCenters(lat, lng, 20);
        if (!cancelled) {
          const mapped = rows.map(rowToDomain);
          setAllCenters(mapped);
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
          setAllCenters((prev) => (prev.length > 0 ? prev : seedCenters));
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userLat, userLng]);

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

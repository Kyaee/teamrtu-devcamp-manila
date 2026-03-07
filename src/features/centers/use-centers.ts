import { useEffect, useMemo, useState } from "react";

import type { EvacCenter } from "@/src/types/domain";
import type { NearbyEvacCenterRow } from "@/src/types/supabase";

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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Show cached data immediately
      const cached = await readJson<EvacCenter[]>(CACHE_KEY, []);
      if (!cancelled && cached.length > 0) {
        setAllCenters(cached);
        setLoading(false);
      }

      // Default to Marikina area if no user location
      const lat = userLat ?? 14.6308;
      const lng = userLng ?? 121.1023;

      try {
        const rows = await fetchNearbyEvacCenters(lat, lng, 20);
        if (!cancelled) {
          const mapped = rows.map(rowToDomain);
          setAllCenters(mapped);
          await writeJson(CACHE_KEY, mapped);
        }
      } catch {
        // keep cached data
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userLat, userLng]);

  const centers = useMemo<EvacCenter[]>(() => {
    if (!openOnly) return allCenters;
    return allCenters.filter((c) => c.status === "open");
  }, [openOnly, allCenters]);

  return {
    centers,
    openOnly,
    setOpenOnly,
    loading,
  };
}

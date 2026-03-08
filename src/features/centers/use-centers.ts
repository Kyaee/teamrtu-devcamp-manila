import { useEffect, useMemo, useState } from "react";

import type { EvacCenter } from "@/src/types/domain";

import { readJson, writeJson } from "@/src/features/offline/storage";
import type { NearbyPlace } from "@/src/services/places";
import { searchNearbyShelters } from "@/src/services/places";

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

function placeToDomain(
  place: NearbyPlace,
  userLat: number,
  userLng: number,
): EvacCenter {
  const dist = haversineKm(userLat, userLng, place.latitude, place.longitude);
  return {
    id: `places-${place.placeId}`,
    name: place.name,
    barangay:
      place.shelterType === "school"
        ? "School"
        : place.shelterType === "hospital"
          ? "Hospital"
          : "Mall",
    address: "",
    lat: place.latitude,
    lng: place.longitude,
    distanceKm: Math.round(dist * 100) / 100,
    status: "open",
    uncertaintyNote:
      "Data mula sa Google Places. I-verify ang availability sa pagdating.",
  };
}

function deduplicateByProximity(
  centers: EvacCenter[],
  thresholdKm = 0.05,
): EvacCenter[] {
  const result: EvacCenter[] = [];
  for (const c of centers) {
    const isDuplicate = result.some(
      (existing) =>
        haversineKm(existing.lat, existing.lng, c.lat, c.lng) < thresholdKm,
    );
    if (!isDuplicate) result.push(c);
  }
  return result;
}

export function useCenters(userLat?: number, userLng?: number) {
  const [allCenters, setAllCenters] = useState<EvacCenter[]>([]);
  const [openOnly, setOpenOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLat === undefined || userLng === undefined) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      // Show cached data immediately — but only if it's near the current location
      // Use a tight radius (2 km) so stale caches from dev/test locations
      // are discarded when the real GPS position is different.
      const cached = await readJson<EvacCenter[]>(CACHE_KEY, []);
      const cacheIsNearby =
        cached.length > 0 &&
        haversineKm(userLat, userLng, cached[0].lat, cached[0].lng) < 2;

      if (!cancelled && cacheIsNearby) {
        setAllCenters(cached);
        setLoading(false);
      }

      const discovered: EvacCenter[] = [];

      // Source 1: Google Places Nearby Search (primary — works with just Maps API key)
      try {
        console.log(
          `[Centers] Searching shelters near ${userLat}, ${userLng}...`,
        );
        const places = await searchNearbyShelters(userLat, userLng, 5000);
        console.log(
          `[Centers] Found ${places.length} places from Google Places`,
        );
        for (const p of places) {
          discovered.push(placeToDomain(p, userLat, userLng));
        }
      } catch (err: any) {
        console.warn(`[Centers] Places search failed:`, err?.message ?? err);
      }

      if (!cancelled) {
        if (discovered.length > 0) {
          const deduped = deduplicateByProximity(discovered);
          const sorted = deduped.sort((a, b) => a.distanceKm - b.distanceKm);
          setAllCenters(sorted);
          setError(null);
          await writeJson(CACHE_KEY, sorted);
        } else if (!cacheIsNearby) {
          setError(
            "Hindi mahanap ang mga evacuation center. I-check ang internet connection.",
          );
        }
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [lat, lng, userLat, userLng, refreshKey]);

  const centers = useMemo<EvacCenter[]>(() => {
    if (!openOnly) return allCenters;
    return allCenters.filter((c) => c.status === "open");
  }, [openOnly, allCenters]);

  return {
    centers,
    openOnly,
    setOpenOnly,
    loading,
    error,
    refresh,
  };
}

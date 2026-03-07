import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { geocodeAddress } from "@/src/services/geocoding";

import {
  CSV_EVAC_CENTERS,
  type CsvEvacCenter,
} from "./data/evacuation-centers-metro-manila";

type GeoOverride = { lat: number; lng: number };
type GeoOverrides = Record<string, GeoOverride>;

const STORAGE_KEY = "agos:center-geo-overrides";
const MAX_GEOCODE_PER_SESSION = 10;

async function loadOverrides(): Promise<GeoOverrides> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as GeoOverrides;
  } catch {
    return {};
  }
}

async function saveOverrides(overrides: GeoOverrides): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // non-critical
  }
}

function buildQuery(c: CsvEvacCenter): string {
  return `${c.name}, ${c.barangay}, ${c.city}, Metro Manila, Philippines`;
}

export function useGeocodedCenters(): {
  overrides: GeoOverrides;
  loading: boolean;
} {
  const [overrides, setOverrides] = useState<GeoOverrides>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const existing = await loadOverrides();
      if (!cancelled) setOverrides(existing);

      const pending = CSV_EVAC_CENTERS.filter((c) => !existing[c.id]);
      const batch = pending.slice(0, MAX_GEOCODE_PER_SESSION);

      let updated = false;
      for (const c of batch) {
        if (cancelled) break;
        const result = await geocodeAddress(buildQuery(c));
        if (result && !cancelled) {
          existing[c.id] = { lat: result.lat, lng: result.lng };
          updated = true;
        }
      }

      if (updated && !cancelled) {
        await saveOverrides(existing);
        setOverrides({ ...existing });
      }

      if (!cancelled) setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { overrides, loading };
}

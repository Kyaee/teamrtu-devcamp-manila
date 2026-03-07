import * as Location from "expo-location";
import { useEffect, useState } from "react";

import { readJson, writeJson } from "@/src/features/offline/storage";

const CACHE_KEY = "agos:last-location";

type LatLng = { latitude: number; longitude: number };

const DEFAULT_LOCATION: LatLng = { latitude: 14.6308, longitude: 121.1023 }; // Marikina

export function useUserLocation() {
  const [location, setLocation] = useState<LatLng>(DEFAULT_LOCATION);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const get = async () => {
      const cached = await readJson<LatLng | null>(CACHE_KEY, null);
      if (!cancelled && cached) {
        setLocation(cached);
        setLoading(false);
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) {
          setPermissionDenied(true);
          setLoading(false);
        }
        return;
      }

      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords: LatLng = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        if (!cancelled) {
          setLocation(coords);
          await writeJson(CACHE_KEY, coords);
        }
      } catch {
        // keep cached / default location
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void get();
    return () => {
      cancelled = true;
    };
  }, []);

  return { location, permissionDenied, loading };
}

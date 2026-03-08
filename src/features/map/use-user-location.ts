import * as Location from "expo-location";
import { useEffect, useState } from "react";

export type LatLng = { latitude: number; longitude: number };

/**
 * Requests foreground location permission and returns the device GPS position.
 *
 * - `location` is **null** until a real GPS fix is obtained.
 * - `loading` is true while the position is being resolved.
 * - `permissionDenied` is true when the user declined location access.
 *
 * All downstream hooks / UI that depend on the user's position should
 * guard on `location !== null` before doing work.
 */
export function useUserLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const get = async () => {
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
        if (!cancelled) {
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {
        // GPS failed — location stays null
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

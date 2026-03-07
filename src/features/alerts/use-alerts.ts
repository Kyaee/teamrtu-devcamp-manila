import { useEffect, useMemo, useRef, useState } from "react";

import { readJson, writeJson } from "@/src/features/offline/storage";
import { getCityCentroid } from "@/src/services/geocoding";
import { fetchAlerts, subscribeToAlerts } from "@/src/services/supabase";
import type { Alert } from "@/src/types/domain";
import type { DbAlert } from "@/src/types/supabase";

const POLL_MS = 25_000;
const CACHE_KEY = "agos:alerts-cache";
const ALERT_RADIUS_KM = 15;

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

function dbAlertToDomain(row: DbAlert): Alert {
  return {
    id: row.id,
    barangay: row.barangay,
    city: row.city,
    severity: row.severity,
    headline: row.headline,
    instruction: row.instruction,
    primaryCtaLabel: row.primary_cta_label,
    primaryCtaPath: row.primary_cta_path,
    updatedAt: row.updated_at,
    rationale: row.rationale,
  };
}

export function useAlerts(userLat?: number, userLng?: number) {
  const [allAlerts, setAllAlerts] = useState<Alert[]>([]);
  const [usingPollingFallback, setUsingPollingFallback] =
    useState<boolean>(false);
  const realtimeActive = useRef(false);

  // Load cached alerts immediately, then fetch fresh from Supabase
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cached = await readJson<Alert[]>(CACHE_KEY, []);
      if (!cancelled && cached.length > 0) setAllAlerts(cached);

      try {
        const rows = await fetchAlerts();
        if (!cancelled) {
          const mapped = rows.map(dbAlertToDomain);
          setAllAlerts(mapped);
          await writeJson(CACHE_KEY, mapped);
        }
      } catch {
        // Supabase unreachable — keep cached data
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime subscription with polling fallback
  useEffect(() => {
    const channel = subscribeToAlerts((row) => {
      realtimeActive.current = true;
      setUsingPollingFallback(false);
      const updated = dbAlertToDomain(row);
      setAllAlerts((prev) => {
        const without = prev.filter((a) => a.id !== updated.id);
        const next = [updated, ...without];
        void writeJson(CACHE_KEY, next);
        return next;
      });
    });

    if (!channel) {
      setUsingPollingFallback(true);
    }

    const realtimeTimeout = setTimeout(() => {
      if (!realtimeActive.current) setUsingPollingFallback(true);
    }, 5_000);

    const poll = setInterval(async () => {
      if (realtimeActive.current) return;
      try {
        const rows = await fetchAlerts();
        const mapped = rows.map(dbAlertToDomain);
        setAllAlerts(mapped);
        await writeJson(CACHE_KEY, mapped);
      } catch {
        // keep existing data on poll failure
      }
    }, POLL_MS);

    return () => {
      clearTimeout(realtimeTimeout);
      clearInterval(poll);
      channel?.unsubscribe();
    };
  }, []);

  const alerts = useMemo(() => {
    if (userLat === undefined || userLng === undefined) return allAlerts;
    return allAlerts.filter((a) => {
      const centroid = getCityCentroid(a.city);
      if (!centroid) return true;
      return (
        haversineKm(userLat, userLng, centroid.lat, centroid.lng) <
        ALERT_RADIUS_KM
      );
    });
  }, [allAlerts, userLat, userLng]);

  const highestSeverityAlert = useMemo(() => {
    const rank = { MONITOR: 1, PREPARE: 2, LEAVE: 3, EVACUATE: 4 } as const;
    return (
      [...alerts].sort((a, b) => rank[b.severity] - rank[a.severity])[0] ?? null
    );
  }, [alerts]);

  return {
    alerts,
    highestSeverityAlert,
    usingPollingFallback,
  };
}

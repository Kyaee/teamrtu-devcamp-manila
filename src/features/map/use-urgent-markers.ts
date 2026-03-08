import { useCallback, useEffect, useRef, useState } from "react";

import type { UrgentRescueMarker } from "@/src/types/domain";
import type { DbUrgentRescueMarker } from "@/src/types/supabase";

import { readJson, writeJson } from "@/src/features/offline/storage";
import {
  fetchUrgentRescueMarkers,
  insertUrgentRescueMarker,
  subscribeToUrgentRescueMarkers,
} from "@/src/services/supabase";

const CACHE_KEY = "agos:urgent-markers";
const OFFLINE_QUEUE_KEY = "agos:urgent-markers-queue";

// ---------------------------------------------------------------------------
// Purple pin color for "urgent to save" markers (FR-6)
// ---------------------------------------------------------------------------

/** Purple color used for urgent-to-save map pin markers */
export const URGENT_PURPLE_PIN = "#9333EA";

/**
 * Returns the appropriate pin color for an urgent marker.
 * - `very_urgent` → purple (urgent to save)
 * - `high` → red (danger)
 */
export function getUrgentPinColor(
  urgencyLevel: "high" | "very_urgent",
): string {
  return urgencyLevel === "very_urgent" ? URGENT_PURPLE_PIN : "#EF4444";
}

type QueuedMarker = {
  lat: number;
  lng: number;
  urgencyLevel: "high" | "very_urgent";
  summary: string;
};

function dbToDomain(row: DbUrgentRescueMarker): UrgentRescueMarker {
  let lat = 14.62;
  let lng = 121.09;
  try {
    const geo =
      typeof row.location === "string"
        ? JSON.parse(row.location)
        : row.location;
    if (geo?.coordinates) {
      lng = geo.coordinates[0];
      lat = geo.coordinates[1];
    }
  } catch {
    // fall back to defaults
  }
  return {
    id: row.id,
    lat,
    lng,
    urgencyLevel: row.urgency_level,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
  };
}

const RATE_LIMIT_MS = 60_000;

export function useUrgentMarkers() {
  const [markers, setMarkers] = useState<UrgentRescueMarker[]>([]);
  const [sending, setSending] = useState(false);
  const lastSentRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cached = await readJson<UrgentRescueMarker[]>(CACHE_KEY, []);
      if (!cancelled && cached.length > 0) setMarkers(cached);

      try {
        const rows = await fetchUrgentRescueMarkers();
        if (!cancelled) {
          const domain = rows.map(dbToDomain);
          setMarkers(domain);
          await writeJson(CACHE_KEY, domain);
        }
      } catch {
        // keep cache
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const channel = subscribeToUrgentRescueMarkers((row) => {
      const marker = dbToDomain(row);
      setMarkers((prev) => {
        const existing = prev.findIndex((m) => m.id === marker.id);
        let next: UrgentRescueMarker[];
        if (existing >= 0) {
          next = [...prev];
          next[existing] = marker;
        } else if (marker.status === "active") {
          next = [marker, ...prev];
        } else {
          return prev;
        }
        const active = next.filter((m) => m.status === "active");
        void writeJson(CACHE_KEY, active);
        return active;
      });
    });
    return () => {
      channel?.unsubscribe();
    };
  }, []);

  const addUrgentMarker = useCallback(
    async (
      lat: number,
      lng: number,
      urgencyLevel: "high" | "very_urgent",
      summary: string,
      isConnected: boolean,
    ): Promise<UrgentRescueMarker | null> => {
      const now = Date.now();
      if (now - lastSentRef.current < RATE_LIMIT_MS) {
        return null;
      }
      lastSentRef.current = now;

      setSending(true);
      const localMarker: UrgentRescueMarker = {
        id: `urgent-${Date.now()}`,
        lat,
        lng,
        urgencyLevel,
        summary,
        status: "active",
        createdAt: new Date().toISOString(),
      };

      if (isConnected) {
        try {
          const wkt = `POINT(${lng} ${lat})`;
          const inserted = await insertUrgentRescueMarker({
            location: wkt,
            urgency_level: urgencyLevel,
            summary,
            status: "active",
          });
          if (inserted) {
            localMarker.id = inserted.id;
          }
        } catch {
          const queue = await readJson<QueuedMarker[]>(OFFLINE_QUEUE_KEY, []);
          await writeJson(OFFLINE_QUEUE_KEY, [
            { lat, lng, urgencyLevel, summary },
            ...queue,
          ]);
        }
      } else {
        const queue = await readJson<QueuedMarker[]>(OFFLINE_QUEUE_KEY, []);
        await writeJson(OFFLINE_QUEUE_KEY, [
          { lat, lng, urgencyLevel, summary },
          ...queue,
        ]);
      }

      setMarkers((prev) => {
        const next = [localMarker, ...prev];
        void writeJson(CACHE_KEY, next);
        return next;
      });
      setSending(false);
      return localMarker;
    },
    [],
  );

  const syncQueuedMarkers = useCallback(async () => {
    const queue = await readJson<QueuedMarker[]>(OFFLINE_QUEUE_KEY, []);
    if (queue.length === 0) return;

    const failed: QueuedMarker[] = [];
    for (const item of queue) {
      try {
        const wkt = `POINT(${item.lng} ${item.lat})`;
        await insertUrgentRescueMarker({
          location: wkt,
          urgency_level: item.urgencyLevel,
          summary: item.summary,
        });
      } catch {
        failed.push(item);
      }
    }
    await writeJson(OFFLINE_QUEUE_KEY, failed);
  }, []);

  return {
    urgentMarkers: markers,
    sending,
    addUrgentMarker,
    syncQueuedMarkers,
  };
}

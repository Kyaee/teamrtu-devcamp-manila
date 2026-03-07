import { useCallback, useEffect, useMemo, useState } from "react";

import type { DrainReport, FloodReport, ReportDepth } from "@/src/types/domain";
import type { DbDrainReport, DbFloodReport } from "@/src/types/supabase";

import { readJson, writeJson } from "@/src/features/offline/storage";
import {
  checkNearbyReportCount,
  confirmNearbyReports,
  fetchDrainReports,
  fetchFloodReports,
  insertDrainReport,
  insertFloodReport,
  subscribeToFloodReports,
} from "@/src/services/supabase";

const FLOOD_KEY = "agos:flood-reports";
const DRAIN_KEY = "agos:drain-reports";
const OFFLINE_QUEUE_KEY = "agos:offline-queue";

type OfflineQueueItem =
  | {
      kind: "flood";
      lat: number;
      lng: number;
      depth: ReportDepth;
      barangay?: string;
    }
  | { kind: "drain"; lat: number; lng: number; description: string };

function dbFloodToDomain(row: DbFloodReport): FloodReport {
  let lat = 14.62;
  let lng = 121.09;
  try {
    // PostGIS returns geography as JSON: {"type":"Point","coordinates":[lng,lat]}
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
    depth: row.depth,
    status: row.status,
    createdAt: row.created_at,
    reporterLabel: row.reporter_label,
  };
}

function dbDrainToDomain(row: DbDrainReport): DrainReport {
  let lat = 14.619;
  let lng = 121.097;
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
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function useMapReports() {
  const [floodReports, setFloodReports] = useState<FloodReport[]>([]);
  const [drainReports, setDrainReports] = useState<DrainReport[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [syncMessage, setSyncMessage] = useState<string>(
    "Handa ang sync status.",
  );

  // Load from Supabase on mount, fallback to cache
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cachedFlood = await readJson<FloodReport[]>(FLOOD_KEY, []);
      const cachedDrain = await readJson<DrainReport[]>(DRAIN_KEY, []);
      const queue = await readJson<OfflineQueueItem[]>(OFFLINE_QUEUE_KEY, []);
      if (!cancelled) {
        if (cachedFlood.length > 0) setFloodReports(cachedFlood);
        if (cachedDrain.length > 0) setDrainReports(cachedDrain);
        setQueueCount(queue.length);
      }

      try {
        const [floodRows, drainRows] = await Promise.all([
          fetchFloodReports(),
          fetchDrainReports(),
        ]);
        if (!cancelled) {
          const floods = floodRows.map(dbFloodToDomain);
          const drains = drainRows.map(dbDrainToDomain);
          setFloodReports(floods);
          setDrainReports(drains);
          setReportsLoaded(true);
          await writeJson(FLOOD_KEY, floods);
          await writeJson(DRAIN_KEY, drains);
        }
      } catch {
        if (!cancelled) setReportsLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime subscription for flood reports from other users
  useEffect(() => {
    const channel = subscribeToFloodReports((row) => {
      const report = dbFloodToDomain(row);
      setFloodReports((prev) => {
        if (prev.some((r) => r.id === report.id)) return prev;
        const next = [report, ...prev];
        void writeJson(FLOOD_KEY, next);
        return next;
      });
    });
    return () => {
      channel?.unsubscribe();
    };
  }, []);

  const confirmationHint = useMemo(
    () => "Confirmed kapag may 3+ reports sa loob ng 200m.",
    [],
  );

  const addFloodReport = useCallback(
    async (
      depth: ReportDepth,
      isConnected: boolean,
      lat = 14.62,
      lng = 121.09,
    ) => {
      const localReport: FloodReport = {
        id: `flood-${Date.now()}`,
        lat,
        lng,
        depth,
        status: "pending",
        createdAt: new Date().toISOString(),
        reporterLabel: isConnected ? "Live report" : "Offline queued report",
      };

      if (isConnected) {
        try {
          const wkt = `POINT(${lng} ${lat})`;
          const inserted = await insertFloodReport({
            location: wkt,
            depth,
            status: "pending",
            reporter_label: "Community report",
          });

          if (inserted) {
            localReport.id = inserted.id;

            // 3 reports / 200m threshold check
            const shouldConfirm = await checkNearbyReportCount(
              lat,
              lng,
              200,
              3,
            );
            if (shouldConfirm) {
              await confirmNearbyReports(lat, lng, 200);
              localReport.status = "confirmed";
              setSyncMessage(
                "Report confirmed — naabot ang threshold ng 3 reports / 200m.",
              );
            } else {
              setSyncMessage("Report submitted — pending confirmation.");
            }
          }
        } catch {
          setSyncMessage("Error sa pag-submit. Na-queue offline.");
          const queue = await readJson<OfflineQueueItem[]>(
            OFFLINE_QUEUE_KEY,
            [],
          );
          const nextQueue: OfflineQueueItem[] = [
            { kind: "flood", lat, lng, depth },
            ...queue,
          ];
          await writeJson(OFFLINE_QUEUE_KEY, nextQueue);
          setQueueCount(nextQueue.length);
        }
      } else {
        const queue = await readJson<OfflineQueueItem[]>(OFFLINE_QUEUE_KEY, []);
        const nextQueue: OfflineQueueItem[] = [
          { kind: "flood", lat, lng, depth },
          ...queue,
        ];
        await writeJson(OFFLINE_QUEUE_KEY, nextQueue);
        setQueueCount(nextQueue.length);
        setSyncMessage("Offline mode: flood report queued para sa sync.");
      }

      setFloodReports((prev) => {
        const next = [localReport, ...prev];
        void writeJson(FLOOD_KEY, next);
        return next;
      });
    },
    [],
  );

  const addDrainReport = useCallback(
    async (
      description: string,
      isConnected: boolean,
      lat = 14.619,
      lng = 121.097,
    ) => {
      const localReport: DrainReport = {
        id: `drain-${Date.now()}`,
        lat,
        lng,
        status: isConnected ? "pending" : "pending",
        description,
        createdAt: new Date().toISOString(),
      };

      if (isConnected) {
        try {
          const wkt = `POINT(${lng} ${lat})`;
          const inserted = await insertDrainReport({
            location: wkt,
            description,
          });
          if (inserted) localReport.id = inserted.id;
          setSyncMessage("Drain report submitted.");
        } catch {
          const queue = await readJson<OfflineQueueItem[]>(
            OFFLINE_QUEUE_KEY,
            [],
          );
          const nextQueue: OfflineQueueItem[] = [
            { kind: "drain", lat, lng, description },
            ...queue,
          ];
          await writeJson(OFFLINE_QUEUE_KEY, nextQueue);
          setQueueCount(nextQueue.length);
          setSyncMessage("Error sa pag-submit. Na-queue offline.");
        }
      } else {
        const queue = await readJson<OfflineQueueItem[]>(OFFLINE_QUEUE_KEY, []);
        const nextQueue: OfflineQueueItem[] = [
          { kind: "drain", lat, lng, description },
          ...queue,
        ];
        await writeJson(OFFLINE_QUEUE_KEY, nextQueue);
        setQueueCount(nextQueue.length);
        setSyncMessage("Offline mode: drain report queued para sa sync.");
      }

      setDrainReports((prev) => {
        const next = [localReport, ...prev];
        void writeJson(DRAIN_KEY, next);
        return next;
      });
    },
    [],
  );

  const syncQueuedReports = useCallback(async () => {
    const queue = await readJson<OfflineQueueItem[]>(OFFLINE_QUEUE_KEY, []);
    if (queue.length === 0) {
      setSyncMessage("Walang pending offline reports.");
      return;
    }

    let synced = 0;
    const failed: OfflineQueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.kind === "flood") {
          const wkt = `POINT(${item.lng} ${item.lat})`;
          await insertFloodReport({
            location: wkt,
            depth: item.depth,
            reporter_label: "Synced offline report",
            barangay: item.barangay,
          });
          // Check confirmation threshold after sync
          const shouldConfirm = await checkNearbyReportCount(
            item.lat,
            item.lng,
            200,
            3,
          );
          if (shouldConfirm)
            await confirmNearbyReports(item.lat, item.lng, 200);
        } else {
          const wkt = `POINT(${item.lng} ${item.lat})`;
          await insertDrainReport({
            location: wkt,
            description: item.description,
          });
        }
        synced++;
      } catch {
        failed.push(item);
      }
    }

    await writeJson(OFFLINE_QUEUE_KEY, failed);
    setQueueCount(failed.length);

    if (failed.length > 0) {
      setSyncMessage(`Na-sync: ${synced}. Hindi na-sync: ${failed.length}.`);
    } else {
      setSyncMessage(`Na-sync lahat ng ${synced} reports.`);
    }

    // Refresh from server after sync
    try {
      const [floodRows, drainRows] = await Promise.all([
        fetchFloodReports(),
        fetchDrainReports(),
      ]);
      const floods = floodRows.map(dbFloodToDomain);
      const drains = drainRows.map(dbDrainToDomain);
      setFloodReports(floods);
      setDrainReports(drains);
      await writeJson(FLOOD_KEY, floods);
      await writeJson(DRAIN_KEY, drains);
    } catch {
      // keep local state
    }
  }, []);

  return {
    floodReports,
    drainReports,
    reportsLoaded,
    queueCount,
    syncMessage,
    confirmationHint,
    addFloodReport,
    addDrainReport,
    syncQueuedReports,
  };
}

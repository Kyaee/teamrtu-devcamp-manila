import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Severity } from "@/src/design/tokens";
import { tokens } from "@/src/design/tokens";
import { AlertCard } from "@/src/features/alerts/alert-card";
import { useAlerts } from "@/src/features/alerts/use-alerts";
import { useWeatherSignal } from "@/src/features/alerts/use-weather-signal";
import { useCenters } from "@/src/features/centers/use-centers";
import { useGeminiCenter } from "@/src/features/centers/use-gemini-center";
import type { GlobalAction } from "@/src/features/decision-engine/types";
import { useEvacuationDecision } from "@/src/features/decision-engine/use-evacuation-decision";
import { HomeFloatingPanel } from "@/src/features/home/HomeFloatingPanel";
import { DPWHProjectPanel } from "@/src/features/map/DPWHProjectPanel";
import { LocationSearchBar } from "@/src/features/map/LocationSearchBar";
import type {
  MapDisplayRef,
  MapMarker,
  MapZone,
} from "@/src/features/map/MapDisplay";
import MapDisplay from "@/src/features/map/MapDisplay";
import { useDpwhProjects } from "@/src/features/map/use-dpwh-projects";
import {
  HAZARD_COLORS,
  HAZARD_LABELS,
  useFloodCoverage,
} from "@/src/features/map/use-flood-coverage";
import { useFloodStreetHighlights } from "@/src/features/map/use-flood-street-highlights";
import { useMapReports } from "@/src/features/map/use-map-reports";
import {
  useUrgentMarkers,
  getUrgentPinColor,
} from "@/src/features/map/use-urgent-markers";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import type { LatLng, RouteResult } from "@/src/services/maps";
import { getRouteGuidance } from "@/src/services/maps";
import type { PlaceLocation } from "@/src/services/places";
import type { FloodReport, ReportDepth } from "@/src/types/domain";
import { useChecklistStore } from "@/src/store/checklist-store";
import { usePreparedness } from "@/src/features/preparedness/use-preparedness";
import { useAppSlice } from "@/src/store/app-slice";
import type { HourlyForecastEntry } from "@/src/types/weather";

const DEPTH_COLORS: Record<ReportDepth, string> = {
  ankle: tokens.colors.severity.MONITOR,
  knee: tokens.colors.severity.PREPARE,
  waist: tokens.colors.severity.LEAVE,
  chest: tokens.colors.severity.EVACUATE,
};

const depthButtons: { id: ReportDepth; label: string }[] = [
  { id: "ankle", label: "Ankle" },
  { id: "knee", label: "Knee" },
  { id: "waist", label: "Waist" },
  { id: "chest", label: "Above waist" },
];

const SIGNAL_LABELS: Record<Severity, string> = {
  MONITOR: "Monitor",
  PREPARE: "Prepare",
  LEAVE: "Leave area",
  EVACUATE: "Evacuate now",
};

const SIGNAL_DESCRIPTIONS: Record<Severity, string> = {
  MONITOR:
    "Conditions are being monitored. Flooding is possible within the next 24-48 hours. Stay vigilant, secure loose outdoor items, and check your emergency supplies. Listen to official government broadcasts for updates.",
  PREPARE:
    "URGENT: Flooding is imminent. Ensure your Go-Bag is complete with 3 days of food/water, medicine, and documents. Charge all devices and power banks. Identify your nearest evacuation route and prepare to move at a moment's notice.",
  LEAVE:
    "CRITICAL: High risk of life-threatening flooding. Vulnerable residents, including those near waterways or in low-lying areas, must relocate to higher ground or a designated center immediately. Do not wait for conditions to worsen.",
  EVACUATE:
    "IMMEDIATE DANGER: Severe flooding is occurring. Your life may be at risk. Drop everything and move to the nearest safe evacuation center immediately. Do not attempt to cross flooded streets. Follow all instructions from emergency responders without delay.",
};

const ACTION_LABELS: Record<GlobalAction, string> = {
  STAY_MONITOR: "Stay and Monitor",
  PREPARE_GO_BAG: "Prepare Go-Bag",
  LEAVE_NOW: "Leave Now",
  EVACUATE_NOW: "Evacuate Immediately",
};

const ACTION_DESCRIPTIONS: Record<GlobalAction, string> = {
  STAY_MONITOR: "Conditions are manageable. Stay alert and monitor updates.",
  PREPARE_GO_BAG: "Prepare essentials. Be ready to leave if conditions worsen.",
  LEAVE_NOW: "Head to the nearest safe evacuation center now.",
  EVACUATE_NOW: "Immediate evacuation recommended. Go to the nearest center.",
};

function formatHour(iso: string): string {
  try {
    const d = new Date(iso);
    const h = d.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}${ampm}`;
  } catch {
    return "--";
  }
}

function formatFreshness(iso: string | undefined): string {
  if (!iso) return "No data yet";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  } catch {
    return "Unknown";
  }
}

function ForecastRow({ entry }: { entry: HourlyForecastEntry }) {
  const prob = entry.precipitation?.probability?.percent ?? 0;
  const qpf = entry.precipitation?.qpf?.quantity ?? 0;
  return (
    <View style={styles.forecastRow}>
      <Text style={styles.forecastHour}>
        {formatHour(entry.interval.startTime)}
      </Text>
      <Text style={styles.forecastCondition} numberOfLines={1}>
        {entry.weatherCondition?.description?.text ?? "--"}
      </Text>
      <Text style={styles.forecastRain}>{prob}%</Text>
      <Text style={styles.forecastQpf}>{qpf.toFixed(1)} mm</Text>
    </View>
  );
}

const DIRE_MARKER_ID = "dire-user-pin";
const PANEL_COLLAPSED = 120;

export default function HomeScreen() {
  const router = useRouter();
  const { isConnected } = useConnectivity();
  const { location } = useUserLocation();
  const { highestSeverityAlert } = useAlerts(
    location.latitude,
    location.longitude,
  );
  const {
    signal,
    weather,
    loading: weatherLoading,
    signalOverride,
    setSignalOverride,
  } = useWeatherSignal(
    location.latitude,
    location.longitude,
    highestSeverityAlert?.severity,
  );

  const {
    centers,
    loading: centersLoading,
    refresh: refreshCenters,
  } = useCenters(location.latitude, location.longitude);
  const { floodReports, drainReports, reportsLoaded, addFloodReport } =
    useMapReports();
  const { choice: geminiChoice, loading: geminiLoading } = useGeminiCenter(
    location.latitude,
    location.longitude,
    centers,
  );
  const {
    decision,
    loading: decisionLoading,
    evaluate: runDecision,
  } = useEvacuationDecision();

  const { urgentMarkers } = useUrgentMarkers();
  const { entries: floodEntries, zones: floodZones } = useFloodCoverage();
  const { markers: dpwhMarkers, getProjectById } = useDpwhProjects();
  const streetHighlights = useFloodStreetHighlights(floodEntries);

  const [legendVisible, setLegendVisible] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showDpwhLayer, setShowDpwhLayer] = useState(true);
  const [selectedDpwhId, setSelectedDpwhId] = useState<string | null>(null);
  const mapRef = useRef<MapDisplayRef>(null);
  const [searchMarker, setSearchMarker] = useState<MapMarker | null>(null);
  const [direMarker, setDireMarker] = useState<MapMarker | null>(null);
  const [direSending, setDireSending] = useState(false);
  const [direActive, setDireActive] = useState(false);
  const [selectedFloodReport, setSelectedFloodReport] =
    useState<FloodReport | null>(null);

  const { latestAssessment } = useAppSlice();
  const { mergeAiChecklist } = usePreparedness();
  const { mergeAiChecklist: mergeSharedChecklist } = useChecklistStore();
  const assessmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestAssessment) return;
    const id = `${latestAssessment.urgencyLevel}-${latestAssessment.summary.slice(0, 20)}`;
    if (assessmentIdRef.current === id) return;
    assessmentIdRef.current = id;

    refreshCenters();

    if (latestAssessment.checklistItems.length > 0) {
      mergeAiChecklist(latestAssessment.checklistItems);
      // FR-7: Also merge into the shared checklist store for cross-page sync
      mergeSharedChecklist(latestAssessment.checklistItems);
    }
  }, [
    latestAssessment,
    refreshCenters,
    mergeAiChecklist,
    mergeSharedChecklist,
  ]);

  useEffect(() => {
    if (legendVisible) {
      const backAction = () => {
        setLegendVisible(false);
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction,
      );
      return () => backHandler.remove();
    }
  }, [legendVisible]);

  const signalColor = tokens.colors.severity[signal];
  const current = weather?.current ?? null;
  const forecastHours = (weather?.forecast ?? []).slice(0, 6);

  const selectedProject = useMemo(
    () => (selectedDpwhId ? getProjectById(selectedDpwhId) : undefined),
    [selectedDpwhId, getProjectById],
  );

  const handleMarkerPress = useCallback(
    (marker: MapMarker) => {
      if (marker.category === "dpwh") {
        setSelectedDpwhId(marker.id);
        setSelectedFloodReport(null);
        mapRef.current?.animateToRegion(
          {
            latitude: marker.latitude,
            longitude: marker.longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          },
          500,
        );
      } else if (marker.category === "flood") {
        // Find the matching FloodReport from the marker id
        const reportId = marker.id.replace("flood-", "");
        const report = floodReports.find((r) => r.id === reportId);
        if (report) {
          setSelectedFloodReport(report);
          setSelectedDpwhId(null);
          mapRef.current?.animateToRegion(
            {
              latitude: marker.latitude,
              longitude: marker.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            },
            500,
          );
        }
      } else {
        setSelectedFloodReport(null);
      }
    },
    [floodReports],
  );

  const handleZonePress = useCallback((zone: MapZone) => {
    const coords = zone.coordinates;
    if (coords.length === 0) return;
    let minLat = coords[0].latitude;
    let maxLat = coords[0].latitude;
    let minLng = coords[0].longitude;
    let maxLng = coords[0].longitude;
    for (const c of coords) {
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLng) minLng = c.longitude;
      if (c.longitude > maxLng) maxLng = c.longitude;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: (maxLat - minLat) * 1.3,
        longitudeDelta: (maxLng - minLng) * 1.3,
      },
      600,
    );
  }, []);

  const handleSearchSelect = useCallback((place: PlaceLocation) => {
    const region = {
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    mapRef.current?.animateToRegion(region, 600);
    setSearchMarker({
      id: "search-result",
      latitude: place.latitude,
      longitude: place.longitude,
      pinColor: "#000000",
      opacity: 1,
      title: place.name,
      description: place.address,
    });
  }, []);

  const handleEvaluate = useCallback(() => {
    void runDecision({
      userLocation: location,
      weather,
      signal,
      floodReports,
      drainReports,
      centers,
    });
  }, [
    runDecision,
    location,
    weather,
    signal,
    floodReports,
    drainReports,
    centers,
  ]);

  const isTyphoon =
    signal === "PREPARE" || signal === "LEAVE" || signal === "EVACUATE";

  const prevFloodCountRef = useRef(0);

  useEffect(() => {
    if (!isTyphoon) return;
    if (decisionLoading) return;
    if (centersLoading || centers.length === 0) return;
    if (!reportsLoaded) return;

    // Re-evaluate when flood reports arrive or change significantly
    const floodCountChanged =
      decision && floodReports.length !== prevFloodCountRef.current;
    if (decision && !floodCountChanged) return;

    prevFloodCountRef.current = floodReports.length;
    void runDecision({
      userLocation: location,
      weather,
      signal,
      floodReports,
      drainReports,
      centers,
    });
  }, [
    isTyphoon,
    decisionLoading,
    decision,
    centersLoading,
    centers,
    reportsLoaded,
    runDecision,
    location,
    weather,
    signal,
    floodReports,
    drainReports,
  ]);

  // Standalone route fetch: for any of the top 3 recommended centers whose
  // route the engine failed to fetch, try fetching directly so we can draw
  // routes on roads instead of gray straight lines.
  const [fallbackRoutes, setFallbackRoutes] = useState<
    Record<string, RouteResult>
  >({});
  const fallbackFetchRef = useRef<string>("");

  useEffect(() => {
    const top3 = decision?.recommendedCenters.slice(0, 3) ?? [];
    const missing = top3.filter((ev) => !ev.route);
    if (missing.length === 0) {
      setFallbackRoutes({});
      fallbackFetchRef.current = "";
      return;
    }

    // Build a stable key so we don't refetch the same set
    const key = missing.map((ev) => ev.center.id).join(",");
    if (fallbackFetchRef.current === key) return;
    fallbackFetchRef.current = key;

    const from: LatLng = {
      latitude: location.latitude,
      longitude: location.longitude,
    };

    void (async () => {
      const map: Record<string, RouteResult> = {};
      for (const ev of missing) {
        try {
          const to: LatLng = {
            latitude: ev.center.lat,
            longitude: ev.center.lng,
          };
          const route = await getRouteGuidance(
            from,
            to,
            "Kasalukuyang lokasyon",
            ev.center.name,
          );
          map[ev.center.id] = route;
        } catch {
          // skip this center
        }
      }
      setFallbackRoutes(map);
    })();
  }, [decision, location.latitude, location.longitude]);

  // Route colors
  const SAFE_ROUTE_COLORS = ["#000000", "#6B7280", "#9CA3AF"] as const;
  const FLOODED_COLOR = "#DC2626";

  // Navigation target: first non-flooded center, or #1 if all flooded.
  const navTarget = useMemo(() => {
    if (!decision) return null;
    const top3 = decision.recommendedCenters.slice(0, 3);
    return top3.find((ev) => !ev.flooded) ?? top3[0] ?? null;
  }, [decision]);

  // Build the main route overlay (navigation target, thickest line)
  const routeOverlay = useMemo(() => {
    if (!navTarget) return null;

    const route = navTarget.route ?? fallbackRoutes[navTarget.center.id];
    if (route) {
      const color = navTarget.flooded ? FLOODED_COLOR : SAFE_ROUTE_COLORS[0];
      return { polyline: route.polyline, color, width: 5 };
    }

    // Last resort: thin straight line while route is still loading
    return {
      polyline: [
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: navTarget.center.lat, longitude: navTarget.center.lng },
      ],
      color: "#9CA3AF",
      width: 2,
    };
  }, [navTarget, fallbackRoutes, location.latitude, location.longitude]);

  // Build secondary route overlays for the other 2 centers
  const secondaryRouteOverlays = useMemo(() => {
    if (!decision || !navTarget) return [];
    const overlays: { polyline: LatLng[]; color: string; width: number }[] = [];
    const top3 = decision.recommendedCenters.slice(0, 3);
    let colorIdx = 1;
    for (const ev of top3) {
      if (ev.center.id === navTarget.center.id) continue;
      const route = ev.route ?? fallbackRoutes[ev.center.id];
      if (route) {
        overlays.push({
          polyline: route.polyline,
          color: ev.flooded
            ? FLOODED_COLOR
            : (SAFE_ROUTE_COLORS[colorIdx] ?? "#9CA3AF"),
          width: 3,
        });
      }
      colorIdx++;
    }
    return overlays;
  }, [decision, navTarget, fallbackRoutes]);

  const initialRegion = {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  const markers: MapMarker[] = useMemo(() => {
    const result: MapMarker[] = [];
    for (const c of centers) {
      result.push({
        id: c.id,
        latitude: c.lat,
        longitude: c.lng,
        pinColor: tokens.colors.safe,
        opacity: 1,
        title: c.name,
        description: `${c.status.toUpperCase()} \u2014 ${c.distanceKm} km`,
        category: "center",
      });
    }
    for (const u of urgentMarkers) {
      result.push({
        id: `urgent-${u.id}`,
        latitude: u.lat,
        longitude: u.lng,
        // FR-6: Purple pin for "urgent to save", red for "high"
        pinColor: getUrgentPinColor(u.urgencyLevel),
        opacity: 1,
        title:
          u.urgencyLevel === "very_urgent"
            ? "\u{1F7E3} URGENT TO SAVE"
            : "NEED HELP",
        description: u.summary || "Urgent rescue request",
        category: "urgent_rescue",
      });
    }

    for (const r of floodReports) {
      result.push({
        id: `flood-${r.id}`,
        latitude: r.lat,
        longitude: r.lng,
        pinColor: DEPTH_COLORS[r.depth],
        opacity: r.status === "confirmed" ? 1 : 0.6,
        title: `Flood: ${r.depth} depth`,
        description: `${r.status === "confirmed" ? "Confirmed" : "Pending"} — ${r.reporterLabel}`,
        category: "flood",
      });
    }

    for (const d of drainReports) {
      result.push({
        id: `drain-${d.id}`,
        latitude: d.lat,
        longitude: d.lng,
        pinColor: "#6B7280",
        opacity: d.status === "confirmed" ? 1 : 0.6,
        title: "Clogged drain",
        description: d.description,
        category: "drain",
      });
    }

    if (showDpwhLayer) result.push(...dpwhMarkers);
    if (searchMarker) result.push(searchMarker);
    if (direMarker) result.push(direMarker);
    return result;
  }, [
    centers,
    floodReports,
    drainReports,
    searchMarker,
    dpwhMarkers,
    showDpwhLayer,
    direMarker,
  ]);

  const zones: MapZone[] = useMemo(() => {
    if (!showFloodLayer) return [];
    return floodZones.map((z) => ({
      id: z.id,
      coordinates: z.coordinates,
      fillColor: z.fillColor,
      strokeColor: z.strokeColor,
      strokeWidth: 2,
      tappable: true,
      title: z.city,
      description: z.description,
    }));
  }, [showFloodLayer, floodZones]);

  const polylines = useMemo(
    () => [
      ...secondaryRouteOverlays,
      ...(showFloodLayer ? streetHighlights : []),
    ],
    [secondaryRouteOverlays, showFloodLayer, streetHighlights],
  );

  return (
    <View style={styles.root}>
      <MapDisplay
        ref={mapRef}
        initialRegion={initialRegion}
        markers={markers}
        zones={zones}
        polylines={polylines}
        routeOverlay={routeOverlay}
        showsMyLocationButton={false}
        onMarkerPress={handleMarkerPress}
        onZonePress={handleZonePress}
      />

      <SafeAreaView
        style={styles.topOverlay}
        edges={["top"]}
        pointerEvents="box-none"
      >
        <LocationSearchBar
          userLat={location.latitude}
          userLng={location.longitude}
          onSelect={handleSearchSelect}
          statusBadge={
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isConnected
                    ? tokens.colors.safe
                    : tokens.colors.ctaPrimary,
                },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {isConnected ? "Online" : "Offline"}
              </Text>
            </View>
          }
        />

        {highestSeverityAlert ? (
          <View style={styles.alertPanel}>
            <AlertCard
              alert={highestSeverityAlert}
              onPressPrimary={() =>
                router.push(highestSeverityAlert.primaryCtaPath as never)
              }
            />
          </View>
        ) : (
          <View style={styles.alertPanelInactive}>
            <Text style={styles.alertInactiveTitle}>No active flood alert</Text>
            <Text style={styles.alertInactiveSub}>
              Browse the map and prepare your go-bag.
            </Text>
          </View>
        )}

        {selectedFloodReport ? (
          <View
            style={[
              styles.floodReportPopup,
              {
                borderLeftColor: DEPTH_COLORS[selectedFloodReport.depth],
              },
            ]}
          >
            <View style={styles.floodPopupHeader}>
              <View
                style={[
                  styles.floodPopupBadge,
                  {
                    backgroundColor: DEPTH_COLORS[selectedFloodReport.depth],
                  },
                ]}
              >
                <Text style={styles.floodPopupBadgeText}>
                  {selectedFloodReport.depth.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.floodPopupTitle} numberOfLines={1}>
                Flood Report
              </Text>
              <Pressable
                onPress={() => setSelectedFloodReport(null)}
                hitSlop={12}
              >
                <Text style={styles.floodPopupClose}>{"\u2715"}</Text>
              </Pressable>
            </View>
            <Text style={styles.floodPopupStatus}>
              {selectedFloodReport.status === "confirmed"
                ? "\u2705 Confirmed"
                : "\u23F3 Pending verification"}
              {" \u2014 "}
              {selectedFloodReport.reporterLabel}
            </Text>
            <Text style={styles.floodPopupCoords}>
              {selectedFloodReport.lat.toFixed(4)},{" "}
              {selectedFloodReport.lng.toFixed(4)}
            </Text>
          </View>
        ) : null}
      </SafeAreaView>

      {legendVisible ? (
        <View style={styles.legend} pointerEvents="box-none">
          <View style={styles.legendHeaderSection}>
            <Text style={styles.legendSectionTitle}>Map Filters</Text>
            <Pressable
              onPress={() => setLegendVisible(false)}
              style={styles.closeLegendIcon}
            >
              <Text style={styles.closeLegendText}>{"\u2715"}</Text>
            </Pressable>
          </View>

          <View style={styles.legendSection}>
            <Text style={styles.legendTitle}>Visibility Toggles</Text>
            <Pressable
              onPress={() => setShowFloodLayer((v) => !v)}
              style={styles.layerToggle}
            >
              <View
                style={[
                  styles.toggleIndicator,
                  showFloodLayer && styles.toggleActive,
                ]}
              >
                {showFloodLayer ? (
                  <Text
                    style={{ color: "#FFF", fontSize: 14, fontWeight: "800" }}
                  >
                    {"\u2713"}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.legendRowText}>City Flood Hazard Zones</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowDpwhLayer((v) => !v)}
              style={styles.layerToggle}
            >
              <View
                style={[
                  styles.toggleIndicator,
                  showDpwhLayer && styles.toggleActive,
                ]}
              >
                {showDpwhLayer ? (
                  <Text
                    style={{ color: "#FFF", fontSize: 14, fontWeight: "800" }}
                  >
                    {"\u2713"}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.legendRowText}>DPWH Projects</Text>
            </Pressable>
          </View>

          <View style={styles.legendSectionDivider} />

          <View style={styles.legendSection}>
            <Text style={styles.legendTitle}>Map Legend</Text>
            <View style={styles.legendGrid}>
              <View style={styles.legendRow}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: tokens.colors.safe },
                  ]}
                />
                <Text style={styles.legendLabel}>Evacuation Center</Text>
              </View>

              <View style={styles.legendRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: "#3B82F6" }]}
                />
                <Text style={styles.legendLabel}>DPWH: On-Going</Text>
              </View>

              <View style={styles.legendRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: "#6B7280" }]}
                />
                <Text style={styles.legendLabel}>DPWH: Completed</Text>
              </View>

              <View style={styles.legendRow}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: tokens.colors.danger },
                  ]}
                />
                <Text style={styles.legendLabel}>Urgent Rescue</Text>
              </View>
            </View>

            <Text style={[styles.legendTitle, { marginTop: 12 }]}>
              Flood Depth Reports
            </Text>
            <View style={styles.legendGrid}>
              {depthButtons.map((d) => (
                <View key={d.id} style={styles.legendRow}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: DEPTH_COLORS[d.id] },
                    ]}
                  />
                  <Text style={styles.legendLabel}>{d.label}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.legendTitle, { marginTop: 12 }]}>
              Hazard Levels
            </Text>
            <View style={styles.legendGrid}>
              {(["Low", "Medium", "MediumHigh", "High"] as const).map(
                (level) => (
                  <View key={level} style={styles.legendRow}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: HAZARD_COLORS[level] },
                      ]}
                    />
                    <Text style={styles.legendLabel}>
                      {HAZARD_LABELS[level]}
                    </Text>
                  </View>
                ),
              )}
            </View>
          </View>

          <Pressable
            onPress={() => setLegendVisible(false)}
            style={styles.hideLegendButton}
          >
            <Text style={styles.hideLegendButtonText}>Apply Filters</Text>
          </Pressable>
        </View>
      ) : null}

      {!selectedProject ? (
        <HomeFloatingPanel
          expandedHeight={560}
          collapsedHeight={120}
          header={
            <View style={styles.panelHeaderRow}>
              <Pressable
                style={styles.gpsButton}
                onPress={() => {
                  mapRef.current?.animateToRegion(
                    {
                      latitude: location.latitude,
                      longitude: location.longitude,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    },
                    600,
                  );
                }}
              >
                <Text style={styles.gpsButtonIcon}>{"\u2316"}</Text>
                <Text style={styles.gpsButtonText}>My Location</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.legendButton,
                  legendVisible && styles.legendButtonActive,
                ]}
                onPress={() => setLegendVisible((v) => !v)}
              >
                <Text
                  style={[
                    styles.legendButtonIcon,
                    legendVisible && styles.legendButtonIconActive,
                  ]}
                >
                  {"\u25BC"}
                </Text>
                <Text
                  style={[
                    styles.legendButtonText,
                    legendVisible && styles.legendButtonTextActive,
                  ]}
                >
                  Filters
                </Text>
              </Pressable>

              {!weatherLoading ? (
                <Pressable
                  onLongPress={() => {
                    Alert.alert(
                      `${SIGNAL_LABELS[signal]} Status`,
                      SIGNAL_DESCRIPTIONS[signal],
                      [{ text: "Got it" }],
                    );
                  }}
                  style={[styles.signalBadge, { backgroundColor: signalColor }]}
                >
                  <Text style={styles.signalBadgeIcon}>{"\u26A0"}</Text>
                  <Text style={styles.signalBadgeText}>
                    {SIGNAL_LABELS[signal]}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
        >
          {/* Request for Help */}
          <Pressable
            style={styles.helpButton}
            onPress={() =>
              router.push({
                pathname: "/request-help",
                params: { autoStartVoice: "1" },
              } as never)
            }
          >
            <Text style={styles.helpButtonIcon}>{"\u26A0"}</Text>
            <View style={styles.helpButtonContent}>
              <Text style={styles.helpButtonTitle}>Humingi ng Tulong</Text>
              <Text style={styles.helpButtonSub}>
                AI assessment ng sitwasyon mo
              </Text>
            </View>
            <Text style={styles.helpButtonArrow}>{"\u203A"}</Text>
          </Pressable>

          {/* Panahon card */}
          <View
            style={[styles.card, { borderWidth: 1, borderColor: signalColor }]}
          >
            <View style={styles.weatherHeader}>
              <View style={styles.weatherHeaderLeft}>
                <Text style={styles.cardTitle}>Panahon</Text>
                {current ? (
                  <>
                    <Text style={styles.weatherTemp}>
                      {Math.round(current.temperature.degrees)}
                      {"\u00B0"}C — {current.weatherCondition.description.text}
                    </Text>
                    <Text style={styles.cardSub}>
                      Rain {current.precipitation?.probability?.percent ?? 0}%
                      {" · "}
                      {(current.precipitation?.qpf?.quantity ?? 0).toFixed(
                        1,
                      )}{" "}
                      mm/h
                    </Text>
                  </>
                ) : (
                  <Text style={styles.cardSub}>
                    {weatherLoading ? "Loading\u2026" : "No weather data"}
                  </Text>
                )}
              </View>
              <View
                style={[styles.signalChip, { backgroundColor: signalColor }]}
              >
                <Text style={styles.signalChipText}>
                  {SIGNAL_LABELS[signal]}
                </Text>
              </View>
            </View>

            {forecastHours.length > 0 ? (
              <View style={styles.forecastList}>
                <View style={styles.forecastRow}>
                  <Text style={[styles.forecastHour, styles.forecastHeader]}>
                    Oras
                  </Text>
                  <Text
                    style={[styles.forecastCondition, styles.forecastHeader]}
                  >
                    Lagay
                  </Text>
                  <Text style={[styles.forecastRain, styles.forecastHeader]}>
                    Prob
                  </Text>
                  <Text style={[styles.forecastQpf, styles.forecastHeader]}>
                    Ulan
                  </Text>
                </View>
                {forecastHours.map((h, i) => (
                  <ForecastRow key={i} entry={h} />
                ))}
              </View>
            ) : null}

            <Text style={styles.freshness}>
              {weather?.fetchedAt
                ? `Updated ${formatFreshness(weather.fetchedAt)}`
                : "Waiting for data"}
              {!isConnected ? " \u00B7 Cached" : ""}
            </Text>
          </View>

          {/* Evacuation Assessment card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Evacuation Assessment</Text>
            {decision ? (
              <>
                <View
                  style={[
                    styles.actionBanner,
                    { backgroundColor: signalColor },
                  ]}
                >
                  <Text style={styles.actionBannerText}>
                    {ACTION_LABELS[decision.globalAction]}
                  </Text>
                </View>
                <Text style={styles.cardSub}>
                  {ACTION_DESCRIPTIONS[decision.globalAction]}
                </Text>
                <View style={styles.explainBox}>
                  <Text style={styles.explainText}>
                    {decision.explainability.weatherReason}
                  </Text>
                  <Text style={styles.explainText}>
                    {decision.explainability.reportReason}
                  </Text>
                  <Text style={styles.explainText}>
                    {decision.explainability.routeReason}
                  </Text>
                </View>
                {decision.recommendedCenters.length > 0 ? (
                  <View style={styles.centerRecommendations}>
                    <Text style={styles.cardSub}>Recommended centers:</Text>
                    {decision.recommendedCenters.slice(0, 3).map((ev) => (
                      <Pressable
                        key={ev.center.id}
                        style={[
                          styles.centerRow,
                          ev.flooded && styles.centerRowFlooded,
                        ]}
                        onPress={() => {
                          mapRef.current?.animateToRegion(
                            {
                              latitude: ev.center.lat,
                              longitude: ev.center.lng,
                              latitudeDelta: 0.01,
                              longitudeDelta: 0.01,
                            },
                            600,
                          );
                        }}
                      >
                        <Text style={styles.centerName}>
                          {ev.flooded ? "\u26A0 " : ""}
                          {navTarget?.center.id === ev.center.id
                            ? "\u25B8 "
                            : ""}
                          {ev.center.name}
                        </Text>
                        <Text style={styles.centerMeta}>
                          {ev.center.distanceKm.toFixed(1)} km ·{" "}
                          {ev.center.status}
                          {ev.route ? ` · ${ev.route.durationText}` : ""}
                          {ev.flooded ? " · FLOODED" : ""}
                          {!ev.flooded && navTarget?.center.id === ev.center.id
                            ? " · RECOMMENDED"
                            : ""}
                        </Text>
                      </Pressable>
                    ))}
                    {(() => {
                      const top3 = decision.recommendedCenters.slice(0, 3);
                      const floodedCount = top3.filter(
                        (ev) => ev.flooded,
                      ).length;
                      if (floodedCount === 0) return null;
                      const allFlooded = floodedCount === top3.length;
                      return (
                        <View
                          style={{
                            backgroundColor: allFlooded
                              ? tokens.colors.severity.EVACUATE
                              : tokens.colors.severity.LEAVE,
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontWeight: "700",
                              fontSize: 13,
                              textAlign: "center",
                            }}
                          >
                            {allFlooded
                              ? "\u26A0 Lahat ng ruta ay dumadaan sa baha \u2014 pinakamalapit na center ang gagamitin. Mag-ingat!"
                              : "\u26A0 May ruta na dumadaan sa baha \u2014 nag-reroute sa clear na center"}
                          </Text>
                        </View>
                      );
                    })()}
                    {navTarget ? (
                      <Pressable
                        style={[
                          styles.primaryButton,
                          navTarget.flooded && {
                            backgroundColor: FLOODED_COLOR,
                          },
                        ]}
                        onPress={() => {
                          router.push({
                            pathname: "/navigate",
                            params: { centerId: navTarget.center.id },
                          } as never);
                        }}
                      >
                        <Text style={styles.primaryButtonText}>
                          {navTarget.flooded
                            ? `Navigate to ${navTarget.center.name} (Flooded)`
                            : `Navigate to ${navTarget.center.name}`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <Text style={styles.disclaimer}>{decision.disclaimerText}</Text>
                <Text style={styles.cardSub}>
                  Confidence: {Math.round(decision.confidence * 100)}%
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.cardSub}>
                  Evaluate current conditions to get a personalized evacuation
                  recommendation.
                </Text>
                <Pressable
                  style={styles.primaryButton}
                  onPress={handleEvaluate}
                  disabled={decisionLoading}
                >
                  {decisionLoading ? (
                    <ActivityIndicator color={tokens.colors.ctaText} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Evaluate Evacuation
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>

          {/* DEV: Signal override for testing typhoon mode */}
          {__DEV__ ? (
            <View style={styles.devCard}>
              <Text style={styles.devTitle}>DEV: Force Signal</Text>
              <View style={styles.devRow}>
                {(
                  [null, "MONITOR", "PREPARE", "LEAVE", "EVACUATE"] as const
                ).map((s) => {
                  const label = s ?? "Auto";
                  const active = signalOverride === s;
                  return (
                    <Pressable
                      key={label}
                      style={[
                        styles.devChip,
                        active && styles.devChipActive,
                        s && { borderColor: tokens.colors.severity[s] },
                        active &&
                          s && { backgroundColor: tokens.colors.severity[s] },
                      ]}
                      onPress={() => setSignalOverride(s)}
                    >
                      <Text
                        style={[
                          styles.devChipText,
                          active && styles.devChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {signalOverride ? (
                <Text style={styles.devHint}>
                  Signal forced to {signalOverride}. Typhoon mode:{" "}
                  {["PREPARE", "LEAVE", "EVACUATE"].includes(signalOverride)
                    ? "ON"
                    : "OFF"}
                </Text>
              ) : null}
            </View>
          ) : null}
        </HomeFloatingPanel>
      ) : null}

      {selectedProject ? (
        <DPWHProjectPanel
          project={selectedProject}
          onClose={() => setSelectedDpwhId(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.colors.background },

  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  signalBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
    justifyContent: "center",
  },
  signalBadgeIcon: { fontSize: 14, color: "#FFFFFF" },
  signalBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  alertPanel: { marginTop: 4 },
  floodReportPopup: {
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: tokens.radius.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.md,
    gap: 4,
    boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
  },
  floodPopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  floodPopupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  floodPopupBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  floodPopupTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
  },
  floodPopupClose: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
    fontWeight: "800",
  },
  floodPopupStatus: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  floodPopupCoords: {
    fontSize: 11,
    color: tokens.colors.textSecondary,
    fontFamily: "monospace",
  },
  alertPanelInactive: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    gap: 4,
  },
  alertInactiveTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  alertInactiveSub: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },

  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.sm,
  },
  gpsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.colors.surfaceAlt,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
    justifyContent: "center",
  },
  gpsButtonIcon: { fontSize: 16, color: tokens.colors.ctaPrimary },
  gpsButtonText: {
    color: tokens.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  legendButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.colors.surfaceAlt,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
    justifyContent: "center",
  },
  legendButtonIcon: { fontSize: 14, color: tokens.colors.ctaPrimary },
  legendButtonActive: { backgroundColor: tokens.colors.ctaPrimary },
  legendButtonText: {
    color: tokens.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  legendButtonTextActive: { color: "#FFFFFF" },
  legendButtonIconActive: { color: "#FFFFFF" },

  legend: {
    position: "absolute",
    bottom: PANEL_COLLAPSED + tokens.spacing.md,
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    zIndex: 12,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    borderCurve: "continuous",
  },
  legendHeaderSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  legendSectionTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  closeLegendIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLegendText: {
    fontSize: 12,
    color: tokens.colors.textPrimary,
    fontWeight: "800",
  },
  legendSection: { gap: 8 },
  legendSectionDivider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginVertical: 4,
  },
  legendTitle: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  legendRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4,
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
  },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: {
    color: tokens.colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  legendRowText: {
    color: tokens.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  layerToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  toggleIndicator: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.colors.textDisabled,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: tokens.colors.ctaPrimary,
    borderColor: tokens.colors.ctaPrimary,
  },
  hideLegendButton: {
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: tokens.colors.ctaPrimary,
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  },
  hideLegendButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
  },
  cardTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  cardSub: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    lineHeight: 21,
  },
  weatherHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing.sm,
  },
  weatherHeaderLeft: { flex: 1, gap: 2 },
  weatherTemp: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  signalChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  signalChipText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  forecastList: { gap: 2 },
  forecastRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  forecastHeader: {
    fontWeight: "700",
    color: tokens.colors.textSecondary,
    fontSize: 11,
  },
  forecastHour: { width: 42, color: tokens.colors.textPrimary, fontSize: 12 },
  forecastCondition: {
    flex: 1,
    color: tokens.colors.textSecondary,
    fontSize: 12,
  },
  forecastRain: {
    width: 40,
    textAlign: "right",
    color: tokens.colors.textPrimary,
    fontSize: 12,
  },
  forecastQpf: {
    width: 52,
    textAlign: "right",
    color: tokens.colors.textSecondary,
    fontSize: 12,
  },
  freshness: { color: tokens.colors.textDisabled, fontSize: 11 },

  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.danger,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    borderCurve: "continuous",
    boxShadow: "0 2px 12px rgba(239,68,68,0.30)",
  },
  helpButtonIcon: {
    fontSize: 24,
    color: "#FFFFFF",
  },
  helpButtonContent: {
    flex: 1,
    gap: 2,
  },
  helpButtonTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  helpButtonSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  helpButtonArrow: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "300",
  },
  direButton: {
    minHeight: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(239,68,68,0.35)",
    borderCurve: "continuous",
  },
  direButtonText: {
    color: "#FFFFFF",
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
  safeButton: {
    minHeight: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.safe,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(34,197,94,0.35)",
    borderCurve: "continuous",
  },
  safeButtonText: {
    color: "#FFFFFF",
    fontSize: tokens.type.body,
    fontWeight: "700",
  },

  actionBanner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  actionBannerText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  explainBox: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    gap: 4,
  },
  explainText: { color: tokens.colors.textSecondary, fontSize: 12 },
  centerRecommendations: { gap: tokens.spacing.xs },
  centerRow: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    gap: 2,
  },
  centerRowFlooded: {
    borderWidth: 1,
    borderColor: tokens.colors.danger,
  },
  centerName: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  centerMeta: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: tokens.colors.ctaText,
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
  disclaimer: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    fontStyle: "italic",
  },
  devCard: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    gap: tokens.spacing.xs,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderStyle: "dashed",
  },
  devTitle: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  devRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  devChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.background,
  },
  devChipActive: {
    backgroundColor: tokens.colors.ctaPrimary,
    borderColor: tokens.colors.ctaPrimary,
  },
  devChipText: {
    color: tokens.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  devChipTextActive: {
    color: "#FFFFFF",
  },
  devHint: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    fontStyle: "italic",
  },
});

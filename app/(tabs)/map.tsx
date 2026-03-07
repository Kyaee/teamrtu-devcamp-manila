import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Severity } from "@/src/design/tokens";
import { tokens } from "@/src/design/tokens";
import { useWeatherSignal } from "@/src/features/alerts/use-weather-signal";
import { useCenters } from "@/src/features/centers/use-centers";
import type { GlobalAction } from "@/src/features/decision-engine/types";
import { useEvacuationDecision } from "@/src/features/decision-engine/use-evacuation-decision";
import { DPWHProjectPanel } from "@/src/features/map/DPWHProjectPanel";
import { LocationSearchBar } from "@/src/features/map/LocationSearchBar";
import type { MapDisplayRef, MapMarker } from "@/src/features/map/MapDisplay";
import MapDisplay from "@/src/features/map/MapDisplay";
import { useDpwhProjects } from "@/src/features/map/use-dpwh-projects";
import {
  HAZARD_COLORS,
  HAZARD_LABELS,
  useFloodCoverage,
} from "@/src/features/map/use-flood-coverage";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import type { PlaceLocation } from "@/src/services/places";
import type { ReportDepth } from "@/src/types/domain";
import type { HourlyForecastEntry } from "@/src/types/weather";

const depthButtons: { id: ReportDepth; label: string }[] = [
  { id: "ankle", label: "Ankle" },
  { id: "knee", label: "Knee" },
  { id: "waist", label: "Waist" },
  { id: "chest", label: "Above waist" },
];

const DEPTH_COLORS: Record<ReportDepth, string> = {
  ankle: tokens.colors.severity.MONITOR,
  knee: tokens.colors.severity.PREPARE,
  waist: tokens.colors.severity.LEAVE,
  chest: tokens.colors.severity.EVACUATE,
};

const SIGNAL_LABELS: Record<Severity, string> = {
  MONITOR: "Monitor",
  PREPARE: "Prepare",
  LEAVE: "Leave area",
  EVACUATE: "Evacuate now",
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

export default function MapScreen() {
  const { push } = useRouter();
  const { isConnected } = useConnectivity();
  const { location } = useUserLocation();
  const {
    signal,
    weather,
    loading: weatherLoading,
  } = useWeatherSignal(location.latitude, location.longitude);
  const {
    floodReports,
    drainReports,
    queueCount,
    syncMessage,
    confirmationHint,
    addFloodReport,
    addDrainReport,
    syncQueuedReports,
  } = useMapReports();
  const { centers } = useCenters(location.latitude, location.longitude);
  const {
    decision,
    loading: decisionLoading,
    evaluate: runDecision,
  } = useEvacuationDecision();
  const { markers: floodMarkers } = useFloodCoverage();
  const { markers: dpwhMarkers, getProjectById } = useDpwhProjects();
  const [legendVisible, setLegendVisible] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showDpwhLayer, setShowDpwhLayer] = useState(true);
  const [selectedDpwhId, setSelectedDpwhId] = useState<string | null>(null);
  const mapRef = useRef<MapDisplayRef>(null);
  const [searchMarker, setSearchMarker] = useState<MapMarker | null>(null);

  const current = weather?.current ?? null;
  const forecastHours = (weather?.forecast ?? []).slice(0, 6);
  const signalColor = tokens.colors.severity[signal];

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

  const routeOverlay = useMemo(() => {
    const bestRoute = decision?.recommendedCenters[0]?.route;
    if (!bestRoute) return null;
    return { polyline: bestRoute.polyline, color: "#000000", width: 4 };
  }, [decision]);

  const initialRegion = {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

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

  const selectedProject = useMemo(
    () => (selectedDpwhId ? getProjectById(selectedDpwhId) : undefined),
    [selectedDpwhId, getProjectById],
  );

  const handleMarkerPress = useCallback((marker: MapMarker) => {
    if (marker.category === "dpwh") {
      setSelectedDpwhId(marker.id);
      mapRef.current?.animateToRegion(
        {
          latitude: marker.latitude,
          longitude: marker.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        500,
      );
    }
  }, []);

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
        description: `${c.status.toUpperCase()} — ${c.distanceKm} km`,
        category: "center",
      });
    }
    if (showFloodLayer) result.push(...floodMarkers);
    if (showDpwhLayer) result.push(...dpwhMarkers);
    if (searchMarker) result.push(searchMarker);
    return result;
  }, [
    centers,
    searchMarker,
    floodMarkers,
    dpwhMarkers,
    showFloodLayer,
    showDpwhLayer,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.mapContainer}>
        <MapDisplay
          ref={mapRef}
          initialRegion={initialRegion}
          markers={markers}
          routeOverlay={routeOverlay}
          onMarkerPress={handleMarkerPress}
        />

        <View style={styles.statusOverlay}>
          <Text style={styles.statusText}>
            {isConnected ? "Live" : "Offline (cached)"}
          </Text>
        </View>

        {!weatherLoading ? (
          <View style={[styles.signalBadge, { backgroundColor: signalColor }]}>
            <Text style={styles.signalBadgeText}>{SIGNAL_LABELS[signal]}</Text>
          </View>
        ) : null}

        <Pressable
          style={styles.legendToggle}
          onPress={() => setLegendVisible(!legendVisible)}
        >
          <Text style={styles.legendToggleText}>Legend</Text>
        </Pressable>

        {legendVisible ? (
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Map Legend</Text>
            <View style={styles.legendRow}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: tokens.colors.safe },
                ]}
              />
              <Text style={styles.legendLabel}>Evacuation Center</Text>
            </View>

            <Text style={styles.legendTitle}>Flood Depth Reports</Text>
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

            <Pressable
              onPress={() => setShowFloodLayer(!showFloodLayer)}
              style={styles.layerToggle}
            >
              <View
                style={[
                  styles.toggleIndicator,
                  showFloodLayer && styles.toggleActive,
                ]}
              />
              <Text style={styles.legendTitle}>City Flood Hazard</Text>
            </Pressable>
            {(["High", "MediumHigh", "Medium", "Low"] as const).map((level) => (
              <View key={level} style={styles.legendRow}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: HAZARD_COLORS[level] },
                  ]}
                />
                <Text style={styles.legendLabel}>{HAZARD_LABELS[level]}</Text>
              </View>
            ))}

            <Pressable
              onPress={() => setShowDpwhLayer(!showDpwhLayer)}
              style={styles.layerToggle}
            >
              <View
                style={[
                  styles.toggleIndicator,
                  showDpwhLayer && styles.toggleActive,
                ]}
              />
              <Text style={styles.legendTitle}>DPWH Projects</Text>
            </Pressable>
            <View style={styles.legendRow}>
              <View
                style={[styles.legendDot, { backgroundColor: "#3B82F6" }]}
              />
              <Text style={styles.legendLabel}>On-Going</Text>
            </View>
            <View style={styles.legendRow}>
              <View
                style={[styles.legendDot, { backgroundColor: "#6B7280" }]}
              />
              <Text style={styles.legendLabel}>Completed</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Search bar between map and panel */}
      <View style={styles.searchWrap}>
        <LocationSearchBar
          userLat={location.latitude}
          userLng={location.longitude}
          onSelect={handleSearchSelect}
        />
      </View>

      <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
      >
        {/* Weather card */}
        <View style={[styles.card, { borderColor: signalColor }]}>
          <View style={styles.weatherHeader}>
            <View style={styles.weatherHeaderLeft}>
              <Text style={styles.cardTitle}>Panahon</Text>
              {current ? (
                <>
                  <Text style={styles.weatherTemp}>
                    {Math.round(current.temperature.degrees)}
                    {"\u00B0"}C — {current.weatherCondition.description.text}
                  </Text>
                  <Text style={styles.sub}>
                    Rain {current.precipitation?.probability?.percent ?? 0}% ·{" "}
                    {(current.precipitation?.qpf?.quantity ?? 0).toFixed(1)}{" "}
                    mm/h
                  </Text>
                </>
              ) : (
                <Text style={styles.sub}>
                  {weatherLoading ? "Loading\u2026" : "No weather data"}
                </Text>
              )}
            </View>
            <View style={[styles.signalChip, { backgroundColor: signalColor }]}>
              <Text style={styles.signalChipText}>{SIGNAL_LABELS[signal]}</Text>
            </View>
          </View>

          {forecastHours.length > 0 ? (
            <View style={styles.forecastList}>
              <View style={styles.forecastRow}>
                <Text style={[styles.forecastHour, styles.forecastHeader]}>
                  Oras
                </Text>
                <Text style={[styles.forecastCondition, styles.forecastHeader]}>
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

        {/* Evacuation decision card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evacuation Assessment</Text>
          {decision ? (
            <>
              <View
                style={[styles.actionBanner, { backgroundColor: signalColor }]}
              >
                <Text style={styles.actionBannerText}>
                  {ACTION_LABELS[decision.globalAction]}
                </Text>
              </View>
              <Text style={styles.body}>
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
                  <Text style={styles.sub}>Recommended centers:</Text>
                  {decision.recommendedCenters.slice(0, 3).map((ev) => (
                    <Pressable
                      key={ev.center.id}
                      style={styles.centerRow}
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
                      <Text style={styles.centerName}>{ev.center.name}</Text>
                      <Text style={styles.centerMeta}>
                        {ev.center.distanceKm.toFixed(1)} km ·{" "}
                        {ev.center.status}
                        {ev.route ? ` · ${ev.route.durationText}` : ""}
                      </Text>
                    </Pressable>
                  ))}
                  {decision.recommendedCenters[0]?.route ? (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => {
                        const best = decision.recommendedCenters[0];
                        if (best)
                          push({
                            pathname: "/navigate",
                            params: { centerId: best.center.id },
                          } as never);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>
                        Start Navigation
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.disclaimer}>{decision.disclaimerText}</Text>
              <Text style={styles.sub}>
                Confidence: {Math.round(decision.confidence * 100)}%
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.sub}>
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

        {/* Report card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mag-report ng baha</Text>
          <Text style={styles.sub}>{confirmationHint}</Text>
          <View style={styles.depthGrid}>
            {depthButtons.map((depth) => (
              <Pressable
                key={depth.id}
                style={styles.depthButton}
                onPress={() =>
                  addFloodReport(
                    depth.id,
                    isConnected,
                    location.latitude,
                    location.longitude,
                  )
                }
              >
                <View
                  style={[
                    styles.depthIndicator,
                    { backgroundColor: DEPTH_COLORS[depth.id] },
                  ]}
                />
                <Text style={styles.depthText}>{depth.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              addDrainReport(
                "May baradong kanal dito.",
                isConnected,
                location.latitude,
                location.longitude,
              )
            }
          >
            <Text style={styles.secondaryButtonText}>
              Mag-report ng baradong kanal
            </Text>
          </Pressable>
        </View>

        {/* Sync card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sync status</Text>
          <Text style={styles.body}>{syncMessage}</Text>
          <Text style={styles.sub}>Pending: {queueCount}</Text>
          <Pressable style={styles.primaryButton} onPress={syncQueuedReports}>
            <Text style={styles.primaryButtonText}>
              I-sync ang offline queue
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {selectedProject ? (
        <DPWHProjectPanel
          project={selectedProject}
          onClose={() => setSelectedDpwhId(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background },
  mapContainer: { flex: 1, minHeight: 300 },
  statusOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  },
  statusText: { color: tokens.colors.textPrimary, fontSize: tokens.type.label },
  signalBadge: {
    position: "absolute",
    bottom: 12,
    left: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  signalBadgeText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  legendToggle: {
    position: "absolute",
    top: 8,
    right: 52,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  },
  legendToggleText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  legend: {
    position: "absolute",
    top: 40,
    right: 52,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
  },
  legendTitle: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "700",
    marginBottom: 2,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: tokens.colors.textSecondary, fontSize: 12 },
  layerToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  toggleIndicator: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: tokens.colors.textDisabled,
  },
  toggleActive: {
    backgroundColor: tokens.colors.ctaPrimary,
    borderColor: tokens.colors.ctaPrimary,
  },
  searchWrap: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  panel: { maxHeight: 380 },
  panelContent: { padding: tokens.spacing.md, gap: tokens.spacing.md },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  cardTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  body: { color: tokens.colors.textSecondary, fontSize: tokens.type.body },
  sub: { color: tokens.colors.textDisabled, fontSize: tokens.type.label },
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
  depthGrid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.spacing.sm },
  depthButton: {
    minWidth: "47%",
    flexGrow: 1,
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  depthIndicator: { width: 12, height: 12, borderRadius: 6 },
  depthText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: tokens.radius.none,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: tokens.colors.ctaText,
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
  centerName: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  centerMeta: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
  disclaimer: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    fontStyle: "italic",
  },
});

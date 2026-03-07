import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Severity } from "@/src/design/tokens";
import { tokens } from "@/src/design/tokens";
import { AlertCard } from "@/src/features/alerts/alert-card";
import { useAlerts } from "@/src/features/alerts/use-alerts";
import { useWeatherSignal } from "@/src/features/alerts/use-weather-signal";
import { useCenters } from "@/src/features/centers/use-centers";
import { HomeFloatingPanel } from "@/src/features/home/HomeFloatingPanel";
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
import { useFloodStreetHighlights } from "@/src/features/map/use-flood-street-highlights";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { usePreparedness } from "@/src/features/preparedness/use-preparedness";
import type { PlaceLocation } from "@/src/services/places";
import type { ReportDepth } from "@/src/types/domain";
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

export default function HomeScreen() {
  const router = useRouter();
  const { isConnected } = useConnectivity();
  const { location } = useUserLocation();
  const {
    signal,
    weather,
    loading: weatherLoading,
  } = useWeatherSignal(location.latitude, location.longitude);
  const { highestSeverityAlert } = useAlerts();
  const { tasks, toggleTask, completion } = usePreparedness();
  const { confirmationHint, addFloodReport } = useMapReports();
  const { centers } = useCenters(location.latitude, location.longitude);

  const { entries: floodEntries, markers: floodMarkers } = useFloodCoverage();
  const { markers: dpwhMarkers, getProjectById } = useDpwhProjects();
  const streetHighlights = useFloodStreetHighlights(floodEntries);

  const [legendVisible, setLegendVisible] = useState(false);
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showDpwhLayer, setShowDpwhLayer] = useState(true);
  const [selectedDpwhId, setSelectedDpwhId] = useState<string | null>(null);
  const mapRef = useRef<MapDisplayRef>(null);
  const [searchMarker, setSearchMarker] = useState<MapMarker | null>(null);

  const signalColor = tokens.colors.severity[signal];
  const current = weather?.current ?? null;
  const forecastHours = (weather?.forecast ?? []).slice(0, 6);

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

  const polylines = useMemo(
    () => (showFloodLayer ? streetHighlights : []),
    [showFloodLayer, streetHighlights],
  );

  return (
    <View style={styles.root}>
      <MapDisplay
        ref={mapRef}
        initialRegion={initialRegion}
        markers={markers}
        polylines={polylines}
        showsMyLocationButton={false}
        onMarkerPress={handleMarkerPress}
      />

      <SafeAreaView
        style={styles.topOverlay}
        edges={["top"]}
        pointerEvents="box-none"
      >
        <View style={styles.badgeRow} pointerEvents="box-none">
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {isConnected ? "Online" : "Offline"}
            </Text>
          </View>

          {!weatherLoading ? (
            <View
              style={[styles.signalBadge, { backgroundColor: signalColor }]}
            >
              <Text style={styles.signalBadgeText}>
                {SIGNAL_LABELS[signal]}
              </Text>
            </View>
          ) : null}
        </View>

        <LocationSearchBar
          userLat={location.latitude}
          userLng={location.longitude}
          onSelect={handleSearchSelect}
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
      </SafeAreaView>

      <View style={styles.mapControlsWrap} pointerEvents="box-none">
        <Pressable
          style={styles.gpsLabel}
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
          <Text style={styles.gpsLabelIcon}>{"\u2316"}</Text>
          <Text style={styles.gpsLabelText}>My Location</Text>
        </Pressable>

        <Pressable
          style={styles.legendToggle}
          onPress={() => setLegendVisible((v) => !v)}
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

      {!selectedProject ? (
        <HomeFloatingPanel expandedHeight={520} collapsedHeight={120}>
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
                      Rain {current.precipitation?.probability?.percent ?? 0}% ·{" "}
                      {(current.precipitation?.qpf?.quantity ?? 0).toFixed(1)}{" "}
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

          {/* Checklist card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Preparedness checklist ({completion})
            </Text>
            {tasks.map((task) => (
              <Pressable
                key={task.id}
                style={styles.checkRow}
                onPress={() => toggleTask(task.id)}
              >
                <Text style={styles.checkMark}>
                  {task.done ? "\u2713" : "\u25CB"}
                </Text>
                <Text style={styles.cardSub}>{task.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Report card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Mag-report ng baha</Text>
            <Text style={styles.cardSub}>{confirmationHint}</Text>
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
              onPress={() => router.push("/report-drain" as never)}
            >
              <Text style={styles.secondaryButtonText}>
                Mag-report ng baradong kanal
              </Text>
            </Pressable>
          </View>
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
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
  },
  statusBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
  },
  statusBadgeText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  signalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  signalBadgeText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "700",
  },

  alertPanel: {
    marginTop: 4,
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

  mapControlsWrap: {
    position: "absolute",
    bottom: "48%",
    right: tokens.spacing.sm,
    zIndex: 11,
    alignItems: "flex-end",
    gap: tokens.spacing.xs,
  },
  gpsLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    boxShadow: "0 1px 4px rgba(0,0,0,0.14)",
    borderCurve: "continuous",
  },
  gpsLabelIcon: {
    fontSize: 16,
    color: tokens.colors.ctaPrimary,
  },
  gpsLabelText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  legendToggle: {
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
    borderCurve: "continuous",
  },
  legendToggleText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  legend: {
    marginTop: 4,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
    borderCurve: "continuous",
  },
  legendTitle: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "700",
    marginBottom: 2,
  },
  legendRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
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
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkMark: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    width: 18,
    marginTop: 2,
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

  depthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
  },
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
});

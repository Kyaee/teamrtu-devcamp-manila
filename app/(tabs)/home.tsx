import { Link, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
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
  const {
    signal,
    weather,
    loading: weatherLoading,
  } = useWeatherSignal(location.latitude, location.longitude);
  const { highestSeverityAlert } = useAlerts();
  const { floodReports, drainReports } = useMapReports();
  const { centers, loading: centersLoading } = useCenters(
    location.latitude,
    location.longitude,
  );
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

  const handleDireSituation = useCallback(async () => {
    setDireSending(true);
    setDireMarker({
      id: DIRE_MARKER_ID,
      latitude: location.latitude,
      longitude: location.longitude,
      pinColor: tokens.colors.danger,
      opacity: 1,
      title: "I need help!",
      description: "Dire situation reported at this location",
    });
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      },
      500,
    );
    await addFloodReport(
      "chest",
      isConnected,
      location.latitude,
      location.longitude,
    );
    setDireSending(false);
    setDireActive(true);
  }, [addFloodReport, isConnected, location]);

  const handleSafeNow = useCallback(() => {
    setDireMarker(null);
    setDireActive(false);
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
    if (showDpwhLayer) result.push(...dpwhMarkers);
    if (searchMarker) result.push(searchMarker);
    if (direMarker) result.push(direMarker);
    return result;
  }, [centers, searchMarker, dpwhMarkers, showDpwhLayer, direMarker]);

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
    () => (showFloodLayer ? streetHighlights : []),
    [showFloodLayer, streetHighlights],
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
        <View style={styles.badgeRow} pointerEvents="box-none">
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {isConnected ? "Online" : "Offline"}
            </Text>
          </View>
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

      {legendVisible ? (
        <View style={styles.legend} pointerEvents="box-none">
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
            onPress={() => setShowFloodLayer((v) => !v)}
            style={styles.layerToggle}
          >
            <View
              style={[
                styles.toggleIndicator,
                showFloodLayer && styles.toggleActive,
              ]}
            />
            <Text style={styles.legendTitle}>City Flood Hazard Zones</Text>
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
            onPress={() => setShowDpwhLayer((v) => !v)}
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
            <View style={[styles.legendDot, { backgroundColor: "#3B82F6" }]} />
            <Text style={styles.legendLabel}>On-Going</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#6B7280" }]} />
            <Text style={styles.legendLabel}>Completed</Text>
          </View>
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
                    styles.legendButtonText,
                    legendVisible && styles.legendButtonTextActive,
                  ]}
                >
                  {legendVisible ? "Hide Legend" : "Legend"}
                </Text>
              </Pressable>

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
          }
        >
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

          {/* Gemini Nearest Center card */}
          <View style={styles.card}>
            <View style={styles.geminiHeader}>
              <Text style={styles.cardTitle}>Pinakamalapit na Sentro</Text>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            </View>

            {centersLoading || geminiLoading ? (
              <View style={styles.geminiLoadingRow}>
                <ActivityIndicator
                  size="small"
                  color={tokens.colors.ctaPrimary}
                />
                <Text style={styles.cardSub}>
                  {centersLoading
                    ? "Hinahanap ang mga sentro\u2026"
                    : "Pinipili ng AI ang pinakamainam na sentro\u2026"}
                </Text>
              </View>
            ) : geminiChoice ? (
              (() => {
                const chosenCenter = centers.find(
                  (c) => c.id === geminiChoice.centerId,
                );
                if (!chosenCenter) return null;
                return (
                  <View style={styles.geminiResult}>
                    <Text style={styles.centerName}>{chosenCenter.name}</Text>
                    <Text style={styles.centerMeta}>
                      {chosenCenter.distanceKm.toFixed(1)} km ·{" "}
                      {chosenCenter.status}
                    </Text>
                    <Text style={styles.geminiReason}>
                      {geminiChoice.reason}
                    </Text>
                    {geminiChoice.isFallback ? null : (
                      <View style={styles.aiSourceRow}>
                        <Text style={styles.aiSourceText}>
                          Pinili ng Gemini AI
                        </Text>
                      </View>
                    )}
                    <Link href={`/center/${chosenCenter.id}`} asChild>
                      <Pressable style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>
                          Tingnan ang Detalye at Ruta
                        </Text>
                      </Pressable>
                    </Link>
                  </View>
                );
              })()
            ) : (
              <Text style={styles.cardSub}>
                I-grant ang lokasyon para mahanap ang pinakamalapit na sentro.
              </Text>
            )}
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
                            router.push({
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
    flex: 1,
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

  alertPanel: { marginTop: 4 },
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
  },
  gpsButtonIcon: { fontSize: 18, color: tokens.colors.ctaPrimary },
  gpsButtonText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  legendButton: {
    backgroundColor: tokens.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
    justifyContent: "center",
  },
  legendButtonActive: { backgroundColor: tokens.colors.ctaPrimary },
  legendButtonText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  legendButtonTextActive: { color: "#FFFFFF" },

  legend: {
    position: "absolute",
    bottom: PANEL_COLLAPSED + tokens.spacing.md,
    left: tokens.spacing.sm,
    zIndex: 12,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
    borderCurve: "continuous",
    maxWidth: 220,
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
  geminiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  aiBadge: {
    backgroundColor: tokens.colors.ctaPrimary,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  geminiLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  geminiResult: {
    gap: tokens.spacing.xs,
  },
  geminiReason: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    fontStyle: "italic",
    lineHeight: 20,
  },
  aiSourceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  aiSourceText: {
    color: tokens.colors.ctaPrimary,
    fontSize: 11,
    fontWeight: "600",
  },
});

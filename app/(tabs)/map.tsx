import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tokens } from "@/src/design/tokens";
import { useCenters } from "@/src/features/centers/use-centers";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import type { ReportDepth } from "@/src/types/domain";

type NativeMapsModule = {
  default: any;
  Marker: any;
  PROVIDER_GOOGLE?: unknown;
};

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

export default function MapScreen() {
  const { isConnected } = useConnectivity();
  const { location } = useUserLocation();
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
  const [nativeMaps, setNativeMaps] = useState<NativeMapsModule | null>(null);
  const mapRef = useRef<unknown>(null);
  const [legendVisible, setLegendVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    try {
      // Avoid Metro static web resolution by using runtime require lookup.
      const runtimeRequire = (globalThis as any).require ?? eval("require");
      const maps = runtimeRequire("react-native-maps") as NativeMapsModule;
      setNativeMaps(maps);
    } catch {
      setNativeMaps(null);
    }
  }, []);

  const MapView = nativeMaps?.default;
  const Marker = nativeMaps?.Marker;
  const PROVIDER_GOOGLE = nativeMaps?.PROVIDER_GOOGLE;

  const initialRegion = {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.mapContainer}>
        {MapView && Marker ? (
          <MapView
            ref={mapRef as never}
            style={styles.map}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton
            mapType="standard"
          >
            {floodReports.map((r) => (
              <Marker
                key={r.id}
                coordinate={{ latitude: r.lat, longitude: r.lng }}
                pinColor={DEPTH_COLORS[r.depth]}
                opacity={r.status === "pending" ? 0.5 : 1}
                title={`Baha: ${r.depth}`}
                description={`${r.status === "confirmed" ? "Confirmed" : "Pending"} — ${r.reporterLabel}`}
              />
            ))}
            {drainReports.map((r) => (
              <Marker
                key={r.id}
                coordinate={{ latitude: r.lat, longitude: r.lng }}
                pinColor="#8B5CF6"
                opacity={r.status === "pending" ? 0.5 : 1}
                title="Baradong kanal"
                description={r.description}
              />
            ))}
            {centers.map((c) => (
              <Marker
                key={c.id}
                coordinate={{ latitude: c.lat, longitude: c.lng }}
                pinColor={tokens.colors.safe}
                title={c.name}
                description={`${c.status.toUpperCase()} — ${c.distanceKm} km`}
              />
            ))}
          </MapView>
        ) : (
          <View style={styles.webMapFallback}>
            <Text style={styles.webMapFallbackTitle}>Web map preview</Text>
            <Text style={styles.webMapFallbackBody}>
              Native interactive map is available on Android/iOS. Web mode keeps
              report actions and sync active.
            </Text>
          </View>
        )}

        <View style={styles.statusOverlay}>
          <Text style={styles.statusText}>
            {isConnected ? "Live" : "Offline (cached)"}
          </Text>
        </View>
        <Pressable
          style={styles.legendToggle}
          onPress={() => setLegendVisible(!legendVisible)}
        >
          <Text style={styles.legendToggleText}>Legend</Text>
        </Pressable>

        {legendVisible ? (
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Flood Depth</Text>
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
        ) : null}
      </View>

      <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
      >
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background },
  mapContainer: { flex: 1, minHeight: 300 },
  map: { ...StyleSheet.absoluteFillObject },
  webMapFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    justifyContent: "center",
    gap: tokens.spacing.sm,
  },
  webMapFallbackTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  webMapFallbackBody: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  statusOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
  },
  statusText: { color: tokens.colors.textPrimary, fontSize: tokens.type.label },
  legendToggle: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.sm,
  },
  legendToggleText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  legend: {
    position: "absolute",
    top: 40,
    right: 8,
    backgroundColor: "rgba(15,24,41,0.95)",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: tokens.colors.border,
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
  panel: { maxHeight: 280 },
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
});

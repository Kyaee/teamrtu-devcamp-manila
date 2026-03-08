import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tokens } from "@/src/design/tokens";
import { useAlerts } from "@/src/features/alerts/use-alerts";
import { useWeatherSignal } from "@/src/features/alerts/use-weather-signal";
import { useCenters } from "@/src/features/centers/use-centers";
import type { MapDisplayRef, MapMarker } from "@/src/features/map/MapDisplay";
import MapDisplay from "@/src/features/map/MapDisplay";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import type {
  FloodContext,
  NavStatus,
} from "@/src/features/navigation/use-navigation-session";
import { useNavigationSession } from "@/src/features/navigation/use-navigation-session";
import type { LatLng } from "@/src/services/maps";
import type { ReportDepth } from "@/src/types/domain";

const DEPTH_COLORS: Record<ReportDepth, string> = {
  ankle: tokens.colors.severity.MONITOR,
  knee: tokens.colors.severity.PREPARE,
  waist: tokens.colors.severity.LEAVE,
  chest: tokens.colors.severity.EVACUATE,
};

const STATUS_LABELS: Record<NavStatus, string> = {
  idle: "Ready",
  loading: "Getting route...",
  active: "Navigating",
  rerouting: "Rerouting...",
  arrived: "Arrived!",
  paused: "Paused",
  error: "Error",
};

export default function NavigateScreen() {
  const { centerId } = useLocalSearchParams<{ centerId: string }>();
  const { back } = useRouter();
  const { location } = useUserLocation();
  const { centers, loading: centersLoading } = useCenters(
    location?.latitude,
    location?.longitude,
  );
  const { floodReports } = useMapReports();
  const { highestSeverityAlert } = useAlerts(
    location?.latitude,
    location?.longitude,
  );
  const { signal } = useWeatherSignal(
    location?.latitude,
    location?.longitude,
    highestSeverityAlert?.severity,
  );
  const mapRef = useRef<MapDisplayRef>(null);

  const targetCenter = useMemo(() => {
    return centers.find((c) => c.id === centerId) ?? null;
  }, [centers, centerId]);

  const destination: LatLng | null = targetCenter
    ? { latitude: targetCenter.lat, longitude: targetCenter.lng }
    : null;

  const floodContext: FloodContext | undefined = useMemo(
    () => (floodReports.length > 0 ? { floodReports, signal } : undefined),
    [floodReports, signal],
  );

  const nav = useNavigationSession(
    destination,
    targetCenter?.name,
    floodContext,
  );

  // Auto-start navigation when destination is available
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (destination && !autoStarted && nav.status === "idle") {
      setAutoStarted(true);
      void nav.start();
    }
  }, [destination, autoStarted, nav.status, nav.start]);

  // Center map on user position when it updates
  useEffect(() => {
    if (nav.currentPosition && nav.status === "active") {
      mapRef.current?.animateToRegion(
        {
          latitude: nav.currentPosition.latitude,
          longitude: nav.currentPosition.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        400,
      );
    }
  }, [nav.currentPosition, nav.status]);

  const markers: MapMarker[] = useMemo(() => {
    const result: MapMarker[] = [];
    if (targetCenter) {
      result.push({
        id: "destination",
        latitude: targetCenter.lat,
        longitude: targetCenter.lng,
        pinColor: tokens.colors.safe,
        opacity: 1,
        title: targetCenter.name,
        description: `${targetCenter.status.toUpperCase()} — ${targetCenter.distanceKm} km`,
      });
    }
    if (nav.currentPosition) {
      result.push({
        id: "current-pos",
        latitude: nav.currentPosition.latitude,
        longitude: nav.currentPosition.longitude,
        pinColor: "#000000",
        opacity: 1,
        title: "Ikaw",
        description: "Current location",
      });
    }
    // Flood report markers — show hazard context during navigation
    for (const r of floodReports) {
      result.push({
        id: `flood-${r.id}`,
        latitude: r.lat,
        longitude: r.lng,
        pinColor: DEPTH_COLORS[r.depth],
        opacity: r.status === "confirmed" ? 1 : 0.6,
        title: `Flood: ${r.depth} depth`,
        description: `${r.status === "confirmed" ? "Confirmed" : "Pending"} — ${r.reporterLabel}`,
      });
    }
    return result;
  }, [targetCenter, nav.currentPosition, floodReports]);

  const routeOverlay = useMemo(() => {
    if (!nav.route) return null;
    // Red route if flooded, black if safe
    const color = nav.isFlooded ? "#DC2626" : "#000000";
    return { polyline: nav.route.polyline, color, width: 5 };
  }, [nav.route, nav.isFlooded]);

  const initialRegion = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }
    : {
        latitude: 14.6,
        longitude: 121.0,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };

  const currentStep = nav.route?.steps[nav.currentStepIndex];
  const totalSteps = nav.route?.steps.length ?? 0;

  if (!targetCenter) {
    if (centersLoading) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.errorWrap}>
            <ActivityIndicator size="large" color={tokens.colors.ctaPrimary} />
            <Text style={styles.errorTitle}>Loading evacuation centers...</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Center not found</Text>
          <Pressable style={styles.backButton} onPress={back}>
            <Text style={styles.backButtonText}>Back to Map</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Map area */}
      <View style={styles.mapArea}>
        <MapDisplay
          ref={mapRef}
          initialRegion={initialRegion}
          markers={markers}
          routeOverlay={routeOverlay}
        />
        {/* Status badge */}
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                nav.status === "error"
                  ? tokens.colors.danger
                  : nav.status === "arrived"
                    ? tokens.colors.safe
                    : tokens.colors.ctaPrimary,
            },
          ]}
        >
          <Text style={styles.statusBadgeText}>
            {STATUS_LABELS[nav.status]}
          </Text>
        </View>

        {nav.isOffRoute ? (
          <View style={styles.offRouteBanner}>
            <Text style={styles.offRouteText}>
              Lumihis sa ruta — nagre-reroute...
            </Text>
          </View>
        ) : null}

        {nav.isFlooded && !nav.isOffRoute ? (
          <View style={styles.floodedRouteBanner}>
            <Text style={styles.floodedRouteText}>
              ⚠ FLOODED — Ruta dumadaan sa baha. Mag-ingat!
            </Text>
          </View>
        ) : null}
      </View>

      {/* Navigation panel */}
      <View style={styles.navPanel}>
        {/* Current step instruction */}
        {nav.status === "loading" || nav.status === "rerouting" ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={tokens.colors.textPrimary} />
            <Text style={styles.loadingText}>
              {nav.status === "rerouting"
                ? "Finding new route..."
                : "Getting directions..."}
            </Text>
          </View>
        ) : null}

        {nav.status === "active" && currentStep ? (
          <>
            <View style={styles.instructionBox}>
              <Text style={styles.stepCounter}>
                Step {nav.currentStepIndex + 1} of {totalSteps}
              </Text>
              <Text style={styles.instruction}>{currentStep.instruction}</Text>
              <View style={styles.stepMeta}>
                <Text style={styles.metaText}>{currentStep.distance}</Text>
                <Text style={styles.metaText}>{currentStep.duration}</Text>
                {nav.etaText ? (
                  <Text style={styles.etaText}>ETA: {nav.etaText}</Text>
                ) : null}
              </View>
            </View>
            {nav.distanceToNextStep != null ? (
              <Text style={styles.distanceText}>
                {nav.distanceToNextStep < 1000
                  ? `${Math.round(nav.distanceToNextStep)}m to next turn`
                  : `${(nav.distanceToNextStep / 1000).toFixed(1)}km to next turn`}
              </Text>
            ) : null}
          </>
        ) : null}

        {nav.status === "arrived" ? (
          <View style={styles.arrivedBox}>
            <Text style={styles.arrivedTitle}>Nakarating ka na!</Text>
            <Text style={styles.arrivedBody}>
              {targetCenter.name} — {targetCenter.address}
            </Text>
            <Text style={styles.disclaimerText}>
              Verify capacity with on-site staff. Conditions may differ from
              reported status.
            </Text>
          </View>
        ) : null}

        {nav.errorMessage ? (
          <Text style={styles.errorText}>{nav.errorMessage}</Text>
        ) : null}

        {/* Disclaimer */}
        {nav.status === "active" ? (
          <Text style={styles.disclaimerText}>
            Best available route. Verify conditions locally.
          </Text>
        ) : null}

        {/* Controls */}
        <View style={styles.controls}>
          {nav.status === "active" ? (
            <>
              <Pressable style={styles.controlButton} onPress={nav.toggleMute}>
                <Text style={styles.controlButtonText}>
                  {nav.isMuted ? "Unmute" : "Mute"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.controlButton}
                onPress={nav.repeatCurrentStep}
              >
                <Text style={styles.controlButtonText}>Repeat</Text>
              </Pressable>
              <Pressable style={styles.controlButton} onPress={nav.pause}>
                <Text style={styles.controlButtonText}>Pause</Text>
              </Pressable>
              <Pressable
                style={[styles.controlButton, styles.dangerButton]}
                onPress={() => {
                  nav.stop();
                  back();
                }}
              >
                <Text style={styles.dangerButtonText}>Stop</Text>
              </Pressable>
            </>
          ) : null}

          {nav.status === "paused" ? (
            <>
              <Pressable
                style={styles.primaryButton}
                onPress={() => void nav.resume()}
              >
                <Text style={styles.primaryButtonText}>Resume</Text>
              </Pressable>
              <Pressable
                style={[styles.controlButton, styles.dangerButton]}
                onPress={() => {
                  nav.stop();
                  back();
                }}
              >
                <Text style={styles.dangerButtonText}>Stop Navigation</Text>
              </Pressable>
            </>
          ) : null}

          {nav.status === "arrived" || nav.status === "error" ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                nav.stop();
                back();
              }}
            >
              <Text style={styles.primaryButtonText}>Back to Map</Text>
            </Pressable>
          ) : null}

          {nav.status === "error" ? (
            <Pressable
              style={styles.controlButton}
              onPress={() => void nav.start()}
            >
              <Text style={styles.controlButtonText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background },
  mapArea: { flex: 1, minHeight: 300 },
  statusBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  offRouteBanner: {
    position: "absolute",
    top: 40,
    left: 8,
    right: 8,
    backgroundColor: "rgba(239,68,68,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
  },
  offRouteText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  floodedRouteBanner: {
    position: "absolute",
    top: 40,
    left: 8,
    right: 8,
    backgroundColor: "rgba(220,38,38,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
  },
  floodedRouteText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  navPanel: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  loadingText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  instructionBox: { gap: 4 },
  stepCounter: {
    color: tokens.colors.textDisabled,
    fontSize: tokens.type.label,
  },
  instruction: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  stepMeta: { flexDirection: "row", gap: tokens.spacing.md },
  metaText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
  etaText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  distanceText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  arrivedBox: { gap: tokens.spacing.xs },
  arrivedTitle: {
    color: tokens.colors.safe,
    fontSize: 20,
    fontWeight: "700",
  },
  arrivedBody: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
  },
  disclaimerText: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    fontStyle: "italic",
  },
  errorText: {
    color: tokens.colors.danger,
    fontSize: tokens.type.body,
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
  },
  controlButton: {
    flex: 1,
    minWidth: 70,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  dangerButton: {
    borderColor: tokens.colors.danger,
  },
  dangerButtonText: {
    color: tokens.colors.danger,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
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
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
  },
  errorTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  backButton: {
    minHeight: 48,
    paddingHorizontal: tokens.spacing.lg,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    color: tokens.colors.ctaText,
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
});

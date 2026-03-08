import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { useCenters } from "@/src/features/centers/use-centers";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { getCenterGuidance } from "@/src/services/ai";
import {
  getCachedRoute,
  getRouteGuidance,
  type RouteResult,
} from "@/src/services/maps";
import type { GeminiCenterGuidance } from "@/src/types/ai";
import type { EvacCenter } from "@/src/types/domain";

export default function CenterDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { location } = useUserLocation();
  const { centers, loading: centersLoading } = useCenters(
    location?.latitude,
    location?.longitude,
  );
  const { isConnected } = useConnectivity();

  const [center, setCenter] = useState<EvacCenter | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [aiGuidance, setAiGuidance] = useState<GeminiCenterGuidance | null>(
    null,
  );
  const [aiLoading, setAiLoading] = useState(false);

  // Find center from the live-discovered centers list
  useEffect(() => {
    if (!params.id || centersLoading) return;
    const found = centers.find((c) => c.id === params.id);
    if (found) setCenter(found);
  }, [params.id, centers, centersLoading]);

  // Load AI guidance when center resolves
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setAiLoading(true);
    void getCenterGuidance(center).then((guidance) => {
      if (!cancelled) {
        setAiGuidance(guidance);
        setAiLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [center?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRoute = async () => {
    if (!center) return;
    setRouteLoading(true);
    setRouteError(null);
    setIsCached(false);

    let resolvedRoute: RouteResult | null = null;

    if (isConnected) {
      try {
        resolvedRoute = await getRouteGuidance(
          location,
          { latitude: center.lat, longitude: center.lng },
          "Current location",
          center.name,
        );
        setRoute(resolvedRoute);
      } catch {
        const cached = await getCachedRoute();
        if (cached) {
          resolvedRoute = cached;
          setRoute(cached);
          setIsCached(true);
        } else {
          setRouteError("Could not get route. Please try again.");
        }
      }
    } else {
      const cached = await getCachedRoute();
      if (cached) {
        resolvedRoute = cached;
        setRoute(cached);
        setIsCached(true);
      } else {
        setRouteError("Offline — no cached route available.");
      }
    }

    setRouteLoading(false);

    if (resolvedRoute && center) {
      setAiLoading(true);
      const guidance = await getCenterGuidance(center, {
        distanceText: resolvedRoute.distanceText,
        durationText: resolvedRoute.durationText,
      });
      setAiGuidance(guidance);
      setAiLoading(false);
    }
  };

  if (centersLoading || !center) {
    return (
      <Screen>
        <Text style={styles.header}>Center detail</Text>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={tokens.colors.ctaPrimary} />
          <Text style={styles.body}>
            {centersLoading
              ? "Finding evacuation centers\u2026"
              : "Center not found. Go back and try again."}
          </Text>
          {!centersLoading && (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.back()}
            >
              <Text style={styles.secondaryButtonText}>Go Back</Text>
            </Pressable>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.header}>Center detail</Text>
      <View style={styles.card}>
        <Text style={styles.title}>{center.name}</Text>
        {center.address ? (
          <Text style={styles.body}>{center.address}</Text>
        ) : null}
        <Text style={styles.body}>
          {center.barangay} · {center.distanceKm.toFixed(1)} km away
        </Text>
        <Text style={styles.sub}>{center.uncertaintyNote}</Text>
        <Text style={styles.guardrail}>
          Capacity status is treated as uncertain and should be verified on
          arrival.
        </Text>
      </View>

      {/* AI Guidance Panel */}
      <View style={styles.aiCard}>
        <View style={styles.aiCardHeader}>
          <Text style={styles.aiCardTitle}>AI Guidance</Text>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>Gemini</Text>
          </View>
        </View>

        {aiLoading ? (
          <View style={styles.aiLoadingRow}>
            <ActivityIndicator size="small" color={tokens.colors.ctaPrimary} />
            <Text style={styles.aiLoadingText}>Loading AI guidance\u2026</Text>
          </View>
        ) : aiGuidance ? (
          <View style={styles.aiContent}>
            <Text style={styles.aiSummary}>{aiGuidance.summary}</Text>
            <View style={styles.aiSection}>
              <Text style={styles.aiSectionLabel}>Prepare:</Text>
              <Text style={styles.aiSectionText}>{aiGuidance.preparation}</Text>
            </View>
            {aiGuidance.routeCaution ? (
              <View style={[styles.aiSection, styles.aiCautionSection]}>
                <Text style={styles.aiSectionLabel}>Route Caution:</Text>
                <Text style={styles.aiSectionText}>
                  {aiGuidance.routeCaution}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => void fetchRoute()}
        disabled={routeLoading}
      >
        {routeLoading ? (
          <ActivityIndicator color={tokens.colors.ctaText} />
        ) : (
          <Text style={styles.primaryButtonText}>View Route (Walking)</Text>
        )}
      </Pressable>

      {routeError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{routeError}</Text>
        </View>
      )}

      {route && (
        <View style={styles.card}>
          {isCached && (
            <View style={styles.cachedBanner}>
              <Text style={styles.cachedText}>
                Last known route (cached{" "}
                {new Date(route.fetchedAt).toLocaleString()})
              </Text>
            </View>
          )}
          <Text style={styles.title}>
            Route: {route.fromLabel} {"\u2192"} {route.toLabel}
          </Text>
          <View style={styles.metricsRow}>
            <Text style={styles.metric}>{route.distanceText}</Text>
            <Text style={styles.metric}>{route.durationText}</Text>
          </View>
          <Text style={styles.disclaimerText}>
            Best available route guidance. Road conditions may change. Verify
            locally.
          </Text>

          <ScrollView style={styles.stepsContainer} nestedScrollEnabled>
            {route.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
                <View style={styles.stepContent}>
                  <Text style={styles.stepInstruction}>{step.instruction}</Text>
                  <Text style={styles.stepMeta}>
                    {step.distance} · {step.duration}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.title,
    fontWeight: "700",
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing.md,
    paddingVertical: tokens.spacing.lg,
  },
  title: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  sub: {
    color: tokens.colors.ctaPrimary,
    fontSize: 13,
  },
  guardrail: {
    color: tokens.colors.textDisabled,
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 52,
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
  secondaryButton: {
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.ctaPrimary,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  errorCard: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  errorText: {
    color: tokens.colors.danger,
    fontSize: tokens.type.body,
  },
  cachedBanner: {
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 4,
  },
  cachedText: {
    color: tokens.colors.severity.PREPARE,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    gap: tokens.spacing.lg,
  },
  metric: {
    color: tokens.colors.ctaPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  disclaimerText: {
    color: tokens.colors.textDisabled,
    fontSize: tokens.type.label,
    fontStyle: "italic",
  },
  aiCard: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.ctaPrimary,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  aiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  aiCardTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
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
  aiLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  aiLoadingText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  aiContent: {
    gap: tokens.spacing.sm,
  },
  aiSummary: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    lineHeight: 21,
  },
  aiSection: {
    gap: 2,
  },
  aiCautionSection: {
    backgroundColor: "rgba(245,158,11,0.10)",
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
  },
  aiSectionLabel: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "700",
  },
  aiSectionText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    lineHeight: 20,
  },
  stepsContainer: {
    maxHeight: 300,
  },
  stepRow: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  stepNumber: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
    fontWeight: "700",
    width: 24,
    textAlign: "center",
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepInstruction: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
  },
  stepMeta: {
    color: tokens.colors.textDisabled,
    fontSize: tokens.type.label,
  },
});

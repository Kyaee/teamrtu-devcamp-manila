import { useLocalSearchParams } from "expo-router";
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
import { evacCenters } from "@/src/features/centers/data";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import {
  getCachedRoute,
  getRouteGuidance,
  type RouteResult,
} from "@/src/services/maps";
import { supabase } from "@/src/services/supabase";
import type { EvacCenter } from "@/src/types/domain";

export default function CenterDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const [center, setCenter] = useState<EvacCenter>(
    () => evacCenters.find((item) => item.id === params.id) ?? evacCenters[0],
  );

  useEffect(() => {
    const load = async () => {
      const mock = evacCenters.find((item) => item.id === params.id);
      if (mock) {
        setCenter(mock);
        return;
      }

      if (supabase && params.id) {
        try {
          const { data, error } = await supabase
            .from("evac_centers")
            .select("*")
            .eq("id", params.id)
            .single();
          if (!error && data) {
            let lat = center.lat;
            let lng = center.lng;
            try {
              const geo =
                typeof data.location === "string"
                  ? JSON.parse(data.location)
                  : data.location;
              if (geo?.coordinates) {
                lng = geo.coordinates[0];
                lat = geo.coordinates[1];
              }
            } catch {
              /* use defaults */
            }
            setCenter({
              id: data.id,
              name: data.name,
              barangay: data.barangay,
              address: data.address,
              lat,
              lng,
              distanceKm: 0,
              status: data.status,
              uncertaintyNote: data.uncertainty_note,
            });
          }
        } catch {
          /* keep fallback */
        }
      }
    };
    void load();
  }, [params.id]);
  const { location } = useUserLocation();
  const { isConnected } = useConnectivity();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  const fetchRoute = async () => {
    setRouteLoading(true);
    setRouteError(null);
    setIsCached(false);

    if (isConnected) {
      try {
        const result = await getRouteGuidance(
          location,
          { latitude: center.lat, longitude: center.lng },
          "Kasalukuyang lokasyon",
          center.name,
        );
        setRoute(result);
      } catch {
        // Try cached route as fallback
        const cached = await getCachedRoute();
        if (cached) {
          setRoute(cached);
          setIsCached(true);
        } else {
          setRouteError("Hindi makuha ang ruta. Subukan muli.");
        }
      }
    } else {
      const cached = await getCachedRoute();
      if (cached) {
        setRoute(cached);
        setIsCached(true);
      } else {
        setRouteError("Offline — walang naka-cache na ruta.");
      }
    }
    setRouteLoading(false);
  };

  return (
    <Screen>
      <Text style={styles.header}>Center detail</Text>
      <View style={styles.card}>
        <Text style={styles.title}>{center.name}</Text>
        <Text style={styles.body}>
          {center.barangay} - {center.address}
        </Text>
        <Text style={styles.body}>
          Approx distance: {center.distanceKm.toFixed(1)} km
        </Text>
        <Text style={styles.sub}>{center.uncertaintyNote}</Text>
        <Text style={styles.guardrail}>
          Capacity status is treated as uncertain and should be verified on
          arrival.
        </Text>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={fetchRoute}
        disabled={routeLoading}
      >
        {routeLoading ? (
          <ActivityIndicator color={tokens.colors.ctaText} />
        ) : (
          <Text style={styles.primaryButtonText}>
            Tingnan ang Ruta (Walking)
          </Text>
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
            Route: {route.fromLabel} → {route.toLabel}
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

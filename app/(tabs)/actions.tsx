import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tokens } from "@/src/design/tokens";
import type { GlobalAction } from "@/src/features/decision-engine/types";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { useEvacuationCache } from "@/src/features/offline/use-evacuation-cache";

// ---------------------------------------------------------------------------
// Action-level display map
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<GlobalAction, string> = {
  STAY_MONITOR: "Stay and Monitor",
  PREPARE_GO_BAG: "Prepare Go-Bag",
  LEAVE_NOW: "Leave Now",
  EVACUATE_NOW: "Evacuate Immediately",
};

const ACTION_ICONS: Record<GlobalAction, keyof typeof Ionicons.glyphMap> = {
  STAY_MONITOR: "eye-outline",
  PREPARE_GO_BAG: "bag-handle-outline",
  LEAVE_NOW: "walk-outline",
  EVACUATE_NOW: "alert-circle",
};

const ACTION_COLORS: Record<GlobalAction, string> = {
  STAY_MONITOR: tokens.colors.severity.MONITOR,
  PREPARE_GO_BAG: tokens.colors.severity.PREPARE,
  LEAVE_NOW: tokens.colors.severity.LEAVE,
  EVACUATE_NOW: tokens.colors.severity.EVACUATE,
};

// ---------------------------------------------------------------------------
// Hotline data (moved from centers)
// ---------------------------------------------------------------------------

type Hotline = {
  label: string;
  number: string;
  category: string;
};

const HOTLINES: Hotline[] = [
  { label: "National Emergency", number: "911", category: "Emergency" },
  { label: "Philippine National Police", number: "117", category: "Emergency" },
  { label: "Philippine Red Cross", number: "143", category: "Emergency" },
  { label: "MMDA Traffic & Flood", number: "136", category: "Emergency" },
  { label: "NDRRMC", number: "028911406", category: "Disaster Response" },
  { label: "NDRRMC", number: "028912665", category: "Disaster Response" },
  { label: "NDRRMC", number: "028912568", category: "Disaster Response" },
  {
    label: "Bureau of Fire Protection",
    number: "028426219",
    category: "Fire / Rescue",
  },
  {
    label: "Philippine Red Cross HQ",
    number: "025270000",
    category: "Medical / Rescue",
  },
  { label: "PAGASA Weather", number: "028284800", category: "Weather" },
  { label: "PNP Direct Line", number: "028722650", category: "Police" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPhoneDisplay(num: string): string {
  if (num.length <= 3) return num;
  if (num.startsWith("02")) {
    const area = num.slice(0, 2);
    const rest = num.slice(2);
    if (rest.length >= 7)
      return `(${area}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${area}) ${rest}`;
  }
  return num;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActionsScreen() {
  const { isConnected } = useConnectivity();
  const { cached, loading, fromCache, refresh } = useEvacuationCache();

  const decision = cached?.decision ?? null;
  const route = cached?.primaryRoute ?? null;
  const globalAction = decision?.globalAction ?? null;
  const actionColor = globalAction
    ? ACTION_COLORS[globalAction]
    : tokens.colors.textDisabled;

  const handleCall = (number: string) => {
    const tel = number.replace(/[^0-9+]/g, "");
    Linking.openURL(`tel:${tel}`);
  };

  // Group hotlines by category
  const grouped = HOTLINES.reduce(
    (acc, h) => {
      if (!acc[h.category]) acc[h.category] = [];
      acc[h.category].push(h);
      return acc;
    },
    {} as Record<string, Hotline[]>,
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header ---- */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="shield-checkmark"
              size={24}
              color={tokens.colors.textPrimary}
            />
            <Text style={styles.title}>Emergency Actions</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isConnected ? styles.badgeOnline : styles.badgeOffline,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? "#22C55E" : "#EF4444" },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: isConnected ? "#15803D" : "#B91C1C" },
              ]}
            >
              {isConnected ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        {/* ---- Assessment Card ---- */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons
              name="alert-circle"
              size={20}
              color={tokens.colors.danger}
            />
            <Text style={styles.cardTitle}>Evacuation Assessment</Text>
            {fromCache && cached && (
              <View style={styles.cacheBadge}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={12}
                  color="#6B7280"
                />
                <Text style={styles.cacheText}>Cached</Text>
              </View>
            )}
          </View>

          {loading && !cached ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator
                size="small"
                color={tokens.colors.textSecondary}
              />
              <Text style={styles.loadingText}>
                Running evacuation assessment…
              </Text>
            </View>
          ) : decision ? (
            <>
              {/* Action Level Badge */}
              <View
                style={[styles.actionBadge, { backgroundColor: actionColor }]}
              >
                <Ionicons
                  name={
                    globalAction
                      ? ACTION_ICONS[globalAction]
                      : "help-circle-outline"
                  }
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.actionBadgeText}>
                  {globalAction ? ACTION_LABELS[globalAction] : "Unknown"}
                </Text>
              </View>

              {/* Explainability */}
              <View style={styles.explanationSection}>
                {decision.explainability.weatherReason ? (
                  <View style={styles.explanationRow}>
                    <Ionicons
                      name="rainy-outline"
                      size={16}
                      color={tokens.colors.textSecondary}
                    />
                    <Text style={styles.explanationText}>
                      {decision.explainability.weatherReason}
                    </Text>
                  </View>
                ) : null}
                {decision.explainability.reportReason ? (
                  <View style={styles.explanationRow}>
                    <Ionicons
                      name="water-outline"
                      size={16}
                      color={tokens.colors.textSecondary}
                    />
                    <Text style={styles.explanationText}>
                      {decision.explainability.reportReason}
                    </Text>
                  </View>
                ) : null}
                {decision.explainability.routeReason ? (
                  <View style={styles.explanationRow}>
                    <Ionicons
                      name="navigate-outline"
                      size={16}
                      color={tokens.colors.textSecondary}
                    />
                    <Text style={styles.explanationText}>
                      {decision.explainability.routeReason}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Disclaimer */}
              <View style={styles.disclaimerRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={tokens.colors.textDisabled}
                />
                <Text style={styles.disclaimerText}>
                  {decision.disclaimerText}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons
                name="cloud-offline-outline"
                size={32}
                color={tokens.colors.textDisabled}
              />
              <Text style={styles.emptyText}>
                No assessment available. Connect to the internet to generate.
              </Text>
            </View>
          )}
        </View>

        {/* ---- Evacuation Directions Card ---- */}
        {route && route.steps.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="walk"
                size={20}
                color={tokens.colors.ctaPrimary}
              />
              <Text style={styles.cardTitle}>Evacuation Route</Text>
            </View>

            {/* Destination header */}
            <View style={styles.destRow}>
              <Ionicons
                name="navigate-circle"
                size={18}
                color={tokens.colors.ctaPrimary}
              />
              <Text style={styles.destName}>
                {cached?.primaryCenterName ?? "Evacuation Center"}
              </Text>
              <Text style={styles.destMeta}>
                {cached?.primaryCenterDistance ?? ""}
              </Text>
            </View>

            <View style={styles.routeSummary}>
              <View style={styles.routeSummaryChip}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={tokens.colors.textSecondary}
                />
                <Text style={styles.routeSummaryText}>
                  {route.durationText}
                </Text>
              </View>
              <View style={styles.routeSummaryChip}>
                <Ionicons
                  name="resize-outline"
                  size={14}
                  color={tokens.colors.textSecondary}
                />
                <Text style={styles.routeSummaryText}>
                  {route.distanceText}
                </Text>
              </View>
            </View>

            {/* Step-by-step directions */}
            {route.steps.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepNumberCircle}>
                  <Text style={styles.stepNumber}>{idx + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepInstruction}>{step.instruction}</Text>
                  <Text style={styles.stepMeta}>
                    {step.distance} · {step.duration}
                  </Text>
                </View>
              </View>
            ))}

            {/* Timestamp */}
            {cached?.cachedAt && (
              <Text style={styles.timestampText}>
                Directions cached {timeAgo(cached.cachedAt)}
              </Text>
            )}
          </View>
        )}

        {/* Refresh button (when online) */}
        {isConnected && cached && (
          <Pressable style={styles.refreshBtn} onPress={refresh}>
            <Ionicons name="refresh" size={16} color={tokens.colors.ctaText} />
            <Text style={styles.refreshText}>Refresh assessment</Text>
          </Pressable>
        )}

        {/* ---- Hotlines Section ---- */}
        <View style={styles.sectionHeader}>
          <Ionicons name="call" size={20} color={tokens.colors.textPrimary} />
          <Text style={styles.sectionTitle}>Emergency Hotlines</Text>
        </View>

        {Object.entries(grouped).map(([category, hotlines]) => (
          <View key={category} style={styles.hotlineGroup}>
            <Text style={styles.categoryLabel}>{category}</Text>
            {hotlines.map((h, i) => (
              <View key={`${h.number}-${i}`} style={styles.hotlineRow}>
                <View style={styles.hotlineInfo}>
                  <Text style={styles.hotlineLabel}>{h.label}</Text>
                  <Text style={styles.hotlineNumber}>
                    {formatPhoneDisplay(h.number)}
                  </Text>
                </View>
                <Pressable
                  style={styles.callBtn}
                  onPress={() => handleCall(h.number)}
                  android_ripple={{ color: "#e5e7eb" }}
                >
                  <Ionicons name="call" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
        ))}

        {/* Bottom padding */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  scrollContent: {
    padding: tokens.spacing.md,
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.spacing.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.xs,
  },
  title: {
    fontSize: tokens.type.title,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  badgeOnline: {
    backgroundColor: "#DCFCE7",
  },
  badgeOffline: {
    backgroundColor: "#FEE2E2",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },

  /* Cards */
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
    flex: 1,
  },
  cacheBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
  },
  cacheText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },

  /* Action Badge */
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.sm,
  },
  actionBadgeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  /* Explainability */
  explanationSection: {
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  explanationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  explanationText: {
    fontSize: tokens.type.body,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    flex: 1,
  },

  /* Disclaimer */
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: tokens.spacing.xs,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    color: tokens.colors.textDisabled,
    flex: 1,
  },

  /* Destination */
  destRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: tokens.spacing.xs,
  },
  destName: {
    fontSize: 15,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
    flex: 1,
  },
  destMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: tokens.colors.textSecondary,
  },

  /* Route summary chips */
  routeSummary: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  routeSummaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: tokens.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  routeSummaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: tokens.colors.textSecondary,
  },

  /* Directions steps */
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.xs,
  },
  stepNumberCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: tokens.colors.ctaText,
  },
  stepContent: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textPrimary,
  },
  stepMeta: {
    fontSize: 12,
    color: tokens.colors.textDisabled,
    marginTop: 2,
  },

  /* Timestamp */
  timestampText: {
    fontSize: 11,
    color: tokens.colors.textDisabled,
    marginTop: tokens.spacing.xs,
    textAlign: "right",
    fontStyle: "italic",
  },

  /* Refresh button */
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: tokens.colors.ctaPrimary,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    marginBottom: tokens.spacing.lg,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: "600",
    color: tokens.colors.ctaText,
  },

  /* Loading / Empty */
  loadingBox: {
    alignItems: "center",
    gap: tokens.spacing.xs,
    paddingVertical: tokens.spacing.xl,
  },
  loadingText: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  emptyBox: {
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xl,
  },
  emptyText: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  /* Hotlines Section */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
  },
  hotlineGroup: {
    marginBottom: tokens.spacing.md,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: tokens.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  hotlineRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  hotlineInfo: {
    flex: 1,
    gap: 2,
  },
  hotlineLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: tokens.colors.textPrimary,
  },
  hotlineNumber: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
});

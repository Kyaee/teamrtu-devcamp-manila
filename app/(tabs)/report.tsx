import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tokens } from "@/src/design/tokens";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import type { ReportDepth } from "@/src/types/domain";

type ReportTab = "flood" | "drain";

const DEPTH_OPTIONS: {
  id: ReportDepth;
  label: string;
  tagalog: string;
  icon: string;
  color: string;
}[] = [
  {
    id: "ankle",
    label: "Ankle",
    tagalog: "Bukung-bukong",
    icon: "💧",
    color: tokens.colors.severity.MONITOR,
  },
  {
    id: "knee",
    label: "Knee",
    tagalog: "Tuhod",
    icon: "🌊",
    color: tokens.colors.severity.PREPARE,
  },
  {
    id: "waist",
    label: "Waist",
    tagalog: "Baywang",
    icon: "🌊",
    color: tokens.colors.severity.LEAVE,
  },
  {
    id: "chest",
    label: "Above Waist",
    tagalog: "Dibdib pataas",
    icon: "🚨",
    color: tokens.colors.severity.EVACUATE,
  },
];

function formatTimeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

export default function ReportScreen() {
  const [tab, setTab] = useState<ReportTab>("flood");
  const [drainText, setDrainText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { isConnected } = useConnectivity();
  const { location } = useUserLocation();
  const {
    floodReports,
    drainReports,
    addFloodReport,
    addDrainReport,
    queueCount,
    syncQueuedReports,
    confirmationHint,
  } = useMapReports();

  const recentFloods = useMemo(() => floodReports.slice(0, 5), [floodReports]);
  const recentDrains = useMemo(() => drainReports.slice(0, 5), [drainReports]);

  const handleFloodSubmit = useCallback(
    async (depth: ReportDepth) => {
      setSubmitting(true);
      setLastResult(null);
      try {
        await addFloodReport(
          depth,
          isConnected,
          location.latitude,
          location.longitude,
        );
        const label = DEPTH_OPTIONS.find((d) => d.id === depth)?.label ?? depth;
        setLastResult(
          isConnected
            ? `Flood report (${label}) submitted`
            : `Flood report (${label}) queued for sync`,
        );
      } catch {
        setLastResult("Failed to submit report");
      }
      setSubmitting(false);
    },
    [addFloodReport, isConnected, location],
  );

  const handleDrainSubmit = useCallback(async () => {
    if (!drainText.trim()) return;
    setSubmitting(true);
    setLastResult(null);
    try {
      await addDrainReport(
        drainText.trim(),
        isConnected,
        location.latitude,
        location.longitude,
      );
      setLastResult(
        isConnected ? "Drain report submitted" : "Drain report queued for sync",
      );
      setDrainText("");
    } catch {
      setLastResult("Failed to submit report");
    }
    setSubmitting(false);
  }, [addDrainReport, drainText, isConnected, location]);

  const handleSync = useCallback(async () => {
    setSubmitting(true);
    await syncQueuedReports();
    setSubmitting(false);
  }, [syncQueuedReports]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Report</Text>
          <View
            style={[
              styles.connBadge,
              isConnected ? styles.connOnline : styles.connOffline,
            ]}
          >
            <View
              style={[
                styles.connDot,
                {
                  backgroundColor: isConnected
                    ? tokens.colors.safe
                    : tokens.colors.textDisabled,
                },
              ]}
            />
            <Text
              style={[
                styles.connText,
                {
                  color: isConnected
                    ? tokens.colors.safe
                    : tokens.colors.textDisabled,
                },
              ]}
            >
              {isConnected ? "Online" : "Offline"}
            </Text>
          </View>
        </View>

        <Text style={styles.headerSub}>
          Mag-report ng baha o baradong kanal sa iyong lokasyon.
        </Text>

        {/* Tab selector */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, tab === "flood" && styles.tabActive]}
            onPress={() => setTab("flood")}
          >
            <Text
              style={[styles.tabText, tab === "flood" && styles.tabTextActive]}
            >
              Baha
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, tab === "drain" && styles.tabActive]}
            onPress={() => setTab("drain")}
          >
            <Text
              style={[styles.tabText, tab === "drain" && styles.tabTextActive]}
            >
              Baradong Kanal
            </Text>
          </Pressable>
        </View>

        {/* Flood tab */}
        {tab === "flood" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gaano kalalim ang baha?</Text>
            <Text style={styles.sectionHint}>
              Pindutin ang level na katumbas ng baha sa iyong lokasyon.
            </Text>

            <View style={styles.depthGrid}>
              {DEPTH_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.id}
                  style={({ pressed }) => [
                    styles.depthCard,
                    { borderColor: opt.color },
                    pressed && { opacity: 0.7 },
                    submitting && { opacity: 0.5 },
                  ]}
                  onPress={() => handleFloodSubmit(opt.id)}
                  disabled={submitting}
                >
                  <Text style={styles.depthIcon}>{opt.icon}</Text>
                  <Text style={styles.depthLabel}>{opt.label}</Text>
                  <Text style={styles.depthTagalog}>{opt.tagalog}</Text>
                  <View
                    style={[styles.depthBar, { backgroundColor: opt.color }]}
                  />
                </Pressable>
              ))}
            </View>

            <Text style={styles.hint}>{confirmationHint}</Text>

            {/* Recent flood reports */}
            {recentFloods.length > 0 ? (
              <View style={styles.recentSection}>
                <Text style={styles.recentTitle}>
                  Kamakailan ({floodReports.length} total)
                </Text>
                {recentFloods.map((r) => {
                  const opt = DEPTH_OPTIONS.find((d) => d.id === r.depth);
                  return (
                    <View key={r.id} style={styles.recentRow}>
                      <View
                        style={[
                          styles.recentDot,
                          {
                            backgroundColor:
                              opt?.color ?? tokens.colors.textDisabled,
                          },
                        ]}
                      />
                      <View style={styles.recentContent}>
                        <Text style={styles.recentLabel}>
                          {opt?.label ?? r.depth} depth
                        </Text>
                        <Text style={styles.recentMeta}>
                          {r.status === "confirmed" ? "Confirmed" : "Pending"}
                          {" · "}
                          {formatTimeAgo(r.createdAt)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          /* Drain tab */
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>I-report ang baradong kanal</Text>
            <Text style={styles.sectionHint}>
              Kahit walang bagyo, pwede kang mag-report ng baradong kanal o
              basura na pwedeng magdulot ng pagbaha.
            </Text>

            <TextInput
              value={drainText}
              onChangeText={setDrainText}
              multiline
              style={styles.textInput}
              placeholder="Halimbawa: May baradong kanal sa kanto ng Rizal St. puno ng basura."
              placeholderTextColor={tokens.colors.textDisabled}
              editable={!submitting}
            />

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                (!drainText.trim() || submitting) && styles.submitDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleDrainSubmit}
              disabled={!drainText.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.colors.ctaText} size="small" />
              ) : (
                <Text style={styles.submitText}>I-submit ang report</Text>
              )}
            </Pressable>

            {/* Recent drain reports */}
            {recentDrains.length > 0 ? (
              <View style={styles.recentSection}>
                <Text style={styles.recentTitle}>
                  Kamakailan ({drainReports.length} total)
                </Text>
                {recentDrains.map((d) => (
                  <View key={d.id} style={styles.recentRow}>
                    <View
                      style={[styles.recentDot, { backgroundColor: "#6B7280" }]}
                    />
                    <View style={styles.recentContent}>
                      <Text style={styles.recentLabel} numberOfLines={1}>
                        {d.description}
                      </Text>
                      <Text style={styles.recentMeta}>
                        {d.status === "confirmed" ? "Confirmed" : "Pending"}
                        {" · "}
                        {formatTimeAgo(d.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {/* Result feedback */}
        {lastResult ? (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackText}>{lastResult}</Text>
          </View>
        ) : null}

        {/* Offline queue */}
        {queueCount > 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.queueCard,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleSync}
            disabled={submitting || !isConnected}
          >
            <View style={styles.queueInfo}>
              <Text style={styles.queueCount}>{queueCount}</Text>
              <View>
                <Text style={styles.queueLabel}>
                  Pending offline report{queueCount > 1 ? "s" : ""}
                </Text>
                <Text style={styles.queueHint}>
                  {isConnected ? "Tap para i-sync" : "Mag-sync kapag online na"}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* GPS notice */}
        <View style={styles.gpsNotice}>
          <Text style={styles.gpsText}>
            GPS: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </Text>
          <Text style={styles.gpsHint}>
            Ang iyong kasalukuyang lokasyon ang gagamitin sa report.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  scroll: {
    padding: tokens.spacing.md,
    paddingBottom: 40,
    gap: tokens.spacing.md,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerSub: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    lineHeight: 21,
    marginTop: -4,
  },

  connBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  connOnline: {
    borderColor: tokens.colors.safe,
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  connOffline: {
    borderColor: tokens.colors.textDisabled,
    backgroundColor: "rgba(163,163,163,0.08)",
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connText: {
    fontSize: 12,
    fontWeight: "700",
  },

  tabRow: {
    flexDirection: "row",
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: tokens.radius.sm,
  },
  tabActive: {
    backgroundColor: tokens.colors.ctaPrimary,
  },
  tabText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  tabTextActive: {
    color: tokens.colors.ctaText,
  },

  section: {
    gap: tokens.spacing.sm,
  },
  sectionTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  sectionHint: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
    lineHeight: 18,
  },

  depthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
    marginTop: 4,
  },
  depthCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 2,
    padding: tokens.spacing.md,
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
  },
  depthIcon: {
    fontSize: 28,
  },
  depthLabel: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  depthTagalog: {
    color: tokens.colors.textSecondary,
    fontSize: 12,
  },
  depthBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },

  hint: {
    color: tokens.colors.textDisabled,
    fontSize: 12,
    fontStyle: "italic",
  },

  textInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    padding: tokens.spacing.sm,
    textAlignVertical: "top",
    backgroundColor: tokens.colors.surface,
  },

  submitButton: {
    height: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: tokens.colors.ctaText,
    fontSize: tokens.type.body,
    fontWeight: "700",
  },

  feedbackCard: {
    backgroundColor: "rgba(34,197,94,0.1)",
    borderLeftWidth: 4,
    borderLeftColor: tokens.colors.safe,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
  },
  feedbackText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },

  queueCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(234,179,8,0.08)",
    borderWidth: 1,
    borderColor: tokens.colors.severity.PREPARE,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
  },
  queueInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  queueCount: {
    color: tokens.colors.severity.PREPARE,
    fontSize: 24,
    fontWeight: "800",
    minWidth: 36,
    textAlign: "center",
  },
  queueLabel: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  queueHint: {
    color: tokens.colors.textSecondary,
    fontSize: 12,
  },

  recentSection: {
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  recentTitle: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recentContent: {
    flex: 1,
    gap: 1,
  },
  recentLabel: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  recentMeta: {
    color: tokens.colors.textDisabled,
    fontSize: 12,
  },

  gpsNotice: {
    alignItems: "center",
    gap: 2,
    paddingTop: tokens.spacing.xs,
  },
  gpsText: {
    color: tokens.colors.textDisabled,
    fontSize: 12,
    fontFamily: "monospace",
  },
  gpsHint: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
  },
});

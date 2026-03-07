import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/src/design/tokens";
import type { Alert } from "@/src/types/domain";

type Props = {
  alert: Alert;
  onPressPrimary: () => void;
};

export function AlertCard({ alert, onPressPrimary }: Props) {
  const [expanded, setExpanded] = useState(false);
  const severityColor = tokens.colors.severity[alert.severity];

  return (
    <View style={[styles.container, { borderLeftColor: severityColor }]}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <View style={styles.headerContent}>
          <View style={[styles.badge, { backgroundColor: severityColor }]}>
            <Text style={styles.badgeText}>{alert.severity}</Text>
          </View>
          <Text style={styles.locationText} numberOfLines={1}>
            {alert.headline}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? "\u25B2" : "\u25BC"}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.expandedContent}>
          <Text style={styles.locationSub}>
            {alert.barangay}, {alert.city}
          </Text>
          <Text style={styles.instruction}>{alert.instruction}</Text>
          <Text style={styles.rationale}>{alert.rationale}</Text>
          <Pressable style={styles.primaryButton} onPress={onPressPrimary}>
            <Text style={styles.primaryButtonText}>
              {alert.primaryCtaLabel}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderLeftWidth: 4,
    borderRadius: tokens.radius.lg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  headerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  chevron: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    fontWeight: "800",
  },
  expandedContent: {
    padding: tokens.spacing.md,
    paddingTop: 0,
    gap: tokens.spacing.sm,
  },
  badge: {
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  locationText: {
    flex: 1,
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  locationSub: {
    color: tokens.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  instruction: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    lineHeight: 22,
  },
  rationale: {
    color: tokens.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: tokens.spacing.xs,
  },
  primaryButtonText: {
    color: tokens.colors.ctaText,
    fontSize: 16,
    fontWeight: "700",
  },
});

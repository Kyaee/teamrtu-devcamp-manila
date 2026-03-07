import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/src/design/tokens";
import type { Alert } from "@/src/types/domain";

type Props = {
  alert: Alert;
  onPressPrimary: () => void;
};

export function AlertCard({ alert, onPressPrimary }: Props) {
  const severityColor = tokens.colors.severity[alert.severity];

  return (
    <View style={[styles.container, { borderLeftColor: severityColor }]}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: severityColor }]}>
          <Text style={styles.badgeText}>{alert.severity}</Text>
        </View>
        <Text style={styles.locationText}>
          {alert.barangay}, {alert.city}
        </Text>
      </View>
      <Text style={styles.command}>{alert.headline}</Text>
      <Text style={styles.instruction}>{alert.instruction}</Text>
      <Text style={styles.rationale}>{alert.rationale}</Text>
      <Pressable style={styles.primaryButton} onPress={onPressPrimary}>
        <Text style={styles.primaryButtonText}>{alert.primaryCtaLabel}</Text>
      </Pressable>
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
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  badge: {
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  locationText: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  command: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.command,
    fontWeight: "700",
    lineHeight: 38,
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
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 0,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: tokens.colors.ctaText,
    fontSize: 16,
    fontWeight: "700",
  },
});

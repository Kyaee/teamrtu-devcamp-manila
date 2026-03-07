import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { canClaimReliefForEvent } from "@/src/features/relief/contracts";

export default function ReliefStubScreen() {
  const claimAllowed = canClaimReliefForEvent(
    [
      {
        id: "claim-1",
        familyId: "family-1",
        eventId: "flood-event-2026-03",
        claimType: "food",
        createdAt: new Date().toISOString(),
      },
    ],
    "family-1",
    "flood-event-2026-03",
  );

  return (
    <Screen>
      <Text style={styles.header}>Relief Module (MVP-gated)</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Flow contract preserved</Text>
        <Text style={styles.body}>
          OTP → address + barangay → family link/create → one-claim-per-family
          check.
        </Text>
        <Text style={styles.body}>
          Demo eligibility result:{" "}
          {claimAllowed ? "Allowed" : "Blocked (already claimed)"}
        </Text>
        <Text style={styles.guardrail}>
          This module is intentionally hidden from MVP production journeys.
        </Text>
      </View>
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
    fontSize: 16,
    fontWeight: "600",
  },
  body: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  guardrail: {
    color: tokens.colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
});

import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";

export default function DonationStubScreen() {
  return (
    <Screen>
      <Text style={styles.header}>Donation Module (MVP-gated)</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Contract status</Text>
        <Text style={styles.body}>
          OTP verification + household identity + donation or claim branching is
          schema-ready.
        </Text>
        <Text style={styles.body}>
          Full payment and fulfillment experiences remain disabled for MVP scope
          protection.
        </Text>
        <Text style={styles.guardrail}>
          Do not surface this module in default emergency navigation.
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

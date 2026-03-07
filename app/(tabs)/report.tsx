import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { useMapReports } from "@/src/features/map/use-map-reports";

export default function ReportScreen() {
  const [drainText, setDrainText] = useState("May baradong kanal sa kanto.");
  const { isConnected } = useConnectivity();
  const { addFloodReport, addDrainReport, queueCount, syncMessage } =
    useMapReports();

  return (
    <Screen>
      <Text style={styles.header}>Report center</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Status</Text>
        <Text style={styles.body}>
          {isConnected
            ? "Online: reports submit immediately."
            : "Offline: reports are queued for reconnect sync."}
        </Text>
        <Text style={styles.sub}>Queue: {queueCount} pending</Text>
        <Text style={styles.sub}>{syncMessage}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Flood depth</Text>
        <View style={styles.row}>
          <Pressable
            style={styles.depthButton}
            onPress={() => addFloodReport("ankle", isConnected)}
          >
            <Text style={styles.depthLabel}>Ankle</Text>
          </Pressable>
          <Pressable
            style={styles.depthButton}
            onPress={() => addFloodReport("knee", isConnected)}
          >
            <Text style={styles.depthLabel}>Knee</Text>
          </Pressable>
          <Pressable
            style={styles.depthButton}
            onPress={() => addFloodReport("waist", isConnected)}
          >
            <Text style={styles.depthLabel}>Waist</Text>
          </Pressable>
          <Pressable
            style={styles.depthButton}
            onPress={() => addFloodReport("chest", isConnected)}
          >
            <Text style={styles.depthLabel}>Above waist</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Clogged drain / trash</Text>
        <TextInput
          value={drainText}
          onChangeText={setDrainText}
          multiline
          style={styles.input}
          placeholder="Ilarawan ang sitwasyon"
          placeholderTextColor={tokens.colors.textDisabled}
        />
        <Pressable
          style={styles.submit}
          onPress={() => addDrainReport(drainText, isConnected)}
        >
          <Text style={styles.submitText}>I-submit ang report</Text>
        </Pressable>
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
  sub: {
    color: tokens.colors.textDisabled,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
  },
  depthButton: {
    minWidth: "47%",
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  depthLabel: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: tokens.colors.borderLight,
    borderRadius: tokens.radius.md,
    color: tokens.colors.textPrimary,
    padding: tokens.spacing.sm,
    textAlignVertical: "top",
  },
  submit: {
    minHeight: 56,
    borderRadius: 0,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    color: tokens.colors.ctaText,
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
});

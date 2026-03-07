import { Link, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { AlertCard } from "@/src/features/alerts/alert-card";
import { useAlerts } from "@/src/features/alerts/use-alerts";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { usePreparedness } from "@/src/features/preparedness/use-preparedness";
import { useAppSlice } from "@/src/store/app-slice";
import { dispatchSmsFallback } from "@/src/services/sms";

export default function HomeScreen() {
  const router = useRouter();
  const { highestSeverityAlert, usingPollingFallback } = useAlerts();
  const { isConnected, lastUpdatedAt } = useConnectivity();
  const { tasks, toggleTask, completion } = usePreparedness();
  const { floodBuddyPhone } = useAppSlice();

  const sendSmsFallback = async () => {
    if (!highestSeverityAlert) return;
    await dispatchSmsFallback({
      to: floodBuddyPhone,
      message: `[AGOS] ${highestSeverityAlert.headline}. ${highestSeverityAlert.instruction}`,
    });
  };

  return (
    <Screen>
      <Text style={styles.header}>AGOS Alert Dashboard</Text>
      <View style={styles.infoStrip}>
        <Text style={styles.infoText}>
          {isConnected ? "Online mode" : "Offline mode activated"}
        </Text>
        <Text style={styles.infoSubtext}>
          {usingPollingFallback
            ? "Realtime degraded: polling fallback active"
            : "Realtime active"}
        </Text>
        <Text style={styles.infoSubtext}>
          Last checked: {new Date(lastUpdatedAt).toLocaleTimeString()}
        </Text>
      </View>

      {highestSeverityAlert ? (
        <AlertCard
          alert={highestSeverityAlert}
          onPressPrimary={() =>
            router.push(highestSeverityAlert.primaryCtaPath as never)
          }
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Walang active alert ngayon</Text>
          <Text style={styles.cardSub}>
            Pwede kayong mag-browse ng flood map at maghanda.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Preparedness checklist ({completion})
        </Text>
        {tasks.map((task) => (
          <Pressable
            key={task.id}
            style={styles.checkRow}
            onPress={() => toggleTask(task.id)}
          >
            <Text style={styles.checkMark}>{task.done ? "✓" : "○"}</Text>
            <Text style={styles.cardSub}>{task.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Flood Buddy + SMS continuity</Text>
        <Text style={styles.cardSub}>
          Flood Buddy number: {floodBuddyPhone}
        </Text>
        <Pressable style={styles.secondaryButton} onPress={sendSmsFallback}>
          <Text style={styles.secondaryButtonText}>
            Magpadala ng SMS fallback
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Phase-2 modules (gated)</Text>
        <Link href="/relief">
          <Text style={styles.link}>Relief module stub</Text>
        </Link>
        <Link href="/donation">
          <Text style={styles.link}>Donation module stub</Text>
        </Link>
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
  infoStrip: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderLight,
    padding: tokens.spacing.md,
    gap: 6,
  },
  infoText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  infoSubtext: {
    color: tokens.colors.textSecondary,
    fontSize: 13,
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  cardTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  cardSub: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    lineHeight: 21,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkMark: {
    color: tokens.colors.ctaPrimary,
    fontSize: 16,
    width: 18,
    marginTop: 2,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  link: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
  },
});

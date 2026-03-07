import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { useAppSlice } from "@/src/store/app-slice";

export default function SettingsScreen() {
  const {
    preferredLanguage,
    setPreferredLanguage,
    floodBuddyPhone,
    setFloodBuddyPhone,
  } = useAppSlice();

  return (
    <Screen>
      <Text style={styles.header}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Language (MVP scope)</Text>
        <Text style={styles.body}>
          Only Tagalog and one regional language are enabled in MVP.
        </Text>
        <View style={styles.row}>
          <Pressable
            style={[
              styles.choice,
              preferredLanguage === "fil-PH" ? styles.choiceActive : null,
            ]}
            onPress={() => setPreferredLanguage("fil-PH")}
          >
            <Text style={styles.choiceText}>Tagalog</Text>
          </Pressable>
          <Pressable
            style={[
              styles.choice,
              preferredLanguage === "ceb-PH" ? styles.choiceActive : null,
            ]}
            onPress={() => setPreferredLanguage("ceb-PH")}
          >
            <Text style={styles.choiceText}>Cebuano</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Flood Buddy relay</Text>
        <Text style={styles.body}>Configured contact: {floodBuddyPhone}</Text>
        <Pressable
          style={styles.choice}
          onPress={() => setFloodBuddyPhone("09179998888")}
        >
          <Text style={styles.choiceText}>Use sample backup number</Text>
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
  row: {
    flexDirection: "row",
    gap: tokens.spacing.sm,
  },
  choice: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceActive: {
    borderColor: tokens.colors.ctaPrimary,
    backgroundColor: tokens.colors.surfaceAlt,
  },
  choiceText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
});

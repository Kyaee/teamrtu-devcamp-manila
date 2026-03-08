import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { useCenters } from "@/src/features/centers/use-centers";
import { useUserLocation } from "@/src/features/map/use-user-location";

export default function CentersScreen() {
  const { location } = useUserLocation();
  const { centers, openOnly, setOpenOnly } = useCenters(
    location?.latitude,
    location?.longitude,
  );

  return (
    <Screen>
      <Text style={styles.header}>Evacuation centers</Text>

      <View style={styles.filterRow}>
        <Text style={styles.body}>Open only filter</Text>
        <Pressable style={styles.toggle} onPress={() => setOpenOnly(!openOnly)}>
          <Text style={styles.toggleText}>{openOnly ? "ON" : "OFF"}</Text>
        </Pressable>
      </View>

      {centers.map((center) => (
        <View key={center.id} style={styles.card}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    center.status === "open"
                      ? tokens.colors.safe
                      : tokens.colors.danger,
                },
              ]}
            >
              <Text style={styles.statusText}>
                {center.status === "open" ? "OPEN" : "LIMITED"}
              </Text>
            </View>
            <Text style={styles.distance}>
              {center.distanceKm.toFixed(1)} km away
            </Text>
          </View>
          <Text style={styles.title}>{center.name}</Text>
          <Text style={styles.body}>
            {center.barangay} - {center.address}
          </Text>
          <Text style={styles.sub}>{center.uncertaintyNote}</Text>
          <Link href={`/center/${center.id}`}>
            <Text style={styles.link}>Get directions and details</Text>
          </Link>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.title,
    fontWeight: "700",
  },
  filterRow: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggle: {
    minWidth: 64,
    minHeight: 36,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: {
    color: tokens.colors.textPrimary,
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  distance: {
    color: tokens.colors.ctaPrimary,
    fontSize: 13,
    fontWeight: "600",
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
  link: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
  },
});

import { Link } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { useCenters } from "@/src/features/centers/use-centers";

const HOTLINE_SECTIONS: {
  heading: string;
  lines: { label: string; number: string }[];
}[] = [
  {
    heading: "National Emergency",
    lines: [
      { label: "National Emergency Hotline", number: "911" },
      { label: "Philippine National Police (PNP)", number: "117" },
      { label: "Philippine Red Cross", number: "143" },
      { label: "MMDA Traffic Emergency", number: "136" },
    ],
  },
  {
    heading: "Police and Safety",
    lines: [
      { label: "PNP Direct Line", number: "(02) 8722-0650" },
      { label: "PNP Text Hotline", number: "0917-847-5757" },
    ],
  },
  {
    heading: "Fire",
    lines: [
      { label: "Bureau of Fire Protection", number: "(02) 8426-0219" },
      { label: "Bureau of Fire Protection", number: "(02) 8426-0246" },
    ],
  },
  {
    heading: "Disaster Response",
    lines: [
      { label: "NDRRMC", number: "(02) 8911-1406" },
      { label: "NDRRMC", number: "(02) 8912-2665" },
      { label: "NDRRMC", number: "(02) 8912-5668" },
      { label: "NDRRMC", number: "(02) 8911-1873" },
    ],
  },
  {
    heading: "Medical / Rescue",
    lines: [
      { label: "Philippine Red Cross", number: "143" },
      { label: "Philippine Red Cross", number: "(02) 8527-0000" },
    ],
  },
  {
    heading: "Weather",
    lines: [{ label: "PAGASA", number: "(02) 8284-0800" }],
  },
];

export default function CentersScreen() {
  const { centers, openOnly, setOpenOnly } = useCenters();

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

      <View style={styles.card}>
        <Text style={styles.title}>Important hotlines</Text>
        {HOTLINE_SECTIONS.map((section) => (
          <View key={section.heading} style={styles.hotlineSection}>
            <Text style={styles.hotlineHeading}>{section.heading}</Text>
            {section.lines.map((line, i) => (
              <Pressable
                key={`${section.heading}-${i}`}
                style={styles.hotlineRow}
                onPress={() => {
                  const tel = line.number.replace(/[^0-9+]/g, "");
                  void Linking.openURL(`tel:${tel}`);
                }}
              >
                <Text style={styles.body}>{line.label}</Text>
                <Text style={styles.hotlineNumber}>{line.number}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Important MVP guardrail</Text>
        <Text style={styles.body}>
          Center capacity is not shown as a definitive live metric.
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
  hotlineSection: {
    gap: 4,
  },
  hotlineHeading: {
    color: tokens.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  hotlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  hotlineNumber: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
});

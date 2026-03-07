import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/src/design/tokens";
import { HomeFloatingPanel } from "@/src/features/home/HomeFloatingPanel";

import type { DpwhProject } from "./use-dpwh-projects";

type Props = {
  project: DpwhProject;
  onClose: () => void;
};

const COC_COLORS: Record<string, string> = {
  Approved: "#22C55E",
  Disapproved: "#EF4444",
  "No Objection Letter": "#EAB308",
  None: "#A3A3A3",
};

function StatusBadge({ status }: { status: string }) {
  const bg = status === "On-Going" ? "#3B82F6" : "#6B7280";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function DPWHProjectPanel({ project, onClose }: Props) {
  const cocColor = COC_COLORS[project.cocStatus] ?? "#A3A3A3";

  return (
    <HomeFloatingPanel
      expandedHeight={520}
      collapsedHeight={160}
      containerStyle={styles.panelContainer}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <StatusBadge status={project.status} />
          <Text style={styles.contractId}>{project.contractId}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <Text style={styles.projectName}>{project.name}</Text>

      <View style={styles.locationRow}>
        <Text style={styles.locationText}>
          {project.barangay}, {project.city}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.costRow}>
        <Text style={styles.costLabel}>Cost</Text>
        <Text style={styles.costValue}>₱{project.costPhp}</Text>
      </View>

      <Row label="Fund Source" value={project.fundSource} />
      {project.completionDate ? (
        <Row label="Completion" value={project.completionDate} />
      ) : null}

      <View style={styles.divider} />

      <View style={styles.cocRow}>
        <Text style={styles.rowLabel}>COC Status</Text>
        <View style={[styles.cocBadge, { backgroundColor: cocColor }]}>
          <Text style={styles.cocBadgeText}>{project.cocStatus}</Text>
        </View>
      </View>

      {project.inspectionFinding ? (
        <View style={styles.findingBox}>
          <Text style={styles.findingLabel}>Inspection Finding</Text>
          <Text style={styles.findingText}>{project.inspectionFinding}</Text>
        </View>
      ) : null}

      <Row label="Implementing Office" value={project.implementingOffice} />
      {project.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{project.notes}</Text>
        </View>
      ) : null}

      <Text style={styles.source}>Source: BetterGov.ph · CC0 1.0</Text>
    </HomeFloatingPanel>
  );
}

const styles = StyleSheet.create({
  panelContainer: {
    maxWidth: 480,
    alignSelf: "center",
    left: "auto" as unknown as number,
    right: "auto" as unknown as number,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  contractId: {
    color: tokens.colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  projectName: {
    color: tokens.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginVertical: 4,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  costLabel: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
  costValue: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  rowLabel: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
  rowValue: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "500",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  cocRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cocBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  cocBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  findingBox: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    gap: 4,
  },
  findingLabel: {
    color: tokens.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  findingText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    lineHeight: 18,
  },
  notesBox: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    gap: 4,
  },
  notesLabel: {
    color: tokens.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
    fontStyle: "italic",
  },
  source: {
    color: tokens.colors.textDisabled,
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },
});

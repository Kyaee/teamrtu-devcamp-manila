import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { tokens } from "@/src/design/tokens";
import { mockAlerts } from "@/src/features/alerts/data";
import { supabase } from "@/src/services/supabase";
import type { Alert } from "@/src/types/domain";
import type { DbAlert } from "@/src/types/supabase";

function dbAlertToDomain(row: DbAlert): Alert {
  return {
    id: row.id,
    barangay: row.barangay,
    city: row.city,
    severity: row.severity,
    headline: row.headline,
    instruction: row.instruction,
    primaryCtaLabel: row.primary_cta_label,
    primaryCtaPath: row.primary_cta_path,
    updatedAt: row.updated_at,
    rationale: row.rationale,
  };
}

export default function AlertDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Try mock data first (instant for seed IDs)
      const mock = mockAlerts.find((item) => item.id === params.id);
      if (mock) {
        setAlert(mock);
        setLoading(false);
        return;
      }

      // Fetch from Supabase
      if (supabase && params.id) {
        try {
          const { data, error } = await supabase
            .from("alerts")
            .select("*")
            .eq("id", params.id)
            .single();
          if (!error && data) {
            setAlert(dbAlertToDomain(data as DbAlert));
          }
        } catch {
          // fall through
        }
      }
      setLoading(false);
    };
    void load();
  }, [params.id]);

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={tokens.colors.ctaPrimary} size="large" />
      </Screen>
    );
  }

  if (!alert) {
    return (
      <Screen>
        <Text style={styles.header}>Alert not found</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.header}>Alert detail</Text>
      <View
        style={[
          styles.card,
          {
            borderLeftColor: tokens.colors.severity[alert.severity],
            borderLeftWidth: 4,
          },
        ]}
      >
        <Text style={styles.title}>
          {alert.severity} - {alert.barangay}, {alert.city}
        </Text>
        <Text style={styles.body}>{alert.headline}</Text>
        <Text style={styles.sub}>{alert.instruction}</Text>
        <Text style={styles.sub}>Rationale: {alert.rationale}</Text>
      </View>
      <Pressable
        style={styles.cta}
        onPress={() => router.push(alert.primaryCtaPath as never)}
      >
        <Text style={styles.ctaText}>{alert.primaryCtaLabel}</Text>
      </Pressable>
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
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  sub: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  cta: {
    minHeight: 56,
    borderRadius: 0,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: tokens.colors.ctaText,
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
});

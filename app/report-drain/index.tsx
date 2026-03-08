import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tokens } from "@/src/design/tokens";
import { useMapReports } from "@/src/features/map/use-map-reports";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";

const DRAIN_LABELS = [
  "Baradong kanal",
  "Basura sa kanal",
  "Basura sa kalsada",
  "Baha dahil sa kanal",
  "Iba pa",
] as const;

export default function ReportDrainScreen() {
  const { back } = useRouter();
  const { isConnected } = useConnectivity();
  const { location } = useUserLocation();
  const { addDrainReport } = useMapReports();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>(DRAIN_LABELS[0]);
  const [submitted, setSubmitted] = useState(false);

  const openCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }, []);

  useEffect(() => {
    openCamera();
  }, [openCamera]);

  const handleSubmit = useCallback(async () => {
    if (!location) return;
    const description = selectedLabel + (photoUri ? " (may larawan)" : "");
    await addDrainReport(
      description,
      isConnected,
      location.latitude,
      location.longitude,
      photoUri,
    );
    setSubmitted(true);
    setTimeout(() => back(), 1200);
  }, [addDrainReport, isConnected, location, selectedLabel, photoUri, back]);

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successWrap}>
          <Text style={styles.successIcon}>{"\u2713"}</Text>
          <Text style={styles.successText}>Na-submit ang report!</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={back} style={styles.backButton}>
          <Text style={styles.backText}>{"\u2190"} Bumalik</Text>
        </Pressable>
        <Text style={styles.title}>Report: Baradong Kanal</Text>
      </View>

      {/* Photo preview / retake */}
      <View style={styles.photoSection}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            contentFit="cover"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderText}>Walang larawan</Text>
          </View>
        )}
        <Pressable style={styles.retakeButton} onPress={openCamera}>
          <Text style={styles.retakeText}>
            {photoUri ? "Kunan ulit" : "Kunan ng larawan"}
          </Text>
        </Pressable>
      </View>

      {/* Label picker */}
      <View style={styles.labelSection}>
        <Text style={styles.labelTitle}>Kategorya (optional)</Text>
        <View style={styles.labelGrid}>
          {DRAIN_LABELS.map((label) => (
            <Pressable
              key={label}
              style={[
                styles.labelChip,
                selectedLabel === label ? styles.labelChipActive : null,
              ]}
              onPress={() => setSelectedLabel(label)}
            >
              <Text
                style={[
                  styles.labelChipText,
                  selectedLabel === label ? styles.labelChipTextActive : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Submit */}
      <View style={styles.footer}>
        <Pressable style={styles.submitButton} onPress={handleSubmit}>
          <Text style={styles.submitText}>I-submit ang Report</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  header: {
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xs,
  },
  backButton: {
    paddingVertical: 4,
  },
  backText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  title: {
    color: tokens.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  photoSection: {
    paddingHorizontal: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: tokens.radius.lg,
    borderCurve: "continuous",
    backgroundColor: tokens.colors.surfaceAlt,
  },
  photoPlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: tokens.radius.lg,
    borderCurve: "continuous",
    backgroundColor: tokens.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: {
    color: tokens.colors.textDisabled,
    fontSize: tokens.type.body,
  },
  retakeButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.ctaPrimary,
    borderCurve: "continuous",
  },
  retakeText: {
    color: tokens.colors.ctaPrimary,
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  labelSection: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  labelTitle: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  labelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.spacing.xs,
  },
  labelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    borderCurve: "continuous",
  },
  labelChipActive: {
    backgroundColor: tokens.colors.ctaPrimary,
    borderColor: tokens.colors.ctaPrimary,
  },
  labelChipText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.label,
    fontWeight: "500",
  },
  labelChipTextActive: {
    color: tokens.colors.ctaText,
  },
  footer: {
    marginTop: "auto",
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.lg,
  },
  submitButton: {
    minHeight: 56,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  submitText: {
    color: tokens.colors.ctaText,
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
  successWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing.sm,
  },
  successIcon: {
    fontSize: 48,
    color: tokens.colors.safe,
  },
  successText: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
});

import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";

const SPLASH_DURATION_MS = 8_000;

export function SplashOverlay({ onFinish }: { onFinish?: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onFinish?.();
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onFinish]);

  if (!visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(400)} style={styles.overlay}>
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/LOGO.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#000000" />
          <Text style={styles.loadingText}>Preparing your safety data…</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: 32,
  },
  logo: {
    width: 260,
    height: 260,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#6B6B6B",
    fontSize: 14,
  },
});

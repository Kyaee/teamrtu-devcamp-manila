import { useCallback, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { tokens } from "@/src/design/tokens";

const HANDLE_HEIGHT = 32;
const SPRING_CONFIG = { damping: 22, stiffness: 200, mass: 0.8 };

type Props = {
  expandedHeight: number;
  collapsedHeight: number;
  children: React.ReactNode;
  header?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function HomeFloatingPanel({
  expandedHeight,
  collapsedHeight,
  children,
  header,
  containerStyle,
}: Props) {
  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const expandedY = 0;
  const collapsedY = expandedHeight - collapsedHeight;
  const hiddenY = expandedHeight - HANDLE_HEIGHT;

  const resetScroll = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const enableScroll = useCallback(() => setScrollEnabled(true), []);
  const disableScroll = useCallback(() => setScrollEnabled(false), []);

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.set(translateY.get());
    })
    .onUpdate((e) => {
      const next = startY.get() + e.translationY;
      translateY.set(Math.max(expandedY, Math.min(next, hiddenY)));
    })
    .onEnd((e) => {
      const currentY = translateY.get();
      const vy = e.velocityY;

      if (vy > 600) {
        if (currentY < collapsedY) {
          translateY.set(withSpring(collapsedY, SPRING_CONFIG));
          runOnJS(disableScroll)();
          runOnJS(resetScroll)();
        } else {
          translateY.set(withSpring(hiddenY, SPRING_CONFIG));
          runOnJS(disableScroll)();
          runOnJS(resetScroll)();
        }
        return;
      }
      if (vy < -600) {
        if (currentY > collapsedY) {
          translateY.set(withSpring(collapsedY, SPRING_CONFIG));
          runOnJS(disableScroll)();
        } else {
          translateY.set(withSpring(expandedY, SPRING_CONFIG));
          runOnJS(enableScroll)();
        }
        return;
      }

      const midExpCol = (expandedY + collapsedY) / 2;
      const midColHid = (collapsedY + hiddenY) / 2;

      if (currentY < midExpCol) {
        translateY.set(withSpring(expandedY, SPRING_CONFIG));
        runOnJS(enableScroll)();
      } else if (currentY < midColHid) {
        translateY.set(withSpring(collapsedY, SPRING_CONFIG));
        runOnJS(disableScroll)();
        runOnJS(resetScroll)();
      } else {
        translateY.set(withSpring(hiddenY, SPRING_CONFIG));
        runOnJS(disableScroll)();
        runOnJS(resetScroll)();
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const handleOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [expandedY, hiddenY], [0.3, 1]),
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        { height: expandedHeight },
        containerStyle,
        animatedStyle,
      ]}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={styles.handleArea}>
          <Animated.View style={[styles.handleBar, handleOpacity]} />
          <Animated.View style={handleOpacity}>
            <Text style={styles.handleHint}>Drag to expand / hide</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {header}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        bounces={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    borderCurve: "continuous",
    boxShadow: "0 -2px 16px rgba(0,0,0,0.10)",
  },
  handleArea: {
    height: HANDLE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.textDisabled,
  },
  handleHint: {
    fontSize: 10,
    color: tokens.colors.textDisabled,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
});

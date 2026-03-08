import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { tokens } from "@/src/design/tokens";
import type { ConversationMessage } from "@/src/features/help/use-help-assessment";
import { useHelpAssessment } from "@/src/features/help/use-help-assessment";
import { useLiveVoice } from "@/src/features/help/use-live-voice";
import type { TurnState } from "@/src/services/gemini-live";
import {
  useUrgentMarkers,
  URGENT_PURPLE_PIN,
} from "@/src/features/map/use-urgent-markers";
import { useUserLocation } from "@/src/features/map/use-user-location";
import { useConnectivity } from "@/src/features/offline/use-connectivity";
import { useCenters } from "@/src/features/centers/use-centers";
import { useAppSlice } from "@/src/store/app-slice";
import { useChecklistStore } from "@/src/store/checklist-store";
import type { ChecklistEntry } from "@/src/store/checklist-store";
import type { HelpAssessment } from "@/src/types/ai";
import type { EvacCenter } from "@/src/types/domain";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const URGENCY_COLORS: Record<string, string> = {
  low: tokens.colors.severity.MONITOR,
  medium: tokens.colors.severity.PREPARE,
  high: tokens.colors.severity.LEAVE,
  very_urgent: tokens.colors.severity.EVACUATE,
};

const URGENCY_LABELS: Record<string, string> = {
  low: "Mababang Panganib",
  medium: "Katamtamang Panganib",
  high: "Mataas na Panganib",
  very_urgent: "SOBRANG URGENT",
};

const CATEGORY_LABELS: Record<string, string> = {
  documents: "Dokumento",
  food_water: "Pagkain at Tubig",
  clothing: "Damit",
  medical: "Gamot / Medical",
  electronics: "Electronics",
  tools: "Kagamitan",
  other: "Iba pa",
};

const TURN_STATE_LABELS: Record<TurnState, string> = {
  listening: "Nakikinig...",
  speaking: "Sumasagot ang AI...",
  idle: "Handa na",
};

const TURN_STATE_COLORS: Record<TurnState, string> = {
  listening: tokens.colors.safe,
  speaking: tokens.colors.severity.PREPARE,
  idle: tokens.colors.textDisabled,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAssistant,
      ]}
    >
      <Text
        style={[
          styles.bubbleText,
          isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
        ]}
      >
        {message.text}
      </Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Assessment Card — shows urgency, checklist, actions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Interactive Checklist Card (FR-7) — synced via shared checklist store
// ---------------------------------------------------------------------------

function InteractiveChecklist({
  items,
  onToggle,
}: {
  items: ChecklistEntry[];
  onToggle: (itemId: string) => void;
}) {
  if (items.length === 0) return null;

  const grouped = new Map<string, ChecklistEntry[]>();
  for (const item of items) {
    const existing = grouped.get(item.category) ?? [];
    existing.push(item);
    grouped.set(item.category, existing);
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={styles.assessmentCard}
    >
      <View style={styles.centersHeaderRow}>
        <Ionicons
          name="checkbox-outline"
          size={16}
          color={tokens.colors.ctaPrimary}
        />
        <Text style={styles.sectionTitle}>
          Emergency Checklist ({doneCount}/{items.length})
        </Text>
      </View>
      <Text
        style={[
          styles.fallbackNote,
          { fontStyle: "normal", textAlign: "left" },
        ]}
      >
        Synced across app — changes here update everywhere.
      </Text>
      {Array.from(grouped.entries()).map(([category, catItems]) => (
        <View key={category} style={styles.checklistGroup}>
          <Text style={styles.checklistCategory}>
            {CATEGORY_LABELS[category] ?? category}
          </Text>
          {catItems.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.checklistRow}
              onPress={() => onToggle(entry.id)}
            >
              <View
                style={[
                  styles.checklistBox,
                  entry.done && styles.checklistBoxDone,
                ]}
              >
                {entry.done && (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                )}
              </View>
              <Text
                style={[
                  styles.checklistLabel,
                  entry.done && styles.checklistLabelDone,
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

function AssessmentCard({
  assessment,
  onMarkUrgent,
  onNavigate,
  urgentSending,
  urgentSent,
}: {
  assessment: HelpAssessment;
  onMarkUrgent: () => void;
  onNavigate: () => void;
  urgentSending: boolean;
  urgentSent: boolean;
}) {
  const color =
    URGENCY_COLORS[assessment.urgencyLevel] ?? tokens.colors.severity.PREPARE;
  const grouped = new Map<string, string[]>();
  for (const item of assessment.checklistItems) {
    const existing = grouped.get(item.category) ?? [];
    existing.push(item.label);
    grouped.set(item.category, existing);
  }

  return (
    <Animated.View
      entering={SlideInDown.duration(400)}
      style={styles.assessmentCard}
    >
      <View style={[styles.urgencyBanner, { backgroundColor: color }]}>
        <Text style={styles.urgencyBannerText}>
          {URGENCY_LABELS[assessment.urgencyLevel] ?? "Assessment"}
        </Text>
      </View>

      <Text style={styles.assessmentSummary}>{assessment.summary}</Text>

      <View style={styles.sectionDivider} />
      <Text style={styles.sectionTitle}>Inirerekomendang Aksyon</Text>
      {assessment.recommendedActions.map((action, i) => (
        <View key={i} style={styles.actionRow}>
          <Text style={styles.actionBullet}>{i + 1}.</Text>
          <Text style={styles.actionText}>{action}</Text>
        </View>
      ))}

      {grouped.size > 0 && (
        <>
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>Checklist ng mga Dadalhin</Text>
          {Array.from(grouped.entries()).map(([category, items]) => (
            <View key={category} style={styles.checklistGroup}>
              <Text style={styles.checklistCategory}>
                {CATEGORY_LABELS[category] ?? category}
              </Text>
              {items.map((label, i) => (
                <View key={i} style={styles.checklistRow}>
                  <View style={styles.checklistBox} />
                  <Text style={styles.checklistLabel}>{label}</Text>
                </View>
              ))}
            </View>
          ))}
        </>
      )}

      {/* FR-6: Purple urgent-to-save marker button */}
      {(assessment.urgencyLevel === "very_urgent" ||
        assessment.urgencyLevel === "high") && (
        <>
          <View style={styles.sectionDivider} />
          <Pressable
            style={[
              styles.urgentButton,
              urgentSent && styles.urgentButtonSent,
              !urgentSent && styles.urgentButtonPurple,
            ]}
            onPress={onMarkUrgent}
            disabled={urgentSending || urgentSent}
          >
            {urgentSending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.urgentButtonText}>
                {urgentSent
                  ? "\u2713 Marked as Urgent to Save"
                  : "\u{1F7E3} Mark as Urgent to Save"}
              </Text>
            )}
          </Pressable>
        </>
      )}

      {assessment.navigationIntent && (
        <Pressable style={styles.navButton} onPress={onNavigate}>
          <Ionicons name="navigate" size={18} color="#FFFFFF" />
          <Text style={styles.navButtonText}>
            Go to Nearest Evacuation Center
          </Text>
        </Pressable>
      )}

      {assessment.isFallback && (
        <Text style={styles.fallbackNote}>
          AI fallback — assessment may be incomplete. Contact your barangay
          hotline.
        </Text>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Nearby Centers Card — reuses existing centers data
// ---------------------------------------------------------------------------

function NearbyCentersCard({
  centers,
  loading,
  onNavigate,
}: {
  centers: EvacCenter[];
  loading: boolean;
  onNavigate: (centerId: string) => void;
}) {
  if (loading) {
    return (
      <View style={styles.centersCard}>
        <View style={styles.centersHeaderRow}>
          <Ionicons name="location" size={16} color={tokens.colors.danger} />
          <Text style={styles.sectionTitle}>
            Mga Malapit na Evacuation Center
          </Text>
        </View>
        <ActivityIndicator color={tokens.colors.danger} />
      </View>
    );
  }

  if (centers.length === 0) return null;

  const top5 = centers.slice(0, 5);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.centersCard}>
      <View style={styles.centersHeaderRow}>
        <Ionicons name="location" size={16} color={tokens.colors.danger} />
        <Text style={styles.sectionTitle}>
          Mga Malapit na Evacuation Center
        </Text>
      </View>
      {top5.map((center) => (
        <Pressable
          key={center.id}
          style={styles.centerRow}
          onPress={() => onNavigate(center.id)}
        >
          <View style={styles.centerRowLeft}>
            <Text style={styles.centerName}>{center.name}</Text>
            <Text style={styles.centerMeta}>
              {center.distanceKm.toFixed(1)} km · {center.status}
              {center.barangay ? ` · ${center.barangay}` : ""}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={tokens.colors.textDisabled}
          />
        </Pressable>
      ))}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Animated mic pulse rings
// ---------------------------------------------------------------------------

function MicPulse({
  active,
  turnState,
}: {
  active: boolean;
  turnState: TurnState;
}) {
  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const opacity1 = useSharedValue(0.4);
  const opacity2 = useSharedValue(0.25);

  useEffect(() => {
    if (active && turnState === "listening") {
      scale1.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 800, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      opacity1.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 800 }),
          withTiming(0.4, { duration: 800 }),
        ),
        -1,
        false,
      );
      scale2.value = withRepeat(
        withSequence(
          withTiming(1.9, { duration: 1000, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      opacity2.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 1000 }),
          withTiming(0.25, { duration: 1000 }),
        ),
        -1,
        false,
      );
    } else if (active && turnState === "speaking") {
      // Slower, calmer pulse when AI is speaking
      scale1.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
      opacity1.value = withRepeat(
        withSequence(
          withTiming(0.1, { duration: 1200 }),
          withTiming(0.3, { duration: 1200 }),
        ),
        -1,
        false,
      );
      cancelAnimation(scale2);
      cancelAnimation(opacity2);
      scale2.value = withTiming(1, { duration: 300 });
      opacity2.value = withTiming(0, { duration: 300 });
    } else {
      cancelAnimation(scale1);
      cancelAnimation(scale2);
      cancelAnimation(opacity1);
      cancelAnimation(opacity2);
      scale1.value = withTiming(1, { duration: 300 });
      scale2.value = withTiming(1, { duration: 300 });
      opacity1.value = withTiming(0, { duration: 300 });
      opacity2.value = withTiming(0, { duration: 300 });
    }
  }, [active, turnState, scale1, scale2, opacity1, opacity2]);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity1.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: opacity2.value,
  }));

  const baseColor =
    turnState === "listening"
      ? tokens.colors.safe
      : turnState === "speaking"
        ? tokens.colors.severity.PREPARE
        : tokens.colors.textDisabled;

  return (
    <View style={styles.pulseContainer}>
      <Animated.View
        style={[styles.pulseRing, { borderColor: baseColor }, ring2Style]}
      />
      <Animated.View
        style={[styles.pulseRing, { borderColor: baseColor }, ring1Style]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Voice Mode Panel — shows when AI is active (connecting/listening/speaking)
// ---------------------------------------------------------------------------

function VoiceModePanel({
  turnState,
  isMicActive,
  voiceError,
  voiceState,
  onStop,
  onSwitchToChat,
}: {
  turnState: TurnState;
  isMicActive: boolean;
  voiceError: string | null;
  voiceState: string;
  onStop: () => void;
  onSwitchToChat: () => void;
}) {
  const isActive = voiceState === "active" || voiceState === "connecting";

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.voicePanel}
    >
      {/* Status indicator */}
      <View style={styles.voiceStatusRow}>
        <View
          style={[
            styles.voiceStatusDot,
            {
              backgroundColor:
                voiceState === "active"
                  ? TURN_STATE_COLORS[turnState]
                  : voiceState === "connecting"
                    ? tokens.colors.severity.PREPARE
                    : tokens.colors.danger,
            },
          ]}
        />
        <Text style={styles.voiceStatusText}>
          {voiceState === "connecting"
            ? "Kumokonekta sa AI..."
            : voiceState === "active"
              ? TURN_STATE_LABELS[turnState]
              : voiceState === "error"
                ? "May error"
                : "Voice Mode"}
        </Text>
      </View>

      {/* Mic pulse visualizer — shown when AI is active */}
      {isActive && (
        <View style={styles.voiceCenterArea}>
          <MicPulse active={isMicActive && isActive} turnState={turnState} />
          <View
            style={[
              styles.voiceMicCircle,
              {
                backgroundColor:
                  turnState === "listening"
                    ? tokens.colors.safe
                    : turnState === "speaking"
                      ? tokens.colors.severity.PREPARE
                      : tokens.colors.ctaPrimary,
              },
            ]}
          >
            <Ionicons
              name={
                turnState === "speaking"
                  ? "volume-high"
                  : turnState === "listening"
                    ? "mic"
                    : "mic-outline"
              }
              size={40}
              color="#FFFFFF"
            />
          </View>
        </View>
      )}

      {/* Instructions */}
      <Text style={styles.voiceInstructionText}>
        {voiceState === "connecting"
          ? "Sandali lang, kumokonekta..."
          : voiceState === "active" && turnState === "listening"
            ? "Magsalita ka ngayon — nakikinig ang AI"
            : voiceState === "active" && turnState === "speaking"
              ? "Sumasagot ang AI — makinig ka muna"
              : voiceState === "error"
                ? (voiceError ?? "Hindi maka-connect. I-try ang text mode.")
                : "Kumokonekta..."}
      </Text>

      {voiceError && voiceState === "error" && (
        <Animated.View entering={FadeIn}>
          <Text style={styles.voiceErrorText}>{voiceError}</Text>
        </Animated.View>
      )}

      {/* Action buttons */}
      <View style={styles.voiceActionsRow}>
        <Pressable style={styles.voiceStopButton} onPress={onStop}>
          <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
          <Text style={styles.voiceStopText}>Itigil</Text>
        </Pressable>

        {/* Chat fallback button — always available */}
        <Pressable style={styles.chatFallbackButton} onPress={onSwitchToChat}>
          <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
          <Text style={styles.chatFallbackText}>Mag-chat na lang</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function RequestHelpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ autoStartVoice?: string }>();
  const insets = useSafeAreaInsets();
  const { location } = useUserLocation();
  const { isConnected } = useConnectivity();
  const { setLatestAssessment } = useAppSlice();

  // FR-7: Shared checklist store for cross-page sync
  const {
    checklist: sharedChecklist,
    mergeAiChecklist: mergeSharedChecklist,
    toggleItem: toggleChecklistItem,
  } = useChecklistStore();

  const {
    messages,
    assessment,
    state,
    error,
    sendMessage,
    runAssessment,
    hasEnoughMessages,
  } = useHelpAssessment(location?.latitude, location?.longitude);
  const { addUrgentMarker, sending: urgentSending } = useUrgentMarkers();

  // Centers data — reuse existing hook
  const { centers, loading: centersLoading } = useCenters(
    location?.latitude,
    location?.longitude,
  );

  // Voice mode
  const liveVoice = useLiveVoice();

  /**
   * Mode state machine:
   * - "voice": live voice is the primary UI (animation + mic)
   * - "chat": text chat fallback (when voice unavailable or user chose chat)
   */
  const [mode, setMode] = useState<"voice" | "chat">("voice");
  const [inputText, setInputText] = useState("");
  const [urgentSent, setUrgentSent] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  /**
   * Auto-start guard. Ensures we only auto-start voice once per mount,
   * even across re-renders.
   */
  const autoStartedRef = useRef(false);

  // Auto-start voice when coming from Home CTA
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;

    if (params.autoStartVoice === "1") {
      // Check native availability first
      if (!liveVoice.isNativeAvailable) {
        console.log(
          "[Fallback] activated reason=native_unavailable on auto-start",
        );
        setMode("chat");
        return;
      }
      void liveVoice.start();
    } else {
      // No auto-start param — default to chat
      setMode("chat");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If voice enters error/disconnected state, offer chat fallback
  useEffect(() => {
    if (
      mode === "voice" &&
      (liveVoice.state === "error" || liveVoice.state === "disconnected")
    ) {
      // Don't auto-switch — let the user see the error and choose
    }
  }, [mode, liveVoice.state]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Auto-scroll when keyboard appears so input stays visible
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    });
    return () => sub.remove();
  }, []);

  // Persist assessment + merge checklist into shared store (FR-7)
  useEffect(() => {
    if (assessment) {
      setLatestAssessment(assessment);
      // FR-7: Generate checklist in shared store from AI assessment
      if (assessment.checklistItems.length > 0) {
        mergeSharedChecklist(assessment.checklistItems);
      }
    }
  }, [assessment, setLatestAssessment, mergeSharedChecklist]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setInputText("");
    void sendMessage(trimmed);
  }, [inputText, sendMessage]);

  const handleAssess = useCallback(() => {
    void runAssessment();
  }, [runAssessment]);

  // FR-6: Urgent-to-save purple marker with explicit confirmation
  const handleMarkUrgent = useCallback(() => {
    if (!assessment || !location) return;
    Alert.alert(
      "Confirm Urgent to Save",
      "This will place a PURPLE marker on the map visible to all responders at your current location. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Mark Urgent",
          style: "destructive",
          onPress: async () => {
            await addUrgentMarker(
              location.latitude,
              location.longitude,
              assessment.urgencyLevel === "very_urgent"
                ? "very_urgent"
                : "high",
              assessment.summary,
              isConnected,
            );
            setUrgentSent(true);
          },
        },
      ],
    );
  }, [assessment, location, isConnected, addUrgentMarker]);

  const handleNavigateToCenter = useCallback(
    (centerId?: string) => {
      if (centerId) {
        router.push({
          pathname: "/navigate",
          params: { centerId },
        } as never);
      } else {
        router.push("/(tabs)/centers" as never);
      }
    },
    [router],
  );

  const handleStopVoice = useCallback(() => {
    liveVoice.stop();
    setMode("chat");
  }, [liveVoice]);

  const handleSwitchToChat = useCallback(() => {
    liveVoice.stop();
    setMode("chat");
  }, [liveVoice]);

  const renderMessage = useCallback(
    ({ item }: { item: ConversationMessage }) => (
      <MessageBubble message={item} />
    ),
    [],
  );

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  /** Voice is actively doing something (connecting, listening, speaking) */
  const isVoiceActive =
    mode === "voice" &&
    (liveVoice.state === "connecting" ||
      liveVoice.state === "active" ||
      liveVoice.state === "requesting_permissions");

  /** Voice had an error but we're still in voice mode */
  const isVoiceError =
    mode === "voice" &&
    (liveVoice.state === "error" || liveVoice.state === "disconnected");

  /** Show voice panel (animation + controls) when voice mode is engaged */
  const showVoicePanel = mode === "voice";

  /** Show chat UI */
  const showChat = mode === "chat";

  // Bottom padding for Android navigation
  const bottomPadding = Math.max(insets.bottom, 16);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Animated.View entering={SlideInDown.duration(350)} style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (mode === "voice") liveVoice.stop();
              router.back();
            }}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={tokens.colors.textPrimary}
            />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Request Help</Text>
            <Text style={styles.headerSub}>
              {showVoicePanel
                ? "Voice Mode — Speech to Speech"
                : "AI Emergency Assessment"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {state === "conversing" && showChat && (
              <ActivityIndicator size="small" color={tokens.colors.danger} />
            )}
            {showVoicePanel && liveVoice.isMicActive && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Offline banner */}
        {!isConnected && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={14} color="#FFFFFF" />
            <Text style={styles.offlineBannerText}>
              Offline — ang AI assessment ay maaaring hindi gumana. Ang urgent
              marker ay ise-send kapag may internet.
            </Text>
          </View>
        )}

        <KeyboardAvoidingView
          style={styles.content}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          {/* ============================================================= */}
          {/* VOICE MODE                                                     */}
          {/* ============================================================= */}
          {showVoicePanel ? (
            <ScrollView
              style={styles.voiceWrapper}
              contentContainerStyle={[
                styles.voiceScrollContent,
                { paddingBottom: bottomPadding },
              ]}
            >
              {/* Voice panel with animation */}
              {(isVoiceActive || isVoiceError) && (
                <VoiceModePanel
                  turnState={liveVoice.turnState}
                  isMicActive={liveVoice.isMicActive}
                  voiceError={liveVoice.error}
                  voiceState={liveVoice.state}
                  onStop={handleStopVoice}
                  onSwitchToChat={handleSwitchToChat}
                />
              )}

              {/* Assessment card if available */}
              {assessment && (
                <View style={styles.voiceResultsContainer}>
                  <AssessmentCard
                    assessment={assessment}
                    onMarkUrgent={handleMarkUrgent}
                    onNavigate={() => handleNavigateToCenter()}
                    urgentSending={urgentSending}
                    urgentSent={urgentSent}
                  />
                </View>
              )}

              {/* Nearby evacuation centers */}
              <NearbyCentersCard
                centers={centers}
                loading={centersLoading}
                onNavigate={handleNavigateToCenter}
              />
            </ScrollView>
          ) : null}

          {/* ============================================================= */}
          {/* CHAT MODE (fallback)                                           */}
          {/* ============================================================= */}
          {showChat ? (
            <>
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) => item.id}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                ListHeaderComponent={
                  messages.length === 0 ? (
                    <Animated.View
                      entering={FadeIn.delay(200)}
                      style={styles.emptyState}
                    >
                      <Ionicons
                        name="chatbubbles-outline"
                        size={48}
                        color={tokens.colors.textDisabled}
                      />
                      <Text style={styles.emptyTitle}>
                        Describe your situation
                      </Text>
                      <Text style={styles.emptySub}>
                        Tell us what&#39;s happening — flooding, damage, need
                        rescue — and the AI will assess your urgency level. You
                        can speak in English or Filipino.
                      </Text>
                    </Animated.View>
                  ) : null
                }
                ListFooterComponent={
                  <>
                    {state === "assessing" && (
                      <Animated.View
                        entering={FadeIn}
                        style={styles.assessingRow}
                      >
                        <ActivityIndicator color={tokens.colors.danger} />
                        <Text style={styles.assessingText}>
                          Ina-assess ang sitwasyon mo...
                        </Text>
                      </Animated.View>
                    )}
                    {assessment && (
                      <AssessmentCard
                        assessment={assessment}
                        onMarkUrgent={handleMarkUrgent}
                        onNavigate={() => handleNavigateToCenter()}
                        urgentSending={urgentSending}
                        urgentSent={urgentSent}
                      />
                    )}

                    {/* FR-7: Interactive checklist synced across app */}
                    <InteractiveChecklist
                      items={sharedChecklist.items}
                      onToggle={toggleChecklistItem}
                    />

                    {/* Nearby centers in chat mode too */}
                    <NearbyCentersCard
                      centers={centers}
                      loading={centersLoading}
                      onNavigate={handleNavigateToCenter}
                    />

                    {error && (
                      <Animated.View entering={FadeIn} exiting={FadeOut}>
                        <Text style={styles.errorText}>{error}</Text>
                      </Animated.View>
                    )}
                  </>
                }
              />

              {/* Input area with safe bottom padding */}
              {state !== "done" && (
                <View
                  style={[styles.inputArea, { paddingBottom: bottomPadding }]}
                >
                  {hasEnoughMessages && state !== "assessing" && (
                    <Pressable
                      style={styles.assessButton}
                      onPress={handleAssess}
                    >
                      <Ionicons
                        name="shield-checkmark"
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.assessButtonText}>Assess Now</Text>
                    </Pressable>
                  )}
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Describe your situation..."
                      placeholderTextColor={tokens.colors.textDisabled}
                      value={inputText}
                      onChangeText={setInputText}
                      onSubmitEditing={handleSend}
                      returnKeyType="send"
                      blurOnSubmit={false}
                      editable={state !== "assessing"}
                      multiline
                      maxLength={500}
                      onFocus={() => {
                        setTimeout(() => {
                          flatListRef.current?.scrollToEnd({ animated: true });
                        }, 200);
                      }}
                    />
                    <Pressable
                      style={[
                        styles.sendButton,
                        !inputText.trim() && styles.sendButtonDisabled,
                      ]}
                      onPress={handleSend}
                      disabled={!inputText.trim() || state === "assessing"}
                    >
                      <Ionicons
                        name="send"
                        size={18}
                        color={
                          inputText.trim()
                            ? "#FFFFFF"
                            : tokens.colors.textDisabled
                        }
                      />
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    gap: tokens.spacing.sm,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.colors.textSecondary,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  offlineBannerText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  headerRight: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBadge: {
    backgroundColor: tokens.colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  content: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.xl,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.lg,
    borderCurve: "continuous",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: tokens.colors.ctaPrimary,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: tokens.colors.surfaceAlt,
  },
  bubbleText: {
    fontSize: tokens.type.body,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: "#FFFFFF",
  },
  bubbleTextAssistant: {
    color: tokens.colors.textPrimary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: tokens.spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: tokens.colors.textPrimary,
    textAlign: "center",
  },
  emptySub: {
    fontSize: tokens.type.body,
    color: tokens.colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: tokens.spacing.xl,
  },
  assessingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
    justifyContent: "center",
  },
  assessingText: {
    fontSize: tokens.type.body,
    color: tokens.colors.danger,
    fontWeight: "600",
  },
  errorText: {
    color: tokens.colors.danger,
    fontSize: tokens.type.label,
    textAlign: "center",
    paddingVertical: tokens.spacing.sm,
  },
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    gap: tokens.spacing.xs,
    backgroundColor: tokens.colors.background,
  },
  assessButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: tokens.colors.danger,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
  },
  assessButtonText: {
    color: "#FFFFFF",
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: tokens.spacing.xs,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    fontSize: tokens.type.body,
    color: tokens.colors.textPrimary,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: tokens.colors.surfaceAlt,
  },
  assessmentCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  },
  urgencyBanner: {
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  urgencyBannerText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  assessmentSummary: {
    fontSize: tokens.type.body,
    color: tokens.colors.textPrimary,
    lineHeight: 22,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: tokens.type.label,
    fontWeight: "700",
    color: tokens.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: "row",
    gap: 6,
    paddingLeft: 4,
  },
  actionBullet: {
    fontSize: tokens.type.body,
    fontWeight: "700",
    color: tokens.colors.textPrimary,
  },
  actionText: {
    flex: 1,
    fontSize: tokens.type.body,
    color: tokens.colors.textPrimary,
    lineHeight: 21,
  },
  checklistGroup: {
    gap: 4,
  },
  checklistCategory: {
    fontSize: tokens.type.label,
    fontWeight: "600",
    color: tokens.colors.ctaPrimary,
    marginTop: 4,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 8,
  },
  checklistBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: tokens.colors.textDisabled,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistBoxDone: {
    backgroundColor: tokens.colors.safe,
    borderColor: tokens.colors.safe,
  },
  checklistLabel: {
    flex: 1,
    fontSize: tokens.type.body,
    color: tokens.colors.textPrimary,
  },
  checklistLabelDone: {
    textDecorationLine: "line-through",
    color: tokens.colors.textDisabled,
  },
  urgentButton: {
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(239,68,68,0.35)",
    borderCurve: "continuous",
  },
  urgentButtonPurple: {
    backgroundColor: URGENT_PURPLE_PIN,
    boxShadow: "0 2px 8px rgba(147,51,234,0.4)",
  },
  urgentButtonSent: {
    backgroundColor: tokens.colors.safe,
  },
  urgentButtonText: {
    color: "#FFFFFF",
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
  navButton: {
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ctaPrimary,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderCurve: "continuous",
  },
  navButtonText: {
    color: "#FFFFFF",
    fontSize: tokens.type.body,
    fontWeight: "700",
  },
  fallbackNote: {
    fontSize: 11,
    color: tokens.colors.textDisabled,
    fontStyle: "italic",
    textAlign: "center",
  },

  // -- Centers card -------------------------------------------------------
  centersCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    marginTop: tokens.spacing.sm,
  },
  centersHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
  },
  centerRowLeft: {
    flex: 1,
    gap: 2,
  },
  centerName: {
    fontSize: tokens.type.body,
    fontWeight: "600",
    color: tokens.colors.textPrimary,
  },
  centerMeta: {
    fontSize: tokens.type.label,
    color: tokens.colors.textSecondary,
  },

  // -- Voice mode ---------------------------------------------------------
  voiceWrapper: {
    flex: 1,
  },
  voiceScrollContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
  },
  voiceResultsContainer: {
    marginTop: tokens.spacing.md,
  },
  voicePanel: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  voiceStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voiceStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  voiceStatusText: {
    fontSize: tokens.type.body,
    fontWeight: "600",
    color: tokens.colors.textPrimary,
  },
  voiceCenterArea: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceMicCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  },
  pulseContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  pulseRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  voiceInstructionText: {
    fontSize: tokens.type.body,
    color: tokens.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: tokens.spacing.md,
  },
  voiceErrorText: {
    fontSize: tokens.type.label,
    color: tokens.colors.danger,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: tokens.spacing.md,
  },
  voiceActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
  },
  voiceStopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: tokens.colors.textSecondary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: tokens.radius.pill,
    borderCurve: "continuous",
  },
  voiceStopText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
  chatFallbackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: tokens.colors.ctaPrimary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: tokens.radius.pill,
    borderCurve: "continuous",
  },
  chatFallbackText: {
    color: "#FFFFFF",
    fontSize: tokens.type.label,
    fontWeight: "600",
  },
});

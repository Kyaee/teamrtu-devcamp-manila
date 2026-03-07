import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { tokens } from "@/src/design/tokens";
import type { PlaceLocation, PlacePrediction } from "@/src/services/places";
import { autocomplete, getPlaceLocation } from "@/src/services/places";

type Props = {
  userLat?: number;
  userLng?: number;
  onSelect: (location: PlaceLocation) => void;
  statusBadge?: React.ReactNode;
};

export function LocationSearchBar({
  userLat,
  userLng,
  onSelect,
  statusBadge,
}: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setPredictions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const results = await autocomplete(query, userLat, userLng);
      setPredictions(results);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, userLat, userLng]);

  const handleSelect = async (prediction: PlacePrediction) => {
    setQuery(prediction.mainText);
    setPredictions([]);
    setFocused(false);

    const location = await getPlaceLocation(prediction.placeId);
    if (location) onSelect(location);
  };

  return (
    <View style={styles.container}>
      {statusBadge ? (
        <View style={styles.searchWithBadgeShadow}>
          <View style={styles.searchWithBadgeInner}>
            {statusBadge}
            <TextInput
              style={[styles.input, styles.inputWithBadge]}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              placeholder="Search location..."
              placeholderTextColor={tokens.colors.textDisabled}
            />
          </View>
        </View>
      ) : (
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder="Search location..."
          placeholderTextColor={tokens.colors.textDisabled}
        />
      )}

      {focused && predictions.length > 0 ? (
        <View style={styles.dropdown}>
          {predictions.map((p) => (
            <Pressable
              key={p.placeId}
              style={styles.row}
              onPress={() => handleSelect(p)}
            >
              <Text style={styles.mainText} numberOfLines={1}>
                {p.mainText}
              </Text>
              <Text style={styles.subText} numberOfLines={1}>
                {p.description}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 20,
  },
  searchWithBadgeShadow: {
    borderRadius: tokens.radius.md,
    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  searchWithBadgeInner: {
    borderRadius: tokens.radius.md,
    overflow: "hidden",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: tokens.type.body,
    color: tokens.colors.textPrimary,
    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
  },
  inputWithBadge: {
    borderRadius: 0,
    boxShadow: "none",
    backgroundColor: "transparent",
  },
  dropdown: {
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    gap: 2,
  },
  mainText: {
    color: tokens.colors.textPrimary,
    fontSize: tokens.type.body,
    fontWeight: "600",
  },
  subText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.label,
  },
});

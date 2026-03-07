import { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/src/design/tokens";

export type MarkerCategory = "center" | "search" | "flood" | "dpwh";

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  pinColor: string;
  opacity: number;
  title: string;
  description: string;
  category?: MarkerCategory;
};

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type RouteOverlay = {
  polyline: { latitude: number; longitude: number }[];
  color?: string;
  width?: number;
};

export type MapDisplayRef = {
  animateToRegion: (region: MapRegion, duration?: number) => void;
};

type MapDisplayProps = {
  initialRegion: MapRegion;
  markers: MapMarker[];
  routeOverlay?: RouteOverlay | null;
  polylines?: RouteOverlay[];
  activeStepIndex?: number;
  showsMyLocationButton?: boolean;
  onRegionChangeComplete?: (region: MapRegion) => void;
  onMarkerPress?: (marker: MapMarker) => void;
};

const MapDisplay = forwardRef<MapDisplayRef, MapDisplayProps>(
  function MapDisplay(_props, ref) {
    useImperativeHandle(ref, () => ({
      animateToRegion: () => {},
    }));

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Web map preview</Text>
        <Text style={styles.body}>
          Native interactive map is available on Android/iOS. Web mode keeps
          report actions and sync active.
        </Text>
      </View>
    );
  },
);

export default MapDisplay;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    justifyContent: "center",
    gap: tokens.spacing.sm,
  },
  title: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
});

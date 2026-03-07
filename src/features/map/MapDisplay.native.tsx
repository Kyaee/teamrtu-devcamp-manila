import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import RNMapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";

import { tokens } from "@/src/design/tokens";

import type {
  MapDisplayRef,
  MapMarker,
  MapRegion,
  RouteOverlay,
} from "./MapDisplay";

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
  function MapDisplay(
    {
      initialRegion,
      markers,
      routeOverlay,
      polylines,
      showsMyLocationButton = true,
      onRegionChangeComplete,
      onMarkerPress,
    },
    ref,
  ) {
    const mapRef = useRef<RNMapView>(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(false);

    useImperativeHandle(ref, () => ({
      animateToRegion: (region: MapRegion, duration = 500) => {
        mapRef.current?.animateToRegion(region, duration);
      },
    }));

    const handleMapReady = useCallback(() => {
      setMapReady(true);
    }, []);

    const handleMapError = useCallback(() => {
      setMapError(true);
    }, []);

    if (mapError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Hindi ma-load ang mapa</Text>
          <Text style={styles.errorBody}>
            Check your connection or try again. Report and sync features remain
            active below.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.wrapper}>
        <RNMapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={showsMyLocationButton}
          mapType="standard"
          onMapReady={handleMapReady}
          onError={handleMapError}
          onRegionChangeComplete={onRegionChangeComplete}
        >
          {routeOverlay ? (
            <Polyline
              coordinates={routeOverlay.polyline}
              strokeColor={routeOverlay.color ?? "#000000"}
              strokeWidth={routeOverlay.width ?? 4}
            />
          ) : null}
          {polylines?.map((p, i) => (
            <Polyline
              key={`polyline-${i}`}
              coordinates={p.polyline}
              strokeColor={p.color ?? "#EF4444"}
              strokeWidth={p.width ?? 6}
            />
          ))}
          {markers.map((m) => (
            <Marker
              key={m.id}
              coordinate={{ latitude: m.latitude, longitude: m.longitude }}
              pinColor={m.pinColor}
              opacity={m.opacity}
              title={m.title}
              description={m.description}
              onPress={onMarkerPress ? () => onMarkerPress(m) : undefined}
            />
          ))}
        </RNMapView>
        {!mapReady ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={tokens.colors.textPrimary} />
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        ) : null}
      </View>
    );
  },
);

export default MapDisplay;

const styles = StyleSheet.create({
  wrapper: { ...StyleSheet.absoluteFillObject },
  map: { ...StyleSheet.absoluteFillObject },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  errorTitle: {
    color: tokens.colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorBody: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.type.body,
    textAlign: "center",
  },
});

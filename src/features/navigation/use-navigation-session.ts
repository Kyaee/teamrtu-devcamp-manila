import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

import { getRouteVerbalContext } from "@/src/services/ai";
import type { LatLng, RouteResult, RouteStep } from "@/src/services/maps";
import { getCachedRoute, getRouteGuidance } from "@/src/services/maps";
import {
  clearVoiceQueue,
  enqueueVoice,
  getLocalizedPhrase,
  stopSpeaking,
} from "@/src/services/voice-navigation";

import { closestPointOnPolyline, haversineMeters } from "./geo-utils";

export type NavStatus =
  | "idle"
  | "loading"
  | "active"
  | "rerouting"
  | "arrived"
  | "paused"
  | "error";

export type NavigationState = {
  status: NavStatus;
  route: RouteResult | null;
  currentStepIndex: number;
  currentPosition: LatLng | null;
  distanceToNextStep: number | null;
  etaText: string | null;
  errorMessage: string | null;
  isMuted: boolean;
  isOffRoute: boolean;
};

const OFF_ROUTE_THRESHOLD_M = 50;
const STEP_ADVANCE_THRESHOLD_M = 25;
const ARRIVAL_THRESHOLD_M = 30;
const LOCATION_UPDATE_INTERVAL_MS = 3000;

export function useNavigationSession(
  destination: LatLng | null,
  destinationLabel = "Evacuation center",
) {
  const [state, setState] = useState<NavigationState>({
    status: "idle",
    route: null,
    currentStepIndex: 0,
    currentPosition: null,
    distanceToNextStep: null,
    etaText: null,
    errorMessage: null,
    isMuted: false,
    isOffRoute: false,
  });

  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const rerouteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const speak = useCallback(
    (text: string, urgency: "normal" | "warning" | "critical" = "normal") => {
      setState((prev) => {
        if (prev.isMuted) return prev;
        enqueueVoice(text, urgency);
        return prev;
      });
    },
    [],
  );

  const announceStep = useCallback(
    (steps: RouteStep[], index: number) => {
      if (index < steps.length) {
        speak(
          `${steps[index].instruction}. ${steps[index].distance}`,
          "normal",
        );
      }
    },
    [speak],
  );

  const handleLocationUpdate = useCallback(
    (pos: LatLng) => {
      setState((prev) => {
        if (prev.status !== "active" || !prev.route)
          return { ...prev, currentPosition: pos };

        const { route, currentStepIndex } = prev;
        const { polyline, steps } = route;

        const { distance: distToRoute } = closestPointOnPolyline(pos, polyline);

        // Off-route detection
        if (distToRoute > OFF_ROUTE_THRESHOLD_M) {
          if (!prev.isOffRoute) {
            speak(getLocalizedPhrase("offRoute"), "warning");
          }
          return { ...prev, currentPosition: pos, isOffRoute: true };
        }

        // Check arrival
        const dest = polyline[polyline.length - 1];
        if (dest && haversineMeters(pos, dest) < ARRIVAL_THRESHOLD_M) {
          speak(getLocalizedPhrase("arrived"), "critical");
          return {
            ...prev,
            status: "arrived" as NavStatus,
            currentPosition: pos,
            isOffRoute: false,
            distanceToNextStep: 0,
          };
        }

        // Step advancement
        let nextIdx = currentStepIndex;
        if (nextIdx < steps.length - 1) {
          // Approximate step endpoint from polyline segments
          const stepEndFraction = (nextIdx + 1) / steps.length;
          const stepEndPolyIdx = Math.min(
            Math.floor(stepEndFraction * polyline.length),
            polyline.length - 1,
          );
          const stepEnd = polyline[stepEndPolyIdx];

          if (
            stepEnd &&
            haversineMeters(pos, stepEnd) < STEP_ADVANCE_THRESHOLD_M
          ) {
            nextIdx++;
            announceStep(steps, nextIdx);
          }
        }

        // Compute distance to next step end
        const nextFraction = (nextIdx + 1) / steps.length;
        const nextPolyIdx = Math.min(
          Math.floor(nextFraction * polyline.length),
          polyline.length - 1,
        );
        const nextEnd = polyline[nextPolyIdx];
        const distToNext = nextEnd ? haversineMeters(pos, nextEnd) : null;

        return {
          ...prev,
          currentPosition: pos,
          currentStepIndex: nextIdx,
          distanceToNextStep: distToNext,
          isOffRoute: false,
        };
      });
    },
    [speak, announceStep],
  );

  const startLocationWatch = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: "Location permission denied",
      }));
      return;
    }

    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_UPDATE_INTERVAL_MS,
        distanceInterval: 5,
      },
      (loc) => {
        handleLocationUpdate({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      },
    );
  }, [handleLocationUpdate]);

  const reroute = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "rerouting" }));
    speak(getLocalizedPhrase("rerouting"), "warning");

    try {
      const currentPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const from: LatLng = {
        latitude: currentPos.coords.latitude,
        longitude: currentPos.coords.longitude,
      };

      if (!destination) throw new Error("No destination");

      const newRoute = await getRouteGuidance(
        from,
        destination,
        "Kasalukuyang lokasyon",
        destinationLabel,
      );

      setState((prev) => ({
        ...prev,
        status: "active",
        route: newRoute,
        currentStepIndex: 0,
        currentPosition: from,
        etaText: newRoute.durationText,
        isOffRoute: false,
        errorMessage: null,
      }));

      // Announce first step immediately, then enqueue Gemini reroute context
      announceStep(newRoute.steps, 0);
      void getRouteVerbalContext(
        destinationLabel,
        newRoute.distanceText,
        newRoute.durationText,
        "reroute",
      ).then((ctx) => speak(ctx.phrase, "warning"));
    } catch {
      const cached = await getCachedRoute();
      if (cached) {
        setState((prev) => ({
          ...prev,
          status: "active",
          route: cached,
          currentStepIndex: 0,
          isOffRoute: false,
          etaText: cached.durationText,
          errorMessage: "Using cached route",
        }));
      } else {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: "Hindi makuha ang ruta. Subukan muli.",
        }));
      }
    }
  }, [destination, destinationLabel, speak, announceStep]);

  // Auto-reroute when off-route persists
  useEffect(() => {
    if (state.isOffRoute && state.status === "active") {
      rerouteTimeoutRef.current = setTimeout(() => {
        void reroute();
      }, 5000);
      return () => {
        if (rerouteTimeoutRef.current) clearTimeout(rerouteTimeoutRef.current);
      };
    }
  }, [state.isOffRoute, state.status, reroute]);

  const start = useCallback(async () => {
    if (!destination) {
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: "No destination set",
      }));
      return;
    }

    activeRef.current = true;
    setState((prev) => ({ ...prev, status: "loading" }));

    try {
      const currentPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const from: LatLng = {
        latitude: currentPos.coords.latitude,
        longitude: currentPos.coords.longitude,
      };

      let route: RouteResult;
      try {
        route = await getRouteGuidance(
          from,
          destination,
          "Kasalukuyang lokasyon",
          destinationLabel,
        );
      } catch {
        const cached = await getCachedRoute();
        if (!cached) throw new Error("No route available");
        route = cached;
      }

      setState((prev) => ({
        ...prev,
        status: "active",
        route,
        currentStepIndex: 0,
        currentPosition: from,
        etaText: route.durationText,
        errorMessage: null,
        isOffRoute: false,
      }));

      // Announce first step immediately, then enqueue Gemini trip-start context
      announceStep(route.steps, 0);
      void getRouteVerbalContext(
        destinationLabel,
        route.distanceText,
        route.durationText,
        "start",
      ).then((ctx) => speak(ctx.phrase, "normal"));

      await startLocationWatch();
    } catch {
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: "Hindi makapagsimula ng navigation.",
      }));
    }
  }, [destination, destinationLabel, speak, announceStep, startLocationWatch]);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, status: "paused" }));
    locationSubRef.current?.remove();
    locationSubRef.current = null;
  }, []);

  const resume = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "active" }));
    await startLocationWatch();
  }, [startLocationWatch]);

  const stop = useCallback(() => {
    activeRef.current = false;
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    stopSpeaking();
    clearVoiceQueue();
    if (rerouteTimeoutRef.current) clearTimeout(rerouteTimeoutRef.current);
    setState({
      status: "idle",
      route: null,
      currentStepIndex: 0,
      currentPosition: null,
      distanceToNextStep: null,
      etaText: null,
      errorMessage: null,
      isMuted: false,
      isOffRoute: false,
    });
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      if (!prev.isMuted) {
        stopSpeaking();
      }
      return { ...prev, isMuted: !prev.isMuted };
    });
  }, []);

  const repeatCurrentStep = useCallback(() => {
    const { route, currentStepIndex } = state;
    if (route) {
      announceStep(route.steps, currentStepIndex);
    }
  }, [state, announceStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      locationSubRef.current?.remove();
      stopSpeaking();
      clearVoiceQueue();
      if (rerouteTimeoutRef.current) clearTimeout(rerouteTimeoutRef.current);
    };
  }, []);

  return {
    ...state,
    start,
    pause,
    resume,
    stop,
    reroute,
    toggleMute,
    repeatCurrentStep,
  };
}

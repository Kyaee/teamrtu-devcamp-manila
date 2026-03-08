import { useCallback, useEffect, useState } from "react";

import type { Severity } from "@/src/design/tokens";
import type { WeatherData } from "@/src/types/weather";

import { readJson, writeJson } from "@/src/features/offline/storage";
import { getWeatherData } from "@/src/services/weather";
import { deriveFloodSignal } from "@/src/services/weather-signal";

const POLL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_KEY = "agos:weather-data";
const OVERRIDE_KEY = "agos:signal-override";

const SEVERITY_RANK: Record<Severity, number> = {
  MONITOR: 0,
  PREPARE: 1,
  LEAVE: 2,
  EVACUATE: 3,
};

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function useWeatherSignal(
  lat?: number,
  lng?: number,
  alertSeverity?: Severity,
) {
  const [weatherSignal, setWeatherSignal] = useState<Severity>("MONITOR");
  const [override, setOverride] = useState<Severity | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore persisted signal override on mount
  useEffect(() => {
    void readJson<Severity | null>(OVERRIDE_KEY, null).then((saved) => {
      if (saved) setOverride(saved);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      const cached = await readJson<WeatherData | null>(CACHE_KEY, null);
      if (!cancelled && cached) {
        setWeather(cached);
        setWeatherSignal(deriveFloodSignal(cached.current, cached.forecast));
        setLoading(false);
      }

      if (!lat || !lng) {
        setLoading(false);
        return;
      }

      try {
        const data = await getWeatherData(lat, lng);
        if (!cancelled) {
          setWeather(data);
          setWeatherSignal(deriveFloodSignal(data.current, data.forecast));
          if (data.current || data.forecast.length > 0) {
            await writeJson(CACHE_KEY, data);
          }
        }
      } catch {
        // keep cached data on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchWeather();

    const interval = setInterval(() => {
      void fetchWeather();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lat, lng]);

  const effectiveSignal: Severity = override
    ? override
    : alertSeverity
      ? maxSeverity(weatherSignal, alertSeverity)
      : weatherSignal;

  const setSignalOverride = useCallback((s: Severity | null) => {
    setOverride(s);
    void writeJson(OVERRIDE_KEY, s);
  }, []);

  return {
    signal: effectiveSignal,
    weather,
    loading,
    signalOverride: override,
    setSignalOverride,
  };
}

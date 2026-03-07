import { useEffect, useState } from "react";

import type { Severity } from "@/src/design/tokens";
import type { WeatherData } from "@/src/types/weather";

import { readJson, writeJson } from "@/src/features/offline/storage";
import { getWeatherData } from "@/src/services/weather";
import { deriveFloodSignal } from "@/src/services/weather-signal";

const POLL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_KEY = "agos:weather-data";

export function useWeatherSignal(lat?: number, lng?: number) {
  const [signal, setSignal] = useState<Severity>("MONITOR");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      const cached = await readJson<WeatherData | null>(CACHE_KEY, null);
      if (!cancelled && cached) {
        setWeather(cached);
        setSignal(deriveFloodSignal(cached.current, cached.forecast));
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
          setSignal(deriveFloodSignal(data.current, data.forecast));
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

  return { signal, weather, loading };
}

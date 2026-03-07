import axios from "axios";

import type { Severity } from "@/src/design/tokens";
import type {
  CurrentConditionsResponse,
  HourlyForecastEntry,
  HourlyForecastResponse,
  WeatherData,
} from "@/src/types/weather";

import { deriveFloodSignal } from "./weather-signal";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const BASE = "https://weather.googleapis.com/v1";

export async function getCurrentConditions(
  lat: number,
  lng: number,
): Promise<CurrentConditionsResponse> {
  const { data } = await axios.get<CurrentConditionsResponse>(
    `${BASE}/currentConditions:lookup`,
    {
      params: {
        key: API_KEY,
        "location.latitude": lat,
        "location.longitude": lng,
      },
    },
  );
  return data;
}

export async function getHourlyForecast(
  lat: number,
  lng: number,
  hours = 24,
): Promise<HourlyForecastEntry[]> {
  const { data } = await axios.get<HourlyForecastResponse>(
    `${BASE}/forecast.hours:lookup`,
    {
      params: {
        key: API_KEY,
        "location.latitude": lat,
        "location.longitude": lng,
        hours,
      },
    },
  );
  return data.forecastHours ?? [];
}

export async function getWeatherData(
  lat: number,
  lng: number,
): Promise<WeatherData> {
  const [current, forecast] = await Promise.all([
    getCurrentConditions(lat, lng).catch(() => null),
    getHourlyForecast(lat, lng, 24).catch(() => []),
  ]);
  return { current, forecast, fetchedAt: new Date().toISOString() };
}

export async function getBarangayFloodSignal(
  _barangay: string,
  lat = 14.6308,
  lng = 121.1023,
): Promise<Severity> {
  try {
    const weather = await getWeatherData(lat, lng);
    return deriveFloodSignal(weather.current, weather.forecast);
  } catch {
    return "MONITOR";
  }
}

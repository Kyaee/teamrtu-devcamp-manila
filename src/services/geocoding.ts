import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const CACHE_PREFIX = "agos:geocode:";

type LatLng = { lat: number; lng: number };

const METRO_MANILA_CENTROIDS: Record<string, LatLng> = {
  manila: { lat: 14.5995, lng: 120.9842 },
  "quezon city": { lat: 14.676, lng: 121.0437 },
  caloocan: { lat: 14.65, lng: 120.9667 },
  "las piñas": { lat: 14.4445, lng: 120.9939 },
  makati: { lat: 14.5547, lng: 121.0244 },
  malabon: { lat: 14.6625, lng: 120.9567 },
  mandaluyong: { lat: 14.5794, lng: 121.0359 },
  marikina: { lat: 14.6507, lng: 121.1029 },
  muntinlupa: { lat: 14.4081, lng: 121.0415 },
  navotas: { lat: 14.6667, lng: 120.9417 },
  parañaque: { lat: 14.4793, lng: 121.0198 },
  pasay: { lat: 14.5378, lng: 121.0014 },
  pasig: { lat: 14.5764, lng: 121.0851 },
  pateros: { lat: 14.5416, lng: 121.0691 },
  "san juan": { lat: 14.6019, lng: 121.0355 },
  taguig: { lat: 14.5176, lng: 121.0509 },
  valenzuela: { lat: 14.6942, lng: 120.9711 },
};

function normalizeCity(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/city$/i, "")
    .trim();
}

export function getCityCentroid(city: string): LatLng | null {
  const key = normalizeCity(city);
  return METRO_MANILA_CENTROIDS[key] ?? null;
}

async function readCache(key: string): Promise<LatLng | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as LatLng;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: LatLng): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // non-critical
  }
}

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!API_KEY) return null;

  const cacheKey = address.toLowerCase().replace(/\s+/g, "_");
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: { address, key: API_KEY, components: "country:PH" },
        timeout: 10_000,
      },
    );

    if (data.status !== "OK" || !data.results?.[0]?.geometry?.location) {
      return null;
    }

    const loc = data.results[0].geometry.location;
    const result: LatLng = { lat: loc.lat, lng: loc.lng };
    await writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function geocodeBarangayCity(
  barangay: string,
  city: string,
): Promise<LatLng | null> {
  const full = await geocodeAddress(
    `Barangay ${barangay}, ${city}, Metro Manila, Philippines`,
  );
  if (full) return full;

  return geocodeAddress(`${city}, Metro Manila, Philippines`);
}

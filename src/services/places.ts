import axios from "axios";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

export type PlacesErrorReason =
  | "NO_API_KEY"
  | "NETWORK_ERROR"
  | "API_ERROR"
  | "ZERO_RESULTS";

export class PlacesServiceError extends Error {
  reason: PlacesErrorReason;
  constructor(reason: PlacesErrorReason, message: string) {
    super(message);
    this.name = "PlacesServiceError";
    this.reason = reason;
  }
}

export type PlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
};

export type PlaceLocation = {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
};

export type ShelterType = "school" | "hospital" | "shopping_mall";

export type NearbyPlace = {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  shelterType: ShelterType;
};

export async function autocomplete(
  input: string,
  lat?: number,
  lng?: number,
): Promise<PlacePrediction[]> {
  if (!API_KEY) return [];
  if (input.length < 2) return [];

  try {
    const params: Record<string, string | number> = {
      input,
      key: API_KEY,
      components: "country:ph",
    };
    if (lat != null && lng != null) {
      params.location = `${lat},${lng}`;
      params.radius = 20000;
    }

    const { data } = await axios.get(`${PLACES_BASE}/autocomplete/json`, {
      params,
      timeout: 10000,
    });

    if (data.status === "ZERO_RESULTS") return [];
    if (data.status !== "OK") {
      throw new PlacesServiceError(
        "API_ERROR",
        `Autocomplete API returned ${data.status}: ${data.error_message ?? "unknown"}`,
      );
    }

    return (data.predictions ?? []).map(
      (p: {
        place_id: string;
        description: string;
        structured_formatting: { main_text: string };
      }) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting.main_text,
      }),
    );
  } catch (err) {
    if (err instanceof PlacesServiceError) throw err;
    throw new PlacesServiceError("NETWORK_ERROR", "Cannot reach Places API");
  }
}

export async function getPlaceLocation(
  placeId: string,
): Promise<PlaceLocation | null> {
  if (!API_KEY) {
    throw new PlacesServiceError(
      "NO_API_KEY",
      "Google Maps API key is not configured",
    );
  }

  try {
    const { data } = await axios.get(`${PLACES_BASE}/details/json`, {
      params: {
        place_id: placeId,
        fields: "geometry,name,formatted_address",
        key: API_KEY,
      },
      timeout: 10000,
    });

    if (data.status !== "OK" || !data.result?.geometry?.location) {
      throw new PlacesServiceError(
        "API_ERROR",
        `Place details API returned ${data.status}`,
      );
    }

    const loc = data.result.geometry.location;
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      name: data.result.name ?? "",
      address: data.result.formatted_address ?? "",
    };
  } catch (err) {
    if (err instanceof PlacesServiceError) throw err;
    throw new PlacesServiceError("NETWORK_ERROR", "Cannot reach Places API");
  }
}

export async function searchNearbyShelters(
  lat: number,
  lng: number,
  radiusM = 5000,
): Promise<NearbyPlace[]> {
  if (!API_KEY) return [];

  const types: ShelterType[] = ["school", "hospital", "shopping_mall"];
  const results: NearbyPlace[] = [];

  // Fetch sequentially to avoid parallel network errors on mobile
  for (const type of types) {
    try {
      const { data } = await axios.get(`${PLACES_BASE}/nearbysearch/json`, {
        params: {
          location: `${lat},${lng}`,
          radius: radiusM,
          type,
          key: API_KEY,
        },
        timeout: 10000,
      });

      if (data.status !== "OK") {
        console.warn(`[Places] ${type} search status: ${data.status}`);
        continue;
      }

      for (const place of data.results ?? []) {
        if (!place.geometry?.location) continue;
        results.push({
          placeId: place.place_id,
          name: place.name,
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          shelterType: type,
        });
      }
    } catch (err: any) {
      console.warn(`[Places] ${type} search failed:`, err?.message ?? err);
      // degrade gracefully per type
    }
  }

  return results;
}

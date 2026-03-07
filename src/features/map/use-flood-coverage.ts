import { useMemo } from "react";

import { getCityCentroid } from "@/src/services/geocoding";

import {
  findBoundaryByCity,
  type CityBoundary,
} from "./data/metro-manila-boundaries";

export type HazardLevel = "Low" | "Medium" | "MediumHigh" | "High";

export type FloodCoverageEntry = {
  city: string;
  hazardLevel: HazardLevel;
  stormSurge: string;
  landslide: string;
  areaKm2: number;
  riverBasin: string;
  notes: string;
  lat: number;
  lng: number;
};

export type FloodZone = {
  id: string;
  city: string;
  hazardLevel: HazardLevel;
  fillColor: string;
  strokeColor: string;
  coordinates: { latitude: number; longitude: number }[];
  center: { latitude: number; longitude: number };
  description: string;
};

const HAZARD_COLORS: Record<HazardLevel, string> = {
  Low: "#22C55E",
  Medium: "#EAB308",
  MediumHigh: "#F97316",
  High: "#EF4444",
};

const HAZARD_FILL_COLORS: Record<HazardLevel, string> = {
  Low: "rgba(34,197,94,0.22)",
  Medium: "rgba(234,179,8,0.22)",
  MediumHigh: "rgba(249,115,22,0.25)",
  High: "rgba(239,68,68,0.28)",
};

const HAZARD_LABELS: Record<HazardLevel, string> = {
  Low: "Low",
  Medium: "Medium",
  MediumHigh: "Medium-High",
  High: "High",
};

function normalizeHazard(raw: string): HazardLevel {
  const s = raw.trim().replace(/[\s-]+/g, "");
  if (/^high$/i.test(s)) return "High";
  if (/^mediumhigh$/i.test(s)) return "MediumHigh";
  if (/^medium$/i.test(s)) return "Medium";
  return "Low";
}

function parseArea(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const RAW_DATA: {
  city: string;
  hazard: string;
  surge: string;
  landslide: string;
  area: string;
  basin: string;
  notes: string;
}[] = [
  {
    city: "Manila",
    hazard: "High",
    surge: "High",
    landslide: "Low",
    area: "38.55",
    basin: "Pasig River / Manila Bay",
    notes: "Highly urbanised; severe flood risk",
  },
  {
    city: "Quezon City",
    hazard: "MediumHigh",
    surge: "Low",
    landslide: "Medium",
    area: "161.11",
    basin: "Tullahan River / Marikina River",
    notes: "Largest NCR city; varied topography",
  },
  {
    city: "Caloocan",
    hazard: "High",
    surge: "Medium",
    landslide: "Low",
    area: "53.33",
    basin: "Tullahan River",
    notes: "Large low-lying northern areas",
  },
  {
    city: "Las Piñas",
    hazard: "High",
    surge: "High",
    landslide: "Low",
    area: "32.69",
    basin: "Las Piñas River / Manila Bay",
    notes: "Coastal; high storm surge exposure",
  },
  {
    city: "Makati",
    hazard: "Medium",
    surge: "Low",
    landslide: "Low",
    area: "27.36",
    basin: "Pasig River tributaries",
    notes: "Central business district; mid hazard",
  },
  {
    city: "Malabon",
    hazard: "High",
    surge: "High",
    landslide: "Low",
    area: "15.96",
    basin: "Tullahan River / Manila Bay",
    notes: "Chronically flooded; lowest elevation",
  },
  {
    city: "Mandaluyong",
    hazard: "Medium",
    surge: "Low",
    landslide: "Low",
    area: "25.99",
    basin: "Pasig River",
    notes: "Bounded by Pasig River",
  },
  {
    city: "Marikina",
    hazard: "High",
    surge: "Low",
    landslide: "Low",
    area: "21.52",
    basin: "Marikina River",
    notes: "Marikina River highly flood-prone",
  },
  {
    city: "Muntinlupa",
    hazard: "Medium",
    surge: "Medium",
    landslide: "Medium",
    area: "39.75",
    basin: "Laguna de Bay",
    notes: "Highest flood-risk coverage gap",
  },
  {
    city: "Navotas",
    hazard: "High",
    surge: "High",
    landslide: "Low",
    area: "8.95",
    basin: "Manila Bay / Navotas River",
    notes: "Lowest elevation; severe coastal risk",
  },
  {
    city: "Parañaque",
    hazard: "High",
    surge: "High",
    landslide: "Low",
    area: "47.69",
    basin: "Las Piñas–Parañaque River / Manila Bay",
    notes: "Stalled Parañaque spillway project",
  },
  {
    city: "Pasay",
    hazard: "High",
    surge: "High",
    landslide: "Low",
    area: "13.97",
    basin: "Manila Bay",
    notes: "Coastal; airport zone",
  },
  {
    city: "Pasig",
    hazard: "High",
    surge: "Low",
    landslide: "Low",
    area: "31",
    basin: "Pasig River / San Juan River",
    notes: "Marikina/Pasig watershed",
  },
  {
    city: "Pateros",
    hazard: "Medium",
    surge: "Low",
    landslide: "Low",
    area: "1.8",
    basin: "Patero-Taguig River",
    notes: "Smallest NCR city",
  },
  {
    city: "San Juan",
    hazard: "Medium",
    surge: "Low",
    landslide: "Low",
    area: "5.94",
    basin: "San Juan River",
    notes: "Bounded by San Juan River",
  },
  {
    city: "Taguig",
    hazard: "MediumHigh",
    surge: "Medium",
    landslide: "Low",
    area: "53.67",
    basin: "Laguna de Bay / Taguig River",
    notes: "BGC elevated; southern barangays lower",
  },
  {
    city: "Valenzuela",
    hazard: "High",
    surge: "Medium",
    landslide: "Low",
    area: "47.09",
    basin: "Tullahan River",
    notes: "Industrial area; frequent flooding",
  },
];

function buildEntries(): FloodCoverageEntry[] {
  const entries: FloodCoverageEntry[] = [];
  for (const r of RAW_DATA) {
    const centroid = getCityCentroid(r.city);
    if (!centroid) continue;
    entries.push({
      city: r.city,
      hazardLevel: normalizeHazard(r.hazard),
      stormSurge: r.surge,
      landslide: r.landslide,
      areaKm2: parseArea(r.area),
      riverBasin: r.basin,
      notes: r.notes,
      lat: centroid.lat,
      lng: centroid.lng,
    });
  }
  return entries;
}

let _cachedEntries: FloodCoverageEntry[] | null = null;

function getEntries(): FloodCoverageEntry[] {
  if (!_cachedEntries) _cachedEntries = buildEntries();
  return _cachedEntries;
}

function buildZones(entries: FloodCoverageEntry[]): FloodZone[] {
  const zones: FloodZone[] = [];
  for (const e of entries) {
    const boundary: CityBoundary | undefined = findBoundaryByCity(e.city);
    if (!boundary) continue;
    zones.push({
      id: `zone-${e.city}`,
      city: e.city,
      hazardLevel: e.hazardLevel,
      fillColor: HAZARD_FILL_COLORS[e.hazardLevel],
      strokeColor: HAZARD_COLORS[e.hazardLevel],
      coordinates: boundary.coordinates,
      center: boundary.center,
      description: `Flood: ${HAZARD_LABELS[e.hazardLevel]} · Surge: ${e.stormSurge} · ${e.areaKm2} km²`,
    });
  }
  return zones;
}

export function useFloodCoverage(): {
  entries: FloodCoverageEntry[];
  zones: FloodZone[];
} {
  const entries = getEntries();
  const zones: FloodZone[] = useMemo(() => buildZones(entries), [entries]);
  return { entries, zones };
}

export { HAZARD_COLORS, HAZARD_LABELS };

import type { EvacCenter } from "@/src/types/domain";

/** Seed/fallback data — used only when Supabase is unreachable and no cache exists */
export const evacCenters: EvacCenter[] = [
  {
    id: "center-1",
    name: "Marikina Elementary School Shelter",
    barangay: "Concepcion Dos",
    address: "Bayan-Bayanan Avenue, Marikina",
    lat: 14.6308,
    lng: 121.1023,
    distanceKm: 1.2,
    status: "open",
    uncertaintyNote:
      "Best available route guidance. Conditions can change quickly.",
  },
  {
    id: "center-2",
    name: "Tañong Barangay Hall",
    barangay: "Tañong",
    address: "Gen. Luna Street, Malabon",
    lat: 14.6575,
    lng: 120.9565,
    distanceKm: 2.1,
    status: "limited",
    uncertaintyNote:
      "Capacity can change; verify with barangay staff on arrival.",
  },
];

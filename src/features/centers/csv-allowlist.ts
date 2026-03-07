import type { EvacCenter } from "@/src/types/domain";

/**
 * DSWD-sourced evacuation center names for Metro Manila.
 * Parsed from dataset/dswd_evacuation_centers_metro_manila.csv.
 * Used as an allowlist: only centers whose name fuzzy-matches an entry here
 * will be displayed as map pins.
 */
const CSV_CENTER_NAMES: string[] = [
  "Building 3",
  "Building 18",
  "TCI",
  "Almario Elementary School",
  "Baseco Evacuation Center",
  "Barangay 105 Covered Court",
  "Barangay 101 Covered Court",
  "Marcel Covered Court",
  "Centre Ville Covered Court",
  "Pantranco Chapel",
  "Pingkian I Central Court",
  "Sarmiento Chapel",
  "Annex I Covered Court",
  "Annex 2 Covered Court",
  "Apolonio Samson Elementary School",
  "Sampalukan Elementary",
  "M.B. Asisto High School Main",
  "Bagong Silang Elementary School",
  "Llano Elementary School",
  "Cades",
  "Barangay 177 Evacuation Center",
  "Barangay 178 Evacuation Center",
  "Kalayaan Elementary School",
  "Barangay 164 Evacuation Center",
  "Barangay 160 Evacuation Center",
  "Glorietta Evacuation Center",
  "Pangarap Central Elementary School",
  "MLQU Elementary School",
  "St. Mary Elementary School",
  "Fortune High School",
  "Malanday Elementary School",
  "Kalumpang Elementary School",
  "Marikina Elementary School",
  "Leodegradio Elementary School",
  "Parang Elementary School",
  "Parang High School",
  "SSS National High School",
  "Concepcion Integrated School",
  "Sto. Nino High School",
  "H. Bautista Elementary School",
  "Marikina Heights HD",
  "San Roque Elementary School",
  "Concepcion Elementary School",
  "Tanong High School",
  "Nangka Elementary School",
  "Kap Moy Elementary School",
  "SSS Vill Elementary School",
  "Sto. Nino Elementary School",
  "CIS Elementary School",
  "Marikina Science HE",
  "JDLP High School",
  "Fortune Elementary School",
  "Marikina High School",
  "Barangka Elementary School",
  "Sta. Elena High School",
  "Eusebio Elementary School",
  "Taguig Science",
  "Central Bicutan Covered Court",
  "EM's Elementary School",
  "Gat Andres Bonifacio",
  "Diosdado Macapagal High School",
  "Trade Center",
  "Daanghari Elementary School",
  "Kapitan Eddie T. Reyes Integrated School",
  "Cardones Elementary School",
  "Bagong Tanyag Elementary School Main",
  "Silangan Elementary School",
  "Tenement Elementary School",
  "Bagong Tanyag Elementary School Annex A",
  "Bagong Tanyag Elementary School Annex B",
  "Day Care Center",
  "C.P. Sta. Teresa Elementary School",
  "Taguig Integrated School",
  "Tipas Elementary School Annex",
  "Hagonoy Gym",
  "Katwiran Covered Court",
  "McDo Bahay Bulilit",
  "RP. Cruz Elementary School",
  "Aldana Elementary School",
  "Valenzuela National High School",
  "Barangay Dona Nena Evacuation Center",
  "Cupang Senior High School",
  "Baywalk Covered Court",
  "Alabang Elementary School",
  "Palanyag Gym",
  "Cayetano Science High School",
  "Ususan Elementary School",
];

const normalizedAllowlist = new Set(
  CSV_CENTER_NAMES.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "")),
);

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isAllowlistedCenter(center: EvacCenter): boolean {
  const key = normalize(center.name);
  if (normalizedAllowlist.has(key)) return true;
  for (const allowed of normalizedAllowlist) {
    if (key.includes(allowed) || allowed.includes(key)) return true;
  }
  return false;
}

export function filterCentersByAllowlist(centers: EvacCenter[]): EvacCenter[] {
  return centers.filter(isAllowlistedCenter);
}

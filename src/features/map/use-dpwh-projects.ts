import { useCallback, useEffect, useMemo, useState } from "react";

import { geocodeBarangayCity } from "@/src/services/geocoding";
import type { MapMarker } from "./MapDisplay";

export type DpwhProject = {
  contractId: string;
  name: string;
  city: string;
  barangay: string;
  costPhp: string;
  status: "On-Going" | "Completed" | string;
  fundSource: string;
  completionDate: string;
  cocStatus: string;
  inspectionFinding: string;
  implementingOffice: string;
  notes: string;
  lat: number;
  lng: number;
};

const STATUS_COLORS: Record<string, string> = {
  "On-Going": "#3B82F6",
  Completed: "#6B7280",
};

function dpwhColor(status: string): string {
  return STATUS_COLORS[status] ?? "#8B5CF6";
}

const RAW_PROJECTS: {
  id: string;
  name: string;
  city: string;
  barangay: string;
  cost: string;
  status: string;
  fund: string;
  date: string;
  coc: string;
  finding: string;
  office: string;
  notes: string;
}[] = [
  {
    id: "25OF0016",
    name: "Construction of Flood Control Structure - La Mesa Ecopark Phase 2",
    city: "Quezon City",
    barangay: "La Mesa Ecopark",
    cost: "48,513,518",
    status: "On-Going",
    fund: "GAA 2025",
    date: "",
    coc: "Approved",
    finding: "Verified on-going",
    office: "DPWH-QC 1st DEO",
    notes: "One of only 2 projects with approved COC",
  },
  {
    id: "25OF0017",
    name: "Construction of Flood Control Structure - Tullahan River, Nagkaisang Nayon",
    city: "Quezon City",
    barangay: "Nagkaisang Nayon",
    cost: "48,480,365",
    status: "On-Going",
    fund: "GAA 2025",
    date: "",
    coc: "No Objection Letter",
    finding: "Verified on-going",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "24OF0180",
    name: "Construction of Matalahib Creek Pumping Station",
    city: "Quezon City",
    barangay: "Matalahib",
    cost: "95,998,547",
    status: "On-Going",
    fund: "GAA 2024",
    date: "",
    coc: "Disapproved",
    finding: "Built directly on waterway — obstructs flow",
    office: "DPWH-QC 1st DEO",
    notes: "COA flagged",
  },
  {
    id: "24O00219",
    name: "Construction of Mariblo Pumping Station Phase 1",
    city: "Quezon City",
    barangay: "Mariblo",
    cost: "282,850,772",
    status: "On-Going",
    fund: "GAA 2024",
    date: "",
    coc: "Disapproved",
    finding: "Built directly on waterway — obstructs flow",
    office: "DPWH-QC 1st DEO",
    notes: "₱282M disapproved COC",
  },
  {
    id: "24O00220",
    name: "Construction of Sta. Cruz Pumping Station Phase 1",
    city: "Quezon City",
    barangay: "Sta. Cruz",
    cost: "282,847,635",
    status: "On-Going",
    fund: "GAA 2024",
    date: "",
    coc: "Disapproved",
    finding: "Disapproved COC",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "23GZ00058",
    name: "Metro Manila Flood Mgmt Project Ph.1 - Doña Imelda Pumping Station",
    city: "Quezon City",
    barangay: "Doña Imelda",
    cost: "568,903,699",
    status: "On-Going",
    fund: "Foreign Funded",
    date: "",
    coc: "None",
    finding: "Verified on-going",
    office: "DPWH-UPMO",
    notes: "World Bank / AIIB co-financed",
  },
  {
    id: "25OF0147",
    name: "Rehabilitation of Handel St to Liszt St, Commonwealth",
    city: "Quezon City",
    barangay: "Commonwealth",
    cost: "97,019,806",
    status: "On-Going",
    fund: "GAA 2025",
    date: "",
    coc: "None",
    finding: "Verified on-going",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "22OF0075",
    name: "Rehabilitation of Flood Control Structure - Brgy. Gulod",
    city: "Quezon City",
    barangay: "Gulod",
    cost: "73,477,621",
    status: "Completed",
    fund: "GAA 2022",
    date: "",
    coc: "None",
    finding: "Verified complete; debris on site",
    office: "DPWH-QC 1st DEO",
    notes: "Construction debris = QC ordinance violation",
  },
  {
    id: "24OF0069",
    name: "Construction of Drainage Systems at Veterans - Brgy. Pasong Tamo",
    city: "Quezon City",
    barangay: "Pasong Tamo",
    cost: "19,403,851",
    status: "Completed",
    fund: "GAA 2024",
    date: "",
    coc: "None",
    finding: "Verified complete",
    office: "DPWH-QC 2nd DEO",
    notes: "",
  },
  {
    id: "24OF0019",
    name: "Construction of Flood Control - Tullahan River, Bagong Tulay, Gulod",
    city: "Quezon City",
    barangay: "Gulod",
    cost: "48,999,897",
    status: "Completed",
    fund: "GAA 2024",
    date: "2024-11-18",
    coc: "None",
    finding: "Declared complete; works still ongoing on inspection",
    office: "DPWH-QC 1st DEO",
    notes: "Anomalous completion declaration",
  },
  {
    id: "23OF0056",
    name: "Construction of Flood Control - Pasong Tamo Creek",
    city: "Quezon City",
    barangay: "Pasong Tamo",
    cost: "48,998,190",
    status: "Completed",
    fund: "GAA 2023",
    date: "2023-10-18",
    coc: "None",
    finding:
      "Declared complete; works still ongoing; built in front of existing wall",
    office: "DPWH-QC 2nd DEO",
    notes: "Reduces waterway width",
  },
  {
    id: "24OF0126",
    name: "Construction of Flood Control - Marikina River, Bagong Silangan",
    city: "Quezon City",
    barangay: "Bagong Silangan",
    cost: "95,341,600",
    status: "Completed",
    fund: "GAA 2024",
    date: "2025-03-11",
    coc: "None",
    finding: "Declared complete; works still ongoing",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "23OF0036",
    name: "Construction of Slope Protection - Marikina River, Bagong Silangan",
    city: "Quezon City",
    barangay: "Bagong Silangan",
    cost: "42,762,228",
    status: "Completed",
    fund: "GAA 2023",
    date: "2024-03-31",
    coc: "None",
    finding: "Declared complete; works still ongoing",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "23OF0025",
    name: "Construction of Flood Mitigation - Marikina River, Batasan Hills",
    city: "Quezon City",
    barangay: "Batasan Hills",
    cost: "96,499,650",
    status: "Completed",
    fund: "GAA 2023",
    date: "2023-12-18",
    coc: "None",
    finding: "Declared complete; works still ongoing",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "23OF0062",
    name: "Construction of Flood Mitigation - Marikina River, Bagong Silangan",
    city: "Quezon City",
    barangay: "Bagong Silangan",
    cost: "96,499,630",
    status: "Completed",
    fund: "GAA 2023",
    date: "2023-12-19",
    coc: "None",
    finding: "Declared complete; works still ongoing",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "23OF0053",
    name: "Construction of Flood Control Structure - Brgy. New Era",
    city: "Quezon City",
    barangay: "New Era",
    cost: "35,972,605",
    status: "Completed",
    fund: "GAA 2023",
    date: "",
    coc: "None",
    finding: "LOCATION ERROR — coordinates point to Brgy Apolonio Samson",
    office: "DPWH-QC 1st DEO",
    notes: "Cannot be found on ground",
  },
  {
    id: "22OF0060",
    name: "Construction of Flood Control Structure - Brgy. Pasong Tamo",
    city: "Quezon City",
    barangay: "Pasong Tamo",
    cost: "14,259,000",
    status: "Completed",
    fund: "GAA 2022",
    date: "",
    coc: "None",
    finding: "LOCATION ERROR — coordinates point to Brgy Culiat",
    office: "DPWH-QC 2nd DEO",
    notes: "Cannot be found on ground",
  },
  {
    id: "24OF0263",
    name: "Construction of Flood Structure - Brgy. Bagong Silangan",
    city: "Quezon City",
    barangay: "Bagong Silangan",
    cost: "143,287,903",
    status: "On-Going",
    fund: "GAA 2024",
    date: "",
    coc: "None",
    finding: "Slope protection built in front of existing wall",
    office: "DPWH-QC 1st DEO",
    notes: "Reduces waterway width",
  },
  {
    id: "24OF0141",
    name: "Construction of Drainage Systems - Brgy. Apolonio Samson",
    city: "Quezon City",
    barangay: "Apolonio Samson",
    cost: "77,199,937",
    status: "Completed",
    fund: "GAA 2024",
    date: "",
    coc: "None",
    finding: "Built in front of wall; debris on site",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "23OF0022",
    name: "Construction of Flood Control - Culiat Creek, Project 6",
    city: "Quezon City",
    barangay: "Project 6",
    cost: "48,022,320",
    status: "Completed",
    fund: "GAA 2023",
    date: "",
    coc: "None",
    finding: "Slope protection built in front of existing wall",
    office: "DPWH-QC 2nd DEO",
    notes: "",
  },
  {
    id: "24OF0134",
    name: "Construction of Flood Control - Tullahan River, Brgy. Bagbag",
    city: "Quezon City",
    barangay: "Bagbag",
    cost: "95,505,768",
    status: "Completed",
    fund: "GAA 2024",
    date: "",
    coc: "None",
    finding: "Debris on site",
    office: "DPWH-QC 1st DEO",
    notes: "",
  },
  {
    id: "24OG0021",
    name: "Rehabilitation of Marikina River Tributary Phase 2 - Acropolis",
    city: "Quezon City",
    barangay: "Acropolis",
    cost: "48,999,387",
    status: "Completed",
    fund: "GAA 2024",
    date: "",
    coc: "None",
    finding: "Debris on site; retaining wall collapsed",
    office: "DPWH-QC 1st DEO",
    notes: "Structural failure",
  },
];

export function useDpwhProjects(): {
  projects: DpwhProject[];
  markers: MapMarker[];
  loading: boolean;
  getProjectById: (id: string) => DpwhProject | undefined;
} {
  const [projects, setProjects] = useState<DpwhProject[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const uniqueLocations = new Map<
      string,
      { barangay: string; city: string }
    >();
    for (const r of RAW_PROJECTS) {
      const key = `${r.barangay}|${r.city}`.toLowerCase();
      if (!uniqueLocations.has(key)) {
        uniqueLocations.set(key, { barangay: r.barangay, city: r.city });
      }
    }

    const locationCoords = new Map<string, { lat: number; lng: number }>();
    const geocodePromises = Array.from(uniqueLocations.entries()).map(
      async ([key, { barangay, city }]) => {
        const result = await geocodeBarangayCity(barangay, city);
        if (result) locationCoords.set(key, result);
      },
    );
    await Promise.all(geocodePromises);

    const resolved: DpwhProject[] = [];
    for (const r of RAW_PROJECTS) {
      const key = `${r.barangay}|${r.city}`.toLowerCase();
      const coords = locationCoords.get(key);
      if (!coords) continue;

      resolved.push({
        contractId: r.id,
        name: r.name,
        city: r.city,
        barangay: r.barangay,
        costPhp: r.cost,
        status: r.status,
        fundSource: r.fund,
        completionDate: r.date,
        cocStatus: r.coc,
        inspectionFinding: r.finding,
        implementingOffice: r.office,
        notes: r.notes,
        lat: coords.lat,
        lng: coords.lng,
      });
    }

    setProjects(resolved);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const markers: MapMarker[] = useMemo(
    () =>
      projects.map((p) => ({
        id: `dpwh-${p.contractId}`,
        latitude: p.lat,
        longitude: p.lng,
        pinColor: dpwhColor(p.status),
        opacity: 1,
        title: p.name,
        description: `${p.status} · ₱${p.costPhp}`,
        category: "dpwh" as const,
      })),
    [projects],
  );

  const getProjectById = useCallback(
    (id: string) => projects.find((p) => `dpwh-${p.contractId}` === id),
    [projects],
  );

  return { projects, markers, loading, getProjectById };
}

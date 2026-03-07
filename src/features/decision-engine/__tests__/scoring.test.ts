import type { RouteResult } from "@/src/services/maps";
import type { EvacCenter, FloodReport } from "@/src/types/domain";
import type { WeatherData } from "@/src/types/weather";

import {
  scoreCenterReadiness,
  scoreFloodReports,
  scoreRouteRisk,
  scoreWeatherRisk,
} from "../scoring";

const makeFloodReport = (
  overrides: Partial<FloodReport> = {},
): FloodReport => ({
  id: "r1",
  lat: 14.63,
  lng: 121.1,
  depth: "ankle",
  status: "pending",
  createdAt: new Date().toISOString(),
  reporterLabel: "Test",
  ...overrides,
});

const makeCenter = (overrides: Partial<EvacCenter> = {}): EvacCenter => ({
  id: "c1",
  name: "Test Center",
  barangay: "Test",
  address: "123 Test St",
  lat: 14.63,
  lng: 121.1,
  distanceKm: 1.0,
  status: "open",
  uncertaintyNote: "Best available",
  ...overrides,
});

describe("scoreWeatherRisk", () => {
  it("returns base score for MONITOR with no weather", () => {
    const { score, reason } = scoreWeatherRisk("MONITOR", null);
    expect(score).toBe(0);
    expect(reason).toContain("MONITOR");
  });

  it("returns higher score for EVACUATE", () => {
    const { score } = scoreWeatherRisk("EVACUATE", null);
    expect(score).toBe(75);
  });

  it("adds QPF bonus with live weather data", () => {
    const weather = {
      current: {
        temperature: { degrees: 30 },
        weatherCondition: { description: { text: "Rain" } },
        precipitation: {
          probability: { percent: 80 },
          qpf: { quantity: 15 },
        },
      },
      forecast: [],
      fetchedAt: new Date().toISOString(),
    } as unknown as WeatherData;

    const { score } = scoreWeatherRisk("LEAVE", weather);
    expect(score).toBeGreaterThan(50);
  });
});

describe("scoreFloodReports", () => {
  it("returns 0 with no nearby reports", () => {
    const { score } = scoreFloodReports(14.63, 121.1, []);
    expect(score).toBe(0);
  });

  it("scores high with 3+ confirmed high-depth reports nearby", () => {
    const reports = [
      makeFloodReport({ id: "r1", depth: "waist", status: "confirmed" }),
      makeFloodReport({ id: "r2", depth: "chest", status: "confirmed" }),
      makeFloodReport({ id: "r3", depth: "waist", status: "confirmed" }),
    ];
    const { score } = scoreFloodReports(14.63, 121.1, reports);
    expect(score).toBe(80);
  });

  it("scores moderate with 1 confirmed high-depth report", () => {
    const reports = [
      makeFloodReport({ id: "r1", depth: "waist", status: "confirmed" }),
    ];
    const { score } = scoreFloodReports(14.63, 121.1, reports);
    expect(score).toBe(50);
  });

  it("ignores reports far away", () => {
    const reports = [
      makeFloodReport({
        id: "r1",
        lat: 15.0,
        lng: 122.0,
        depth: "chest",
        status: "confirmed",
      }),
    ];
    const { score } = scoreFloodReports(14.63, 121.1, reports);
    expect(score).toBe(0);
  });
});

describe("scoreRouteRisk", () => {
  it("returns 50 when no route available", () => {
    const { score } = scoreRouteRisk(null, []);
    expect(score).toBe(50);
  });

  it("returns 0 for a clear route", () => {
    const route: RouteResult = {
      polyline: [
        { latitude: 14.63, longitude: 121.1 },
        { latitude: 14.635, longitude: 121.105 },
      ],
      distanceText: "1 km",
      durationText: "10 min",
      steps: [],
      fetchedAt: new Date().toISOString(),
      fromLabel: "A",
      toLabel: "B",
    };
    const { score } = scoreRouteRisk(route, []);
    expect(score).toBe(0);
  });

  it("scores higher when route passes through high water", () => {
    const route: RouteResult = {
      polyline: [
        { latitude: 14.63, longitude: 121.1 },
        { latitude: 14.631, longitude: 121.101 },
      ],
      distanceText: "0.5 km",
      durationText: "5 min",
      steps: [],
      fetchedAt: new Date().toISOString(),
      fromLabel: "A",
      toLabel: "B",
    };
    const reports = [
      makeFloodReport({
        lat: 14.631,
        lng: 121.101,
        depth: "chest",
        status: "confirmed",
      }),
    ];
    const { score } = scoreRouteRisk(route, reports);
    expect(score).toBeGreaterThan(0);
  });
});

describe("scoreCenterReadiness", () => {
  it("scores lower (better) for open nearby center", () => {
    const center = makeCenter({ status: "open", distanceKm: 0.5 });
    const { score } = scoreCenterReadiness(center);
    expect(score).toBeLessThan(20);
  });

  it("scores higher for limited far center", () => {
    const center = makeCenter({ status: "limited", distanceKm: 5 });
    const { score } = scoreCenterReadiness(center);
    expect(score).toBeGreaterThan(50);
  });
});

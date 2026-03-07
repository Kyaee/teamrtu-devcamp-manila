import type { DrainReport, FloodReport } from "@/src/types/domain";

import {
  annotateCenterRisk,
  evaluateDrainRisk,
  evaluateFloodRisk,
  isTyphoonMode,
} from "../risk-policy";

const now = new Date().toISOString();

const makeFlood = (overrides: Partial<FloodReport> = {}): FloodReport => ({
  id: "f1",
  lat: 14.63,
  lng: 121.1,
  depth: "waist",
  status: "confirmed",
  createdAt: now,
  reporterLabel: "Test",
  ...overrides,
});

const makeDrain = (overrides: Partial<DrainReport> = {}): DrainReport => ({
  id: "d1",
  lat: 14.63,
  lng: 121.1,
  description: "Clogged drain",
  status: "pending",
  createdAt: now,
  ...overrides,
});

describe("isTyphoonMode", () => {
  it("returns false for MONITOR", () => {
    expect(isTyphoonMode("MONITOR")).toBe(false);
  });

  it("returns true for PREPARE", () => {
    expect(isTyphoonMode("PREPARE")).toBe(true);
  });

  it("returns true for LEAVE", () => {
    expect(isTyphoonMode("LEAVE")).toBe(true);
  });

  it("returns true for EVACUATE", () => {
    expect(isTyphoonMode("EVACUATE")).toBe(true);
  });
});

describe("evaluateFloodRisk", () => {
  it("returns no block when no reports exist", () => {
    const result = evaluateFloodRisk(14.63, 121.1, [], true);
    expect(result.blocked).toBe(false);
    expect(result.confirmedHighCount).toBe(0);
  });

  it("blocks when 3+ confirmed high-depth in typhoon mode", () => {
    const reports = [
      makeFlood({ id: "f1" }),
      makeFlood({ id: "f2", depth: "chest" }),
      makeFlood({ id: "f3" }),
    ];
    const result = evaluateFloodRisk(14.63, 121.1, reports, true);
    expect(result.blocked).toBe(true);
    expect(result.confirmedHighCount).toBe(3);
    expect(result.reason).toContain("BLOCKED");
  });

  it("does NOT block same reports when typhoon mode is off", () => {
    const reports = [
      makeFlood({ id: "f1" }),
      makeFlood({ id: "f2", depth: "chest" }),
      makeFlood({ id: "f3" }),
    ];
    const result = evaluateFloodRisk(14.63, 121.1, reports, false);
    expect(result.blocked).toBe(false);
    expect(result.confirmedHighCount).toBe(3);
  });

  it("does NOT block with only 2 confirmed high-depth reports", () => {
    const reports = [
      makeFlood({ id: "f1" }),
      makeFlood({ id: "f2", depth: "chest" }),
    ];
    const result = evaluateFloodRisk(14.63, 121.1, reports, true);
    expect(result.blocked).toBe(false);
    expect(result.confirmedHighCount).toBe(2);
  });

  it("ignores reports outside the proximity radius", () => {
    const reports = [
      makeFlood({ id: "f1", lat: 15.0, lng: 122.0 }),
      makeFlood({ id: "f2", lat: 15.0, lng: 122.0 }),
      makeFlood({ id: "f3", lat: 15.0, lng: 122.0 }),
    ];
    const result = evaluateFloodRisk(14.63, 121.1, reports, true);
    expect(result.blocked).toBe(false);
    expect(result.confirmedHighCount).toBe(0);
  });

  it("ignores stale reports (>24h)", () => {
    const oldDate = new Date(Date.now() - 25 * 3600_000).toISOString();
    const reports = [
      makeFlood({ id: "f1", createdAt: oldDate }),
      makeFlood({ id: "f2", createdAt: oldDate }),
      makeFlood({ id: "f3", createdAt: oldDate }),
    ];
    const result = evaluateFloodRisk(14.63, 121.1, reports, true);
    expect(result.blocked).toBe(false);
  });
});

describe("evaluateDrainRisk", () => {
  it("returns zero penalty with no drain reports", () => {
    const result = evaluateDrainRisk(14.63, 121.1, []);
    expect(result.softPenalty).toBe(0);
    expect(result.nearbyCount).toBe(0);
  });

  it("returns penalty when 3+ drain reports nearby", () => {
    const reports = [
      makeDrain({ id: "d1" }),
      makeDrain({ id: "d2" }),
      makeDrain({ id: "d3" }),
    ];
    const result = evaluateDrainRisk(14.63, 121.1, reports);
    expect(result.softPenalty).toBe(15);
    expect(result.nearbyCount).toBe(3);
    expect(result.reason).toContain("elevated");
  });

  it("returns no penalty below threshold", () => {
    const reports = [makeDrain({ id: "d1" }), makeDrain({ id: "d2" })];
    const result = evaluateDrainRisk(14.63, 121.1, reports);
    expect(result.softPenalty).toBe(0);
    expect(result.nearbyCount).toBe(2);
  });
});

describe("annotateCenterRisk", () => {
  it("returns blocked annotation in typhoon mode with enough flood reports", () => {
    const floods = [
      makeFlood({ id: "f1" }),
      makeFlood({ id: "f2", depth: "chest" }),
      makeFlood({ id: "f3" }),
    ];
    const result = annotateCenterRisk(
      "center-1",
      14.63,
      121.1,
      floods,
      [],
      true,
    );
    expect(result.blocked).toBe(true);
    expect(result.riskScore).toBe(80);
    expect(result.shortReason).toContain("blocked");
  });

  it("returns non-blocked with low risk in MONITOR mode", () => {
    const result = annotateCenterRisk("center-1", 14.63, 121.1, [], [], false);
    expect(result.blocked).toBe(false);
    expect(result.riskScore).toBe(0);
    expect(result.shortReason).toContain("No nearby");
  });

  it("combines flood and drain risk scores", () => {
    const floods = [makeFlood({ id: "f1" })];
    const drains = [
      makeDrain({ id: "d1" }),
      makeDrain({ id: "d2" }),
      makeDrain({ id: "d3" }),
    ];
    const result = annotateCenterRisk(
      "center-1",
      14.63,
      121.1,
      floods,
      drains,
      false,
    );
    expect(result.blocked).toBe(false);
    expect(result.riskScore).toBe(50 + 15); // 1 high-depth + drain penalty
    expect(result.shortReason).toContain("flood");
    expect(result.shortReason).toContain("drain");
  });

  it("fallback: all blocked centers produce empty Gemini centerId", () => {
    const floods = [
      makeFlood({ id: "f1" }),
      makeFlood({ id: "f2", depth: "chest" }),
      makeFlood({ id: "f3" }),
    ];
    const annotation = annotateCenterRisk(
      "only-center",
      14.63,
      121.1,
      floods,
      [],
      true,
    );
    expect(annotation.blocked).toBe(true);
  });
});

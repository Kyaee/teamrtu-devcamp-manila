import {
  bearingDeg,
  closestPointOnPolyline,
  haversineMeters,
} from "../geo-utils";

describe("haversineMeters", () => {
  it("returns 0 for same point", () => {
    const p = { latitude: 14.63, longitude: 121.1 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it("computes reasonable distance for known points", () => {
    // Marikina City Hall to Marikina Sports Center (~1.5km)
    const a = { latitude: 14.6308, longitude: 121.1023 };
    const b = { latitude: 14.6407, longitude: 121.1065 };
    const dist = haversineMeters(a, b);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(2000);
  });

  it("returns large distance for far apart points", () => {
    const manila = { latitude: 14.5995, longitude: 120.9842 };
    const cebu = { latitude: 10.3157, longitude: 123.8854 };
    const dist = haversineMeters(manila, cebu);
    expect(dist).toBeGreaterThan(500_000);
  });
});

describe("bearingDeg", () => {
  it("returns ~0 for due north", () => {
    const from = { latitude: 14.0, longitude: 121.0 };
    const to = { latitude: 15.0, longitude: 121.0 };
    const bearing = bearingDeg(from, to);
    expect(bearing).toBeCloseTo(0, 0);
  });

  it("returns ~90 for due east", () => {
    const from = { latitude: 14.0, longitude: 121.0 };
    const to = { latitude: 14.0, longitude: 122.0 };
    const bearing = bearingDeg(from, to);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it("returns ~180 for due south", () => {
    const from = { latitude: 15.0, longitude: 121.0 };
    const to = { latitude: 14.0, longitude: 121.0 };
    const bearing = bearingDeg(from, to);
    expect(bearing).toBeCloseTo(180, 0);
  });
});

describe("closestPointOnPolyline", () => {
  const polyline = [
    { latitude: 14.63, longitude: 121.1 },
    { latitude: 14.635, longitude: 121.105 },
    { latitude: 14.64, longitude: 121.11 },
  ];

  it("finds closest point on first segment", () => {
    const pos = { latitude: 14.631, longitude: 121.101 };
    const { index, distance } = closestPointOnPolyline(pos, polyline);
    expect(index).toBe(0);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(500);
  });

  it("finds closest point on last segment", () => {
    const pos = { latitude: 14.639, longitude: 121.109 };
    const { index } = closestPointOnPolyline(pos, polyline);
    expect(index).toBe(2);
  });

  it("returns 0 distance for exact match", () => {
    const pos = { latitude: 14.635, longitude: 121.105 };
    const { distance, index } = closestPointOnPolyline(pos, polyline);
    expect(distance).toBe(0);
    expect(index).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import { generateFakePoints } from "./generateFakePoints";

describe("generateFakePoints", () => {
  it("uses uniformly distributed sphere coordinates and unique fake IDs", () => {
    let seed = 123456;
    const random = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const points = Array.from(generateFakePoints(20_000, random));
    expect(new Set(points.map((point) => point.id)).size).toBe(points.length);
    const bands = Array.from({ length: 10 }, () => 0);
    const quadrants = Array.from({ length: 4 }, () => 0);
    for (const point of points) {
      expect(point.id).toMatch(/^fake-/);
      expect(point.lat).toBeGreaterThanOrEqual(-90);
      expect(point.lat).toBeLessThanOrEqual(90);
      expect(point.lon).toBeGreaterThanOrEqual(-180);
      expect(point.lon).toBeLessThanOrEqual(180);
      const z = Math.sin((point.lat * Math.PI) / 180);
      bands[Math.min(9, Math.floor(((z + 1) / 2) * 10))]++;
      quadrants[Math.min(3, Math.floor(((point.lon + 180) / 360) * 4))]++;
    }
    for (const count of bands) expect(count).toBeGreaterThan(1_750);
    for (const count of bands) expect(count).toBeLessThan(2_250);
    for (const count of quadrants) expect(count).toBeGreaterThan(4_600);
    for (const count of quadrants) expect(count).toBeLessThan(5_400);
  });

  it("handles zero and rejects invalid counts", () => {
    expect(Array.from(generateFakePoints(0))).toEqual([]);
    for (const count of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => Array.from(generateFakePoints(count))).toThrow(
        /non-negative safe integer/,
      );
    }
  });

  it("supports equatorial, chunky, and city-centered distributions", () => {
    let seed = 987654;
    const random = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const equator = Array.from(generateFakePoints(2_000, random, "equator"));
    expect(
      equator.filter((point) => Math.abs(point.lat) <= 30).length,
    ).toBeGreaterThan(1_700);

    seed = 987654;
    const chunky = Array.from(generateFakePoints(2_000, random, "chunky"));
    expect(
      new Set(chunky.map((point) => Math.round(point.lat))).size,
    ).toBeLessThan(130);

    seed = 987654;
    const cities = Array.from(generateFakePoints(2_000, random, "cities"));
    expect(
      cities.filter((point) => Math.abs(point.lat) <= 60).length,
    ).toBeGreaterThan(1_700);
    expect(() =>
      Array.from(generateFakePoints(1, random, "invalid" as never)),
    ).toThrow(/Unknown fake data distribution/);
  });
});

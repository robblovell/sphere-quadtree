import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { coastlineSegments } from "./coastlineSegments";

describe("coastlineSegments", () => {
  it("maps longitude and latitude onto the globe and handles the antimeridian", () => {
    const data = {
      features: [
        {
          geometry: {
            coordinates: [
              [0, 0],
              [90, 0],
            ],
            type: "LineString",
          },
        },
        {
          geometry: {
            coordinates: [
              [
                [179, 0],
                [-179, 0],
              ],
            ],
            type: "MultiLineString",
          },
        },
      ],
      type: "FeatureCollection",
    };
    const positions = coastlineSegments(data);
    expect(positions.slice(0, 3)).toEqual([1.012, 0, 0]);
    expect(positions[positions.length - 6]).toBeLessThan(-1);
    expect(positions[positions.length - 3]).toBeLessThan(-1);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(...positions.slice(i, i + 3))).toBeCloseTo(1.012, 10);
    }
  });

  it("loads real global coastlines covering all seven continents", () => {
    const data: unknown = JSON.parse(
      readFileSync("src/visual/ne_110m_coastline.geojson", "utf8"),
    );
    const positions = coastlineSegments(data);
    expect(positions.length).toBeGreaterThan(30_000);
    const hasCoast = (
      south: number,
      west: number,
      north: number,
      east: number,
    ): boolean => {
      for (let i = 0; i < positions.length; i += 3) {
        const [x, y, z] = positions.slice(i, i + 3);
        const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
        const lon = (Math.atan2(y, x) * 180) / Math.PI;
        if (lat >= south && lat <= north && lon >= west && lon <= east)
          return true;
      }
      return false;
    };
    expect(hasCoast(25, -125, 55, -65)).toBe(true);
    expect(hasCoast(-55, -80, 5, -35)).toBe(true);
    expect(hasCoast(-35, -20, 35, 52)).toBe(true);
    expect(hasCoast(45, -10, 70, 30)).toBe(true);
    expect(hasCoast(10, 75, 60, 145)).toBe(true);
    expect(hasCoast(-44, 112, -10, 155)).toBe(true);
    expect(hasCoast(-90, -180, -70, 180)).toBe(true);
  });

  it("reports invalid or empty geometry", () => {
    expect(() =>
      coastlineSegments({ type: "FeatureCollection", features: [] }),
    ).toThrow(/empty/);
    expect(() =>
      coastlineSegments({
        type: "FeatureCollection",
        features: [{ geometry: { type: "Point", coordinates: [0, 0] } }],
      }),
    ).toThrow(/Unsupported/);
    expect(() =>
      coastlineSegments({
        type: "FeatureCollection",
        features: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [181, 0],
              ],
            },
          },
        ],
      }),
    ).toThrow(/coordinate/);
  });
});

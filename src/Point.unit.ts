import { describe, expect, it } from "vitest";

import { latLonToVector } from "./latLonToVector";
import { Point } from "./Point";

describe("Point fixed-point coordinates", () => {
  it("rounds inputs to eight decimal places before computing the vector", () => {
    const point = new Point("point", 49.2827123456, -123.120712346);
    expect(point.latE8).toBe(4_928_271_235);
    expect(point.lonE8).toBe(-12_312_071_235);
    expect(point.lat).toBe(49.28271235);
    expect(point.lon).toBe(-123.12071235);
    expect(point.vector).toEqual(latLonToVector(point.lat, point.lon));
    expect(JSON.parse(JSON.stringify(point))).toEqual({
      id: "point",
      lat: 49.28271235,
      lon: -123.12071235,
    });
  });

  it("uses Math.round tie behavior and canonicalizes signed zero", () => {
    const point = new Point("point", 0.000000005, -0.000000005);
    expect(point.latE8).toBe(1);
    expect(Object.is(point.lonE8, -0)).toBe(false);
    expect(point.lon).toBe(0);
    expect(new Point("zero", -0, -0).toJSON()).toEqual({
      id: "zero",
      lat: 0,
      lon: 0,
    });
  });

  it("round trips scaled integer endpoints and rejects invalid stored values", () => {
    for (const [lat, lon] of [
      [-9_000_000_000, -18_000_000_000],
      [9_000_000_000, 18_000_000_000],
      [1, -1],
      [4_928_271_235, -12_312_071_235],
    ]) {
      const point = Point.fromScaled("point", lat, lon);
      expect([point.latE8, point.lonE8]).toEqual([lat, lon]);
    }
    expect(() => Point.fromScaled("bad", 1.1, 0)).toThrow();
    expect(() => Point.fromScaled("bad", 9_000_000_001, 0)).toThrow();
    expect(() => Point.fromScaled("bad", 0, -18_000_000_001)).toThrow();
    expect(() => Point.fromScaled("bad", Infinity, 0)).toThrow();
    expect(() => new Point("bad", 90.000000001, 0)).toThrow();
  });

  it("preserves scaled integers across conversions throughout the coordinate range", () => {
    let seed = 891234;
    for (let i = 0; i < 10_000; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const lat =
        Math.floor((seed / 0x100000000) * 18_000_000_001) - 9_000_000_000;
      seed = (1664525 * seed + 1013904223) >>> 0;
      const lon =
        Math.floor((seed / 0x100000000) * 36_000_000_001) - 18_000_000_000;
      const point = Point.fromScaled("point", lat, lon);
      expect([point.latE8, point.lonE8]).toEqual([lat, lon]);
    }
  });
});

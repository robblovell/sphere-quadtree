import { describe, expect, it } from "vitest";

import { Point } from "./Point";
import { Triangle } from "./Triangle";

describe("spherical triangle containment", () => {
  const triangle = new Triangle(
    Point.fromLatLon("a", 0, 0).vector,
    Point.fromLatLon("b", 0, 90).vector,
    Point.fromLatLon("c", 90, 0).vector,
  );
  const cases: Array<[number, number, boolean]> = [
    [35, 45, true],
    [0, 0, true],
    [0, 45, true],
    [90, 0, true],
    [-10, 45, false],
    [30, -10, false],
    [30, 100, false],
    [-35, -135, false],
  ];

  it.each(cases)("classifies (%s, %s)", (lat, lon, inside) => {
    expect(triangle.contains(Point.fromLatLon("test", lat, lon).vector)).toBe(
      inside,
    );
  });

  it("is independent of vertex winding", () => {
    const reversed = new Triangle(
      triangle.vertices[2],
      triangle.vertices[1],
      triangle.vertices[0],
    );
    for (const [lat, lon, inside] of cases) {
      expect(reversed.contains(Point.fromLatLon("test", lat, lon).vector)).toBe(
        inside,
      );
    }
  });

  it("rejects the north pole for a small triangle near the equator", () => {
    const equatorial = new Triangle(
      Point.fromLatLon("a", 11, 0).vector,
      Point.fromLatLon("b", 10, 6).vector,
      Point.fromLatLon("c", 10, -6).vector,
    );
    expect(equatorial.contains(Point.fromLatLon("pole", 90, 0).vector)).toBe(
      false,
    );
  });

  it("rejects degenerate triangles", () => {
    const p = Point.fromLatLon("p", 0, 0).vector;
    expect(() => new Triangle(p, p, p)).toThrow();
  });

  it("detects intersecting triangles even when neither contains a vertex of the other", () => {
    const make = (longitudes: number[]): Triangle => {
      const points = longitudes.map(
        (lon) => Point.fromLatLon("vertex", 60, lon).vector,
      );
      return new Triangle(points[0], points[1], points[2]);
    };
    const first = make([0, 120, -120]);
    const second = make([60, 180, -60]);
    expect(first.vertices.some((point) => second.contains(point))).toBe(false);
    expect(second.vertices.some((point) => first.contains(point))).toBe(false);
    expect(first.intersects(second)).toBe(true);
    expect(second.intersects(first)).toBe(true);
  });
});

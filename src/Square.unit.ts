import { describe, expect, it } from "vitest";

import { BoundingBox } from "./BoundingBox";
import { Point } from "./Point";
import { SphereQuadtree } from "./SphereQuadtree";
import { Square } from "./Square";
import type { Vector } from "./vector";

const vertex = (lat: number, lon: number): Vector =>
  new Point("vertex", lat, lon).vector;

describe("Square", () => {
  it("finds points within a geodesic quadrilateral in either winding", () => {
    const vertices = [
      vertex(-10, 170),
      vertex(-10, -170),
      vertex(10, -170),
      vertex(10, 170),
    ];
    const square = new Square(
      vertices[0],
      vertices[1],
      vertices[2],
      vertices[3],
    );
    const reversed = new Square(
      vertices[3],
      vertices[2],
      vertices[1],
      vertices[0],
    );
    const points = [
      new Point("inside", 0, 180),
      new Point("edge", -10, 170),
      new Point("outside", 0, 0),
    ];
    const tree = new SphereQuadtree(1);
    points.forEach((point) => tree.add(point));
    for (const query of [square, reversed]) {
      expect(
        tree
          .find(query)
          .map((point) => point.id)
          .sort(),
      ).toEqual(["edge", "inside"]);
    }
  });

  it("rejects crossed, concave and degenerate quadrilaterals", () => {
    expect(
      () =>
        new Square(vertex(0, 0), vertex(10, 10), vertex(0, 10), vertex(10, 0)),
    ).toThrow();
    expect(
      () =>
        new Square(vertex(0, 0), vertex(0, 20), vertex(3, 5), vertex(20, 0)),
    ).toThrow();
    expect(
      () =>
        new Square(vertex(0, 0), vertex(0, 0), vertex(10, 10), vertex(10, 0)),
    ).toThrow();
  });

  it("uses great-circle edges rather than latitude parallels", () => {
    const square = new Square(
      vertex(40, -130),
      vertex(40, -110),
      vertex(60, -110),
      vertex(60, -130),
    );
    const point = new Point("between", 40.2, -120);
    const tree = new SphereQuadtree();
    tree.add(point);
    expect(tree.find(square)).toEqual([]);
    expect(tree.find(new BoundingBox(40, -130, 60, -110))).toEqual([point]);
  });

  it("matches a brute-force scan for many square queries", () => {
    let seed = 987654;
    const random = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const tree = new SphereQuadtree(3);
    const points = Array.from(
      { length: 600 },
      (_, i) =>
        new Point(
          String(i),
          (Math.asin(2 * random() - 1) * 180) / Math.PI,
          360 * random() - 180,
        ),
    );
    points.forEach((point) => tree.add(point));
    const wrap = (lon: number): number => ((lon + 540) % 360) - 180;
    for (let i = 0; i < 100; i++) {
      const south = random() * 110 - 65;
      const north = south + 2 + random() * 15;
      const west = random() * 360 - 180;
      const east = wrap(west + 2 + random() * 30);
      const square = new Square(
        vertex(south, west),
        vertex(south, east),
        vertex(north, east),
        vertex(north, west),
      );
      const expected = points
        .filter((point) => square.contains(point.vector))
        .map((point) => point.id)
        .sort();
      expect(
        tree
          .find(square)
          .map((point) => point.id)
          .sort(),
      ).toEqual(expected);
    }
  });
});

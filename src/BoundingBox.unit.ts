import { describe, expect, it } from "vitest";

import { BoundingBox } from "./BoundingBox";
import { Point } from "./Point";
import { SphereQuadtree } from "./SphereQuadtree";

describe("BoundingBox", () => {
  it("includes bounds, wraps the antimeridian and treats -180 and 180 as the same meridian", () => {
    const box = new BoundingBox(-10, 170, 10, -170);
    for (const [lat, lon] of [
      [-10, 170],
      [10, -170],
      [0, -180],
      [0, 180],
    ]) {
      expect(box.contains(new Point("inside", lat, lon))).toBe(true);
    }
    expect(box.contains(new Point("outside", 0, 0))).toBe(false);
    expect(
      new BoundingBox(-90, -180, 90, 180).contains(new Point("world", 0, 0)),
    ).toBe(true);
    expect(
      new BoundingBox(0, -180, 0, -180).contains(new Point("seam", 0, 180)),
    ).toBe(true);
  });

  it("rejects invalid coordinates and reversed latitude bounds", () => {
    expect(() => new BoundingBox(20, 0, -20, 1)).toThrow();
    expect(() => new BoundingBox(-91, 0, 0, 1)).toThrow();
    expect(() => new BoundingBox(0, -181, 1, 0)).toThrow();
    expect(() => new BoundingBox(0, 0, 1, NaN)).toThrow();
  });

  it("matches brute force for randomized boxes, including poles and the antimeridian", () => {
    let seed = 123456;
    const random = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const points = Array.from(
      { length: 1000 },
      (_, i) =>
        new Point(
          String(i),
          (Math.asin(2 * random() - 1) * 180) / Math.PI,
          360 * random() - 180,
        ),
    );
    points.push(
      new Point("north", 90, 40),
      new Point("south", -90, -150),
      new Point("east", 0, 180),
      new Point("west", 0, -180),
    );
    const tree = new SphereQuadtree(4);
    points.forEach((point) => tree.add(point));
    const boxes = [
      new BoundingBox(-90, -180, 90, 180),
      new BoundingBox(-90, 170, 90, -170),
      new BoundingBox(90, 0, 90, 50),
      new BoundingBox(-90, -160, -90, -140),
      new BoundingBox(0, 180, 0, -180),
    ];
    for (let i = 0; i < 250; i++) {
      const a = 180 * random() - 90;
      const b = 180 * random() - 90;
      boxes.push(
        new BoundingBox(
          Math.min(a, b),
          360 * random() - 180,
          Math.max(a, b),
          360 * random() - 180,
        ),
      );
    }
    for (const box of boxes) {
      const expected = points
        .filter((point) => box.contains(point))
        .map((point) => point.id)
        .sort();
      expect(
        tree
          .find(box)
          .map((point) => point.id)
          .sort(),
      ).toEqual(expected);
    }
  });
});

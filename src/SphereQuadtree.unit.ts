import { describe, expect, it } from "vitest";

import { icosahedron } from "./icosahedron";
import { Point } from "./Point";
import { SphereQuadtree } from "./SphereQuadtree";
import { Triangle } from "./Triangle";

const triangle = (coords: number[][]): Triangle => {
  const [a, b, c] = coords.map(
    ([lat, lon]) => new Point("vertex", lat, lon).vector,
  );
  return new Triangle(a, b, c);
};

describe("SphereQuadtree", () => {
  it("covers the globe, including shared vertices and edges", () => {
    const faces = icosahedron();
    const tree = new SphereQuadtree(1);
    const points = [
      [90, 0],
      [-90, 0],
      [0, 0],
      [0, 180],
      [0, -180],
      [(Math.atan(0.5) * 180) / Math.PI, 0],
      [35, 36],
    ].map(([lat, lon], i) => new Point(String(i), lat, lon));
    points.forEach((point) => tree.add(point));
    for (const point of points) {
      expect(faces.some((face) => face.contains(point.vector))).toBe(true);
      const results = faces.flatMap((face) => tree.find(face));
      expect(
        results.filter((result) => result.id === point.id).length,
      ).toBeGreaterThan(0);
    }
  });

  it("does not assume equatorial faces end at the ring latitude", () => {
    const point = new Point("overhang", 29, 36);
    const equatorial = icosahedron().slice(5, 15);
    expect(point.lat).toBeGreaterThan((Math.atan(0.5) * 180) / Math.PI);
    expect(equatorial.some((face) => face.contains(point.vector))).toBe(true);
    const tree = new SphereQuadtree();
    tree.add(point);
    expect(
      equatorial.flatMap((face) => tree.find(face)).map((p) => p.id),
    ).toContain(point.id);
  });

  it("splits, handles duplicate locations, deletes by id and round-trips cached geometry", () => {
    const tree = new SphereQuadtree(2);
    for (let i = 0; i < 10; i++) tree.add(new Point(String(i), 10, 10));
    expect(() => tree.add(new Point("0", 0, 0))).toThrow(/already exists/);
    expect(tree.delete("3")).toBe(true);
    expect(tree.delete("3")).toBe(false);
    const data = JSON.parse(JSON.stringify(tree));
    expect(data.roots[0].triangle.normals).toHaveLength(3);
    const restored = SphereQuadtree.fromJSON(data);
    expect(restored.toJSON()).toEqual(data);
    expect(
      restored
        .find(
          triangle([
            [0, 0],
            [0, 90],
            [90, 0],
          ]),
        )
        .map((p) => p.id)
        .sort(),
    ).toEqual(["0", "1", "2", "4", "5", "6", "7", "8", "9"]);
    expect(restored.delete("0")).toBe(true);
  });

  it("rejects invalid coordinates, capacities and persisted data", () => {
    expect(() => new Point("", 0, 0)).toThrow();
    expect(() => new Point("x", 91, 0)).toThrow();
    expect(() => new Point("x", 0, Infinity)).toThrow();
    expect(() => new SphereQuadtree(0)).toThrow();
    const data = new SphereQuadtree().toJSON();
    data.roots[0].triangle.normals[0] = [0, 0, 0];
    expect(() => SphereQuadtree.fromJSON(data)).toThrow();
  });

  it("matches brute force for randomized points and triangle queries", () => {
    let seed = 0x12345678;
    const random = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const point = (id: string): Point =>
      new Point(
        id,
        (Math.asin(2 * random() - 1) * 180) / Math.PI,
        360 * random() - 180,
      );
    const tree = new SphereQuadtree(4);
    const points = Array.from({ length: 600 }, (_, i) => point(String(i)));
    points.forEach((p) => tree.add(p));
    const restored = SphereQuadtree.fromJSON(JSON.parse(JSON.stringify(tree)));
    for (let i = 0; i < 120; i++) {
      const vertices = [point("a"), point("b"), point("c")];
      const query = new Triangle(
        vertices[0].vector,
        vertices[1].vector,
        vertices[2].vector,
      );
      const expected = points
        .filter((p) => query.contains(p.vector))
        .map((p) => p.id)
        .sort();
      expect(
        tree
          .find(query)
          .map((p) => p.id)
          .sort(),
      ).toEqual(expected);
      expect(
        restored
          .find(query)
          .map((p) => p.id)
          .sort(),
      ).toEqual(expected);
    }
  });
});

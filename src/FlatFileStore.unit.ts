import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { BoundingBox } from "./BoundingBox";
import { FlatFileStore } from "./FlatFileStore";
import { latLonToVector } from "./latLonToVector";
import { Point } from "./Point";
import { SphereQuadtree } from "./SphereQuadtree";
import type { LegacyTreeData, TreeData } from "./SphereQuadtree";
import { Triangle } from "./Triangle";

describe("flat-file fixed-point persistence", () => {
  const directory = mkdtempSync(join(tmpdir(), "sqt-store-"));
  const file = join(directory, "tree.json");
  afterEach(() => rmSync(file, { force: true }));
  afterAll(() => rmSync(directory, { force: true, recursive: true }));

  it("saves scaled integers and keeps query results stable across reloads", () => {
    const store = new FlatFileStore(file);
    const tree = new SphereQuadtree(1);
    const point = new Point("point", 12.123456784, -170.123456786);
    tree.add(point);
    const query = new BoundingBox(
      12.12345678,
      -170.12345679,
      12.12345678,
      -170.12345679,
    );
    expect(tree.find(query)).toEqual([point]);
    store.save(tree);
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(data.version).toBe(2);
    const stored: TreeData = data;
    const leaves = stored.roots.flatMap(function visit(
      bin: TreeData["roots"][number],
    ): NonNullable<typeof bin.points> {
      return bin.children ? bin.children.flatMap(visit) : (bin.points ?? []);
    });
    expect(leaves).toEqual([
      { id: "point", latE8: 1_212_345_678, lonE8: -17_012_345_679 },
    ]);
    expect(
      store
        .load()
        .find(query)
        .map((p) => p.toJSON()),
    ).toEqual([point.toJSON()]);
    store.save(store.load());
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(data);
  });

  it("migrates version-1 points even when rounding crosses a bin edge", () => {
    const original = new SphereQuadtree(1).toJSON();
    const legacy: LegacyTreeData = {
      capacity: original.capacity,
      roots: original.roots.map((root) => ({
        triangle: root.triangle,
        children: root.children?.map((child) => ({
          triangle: child.triangle,
          points: [],
        })),
      })),
      version: 1,
    };
    const leaves = legacy.roots.flatMap((root) => root.children ?? []);
    let fixture:
      { bin: (typeof leaves)[number]; lat: number; lon: number } | undefined;
    for (const bin of leaves) {
      const triangle = Triangle.fromJSON(bin.triangle);
      const [a, b] = triangle.vertices;
      for (let i = 1; i < 100 && !fixture; i++) {
        const t = i / 100;
        const x = a[0] * (1 - t) + b[0] * t;
        const y = a[1] * (1 - t) + b[1] * t;
        const z = a[2] * (1 - t) + b[2] * t;
        const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
        const lon = (Math.atan2(y, x) * 180) / Math.PI;
        for (const delta of [-0.000000003, 0.000000003]) {
          const oldLat = lat + delta;
          if (oldLat < -90 || oldLat > 90) continue;
          const point = new Point("moved", oldLat, lon);
          if (
            triangle.contains(latLonToVector(oldLat, lon)) &&
            !triangle.contains(point.vector)
          ) {
            fixture = { bin, lat: oldLat, lon };
            break;
          }
        }
      }
      if (fixture) break;
    }
    expect(fixture).toBeDefined();
    if (!fixture || !fixture.bin.points)
      throw new Error("Missing edge fixture");
    fixture.bin.points.push({
      id: "moved",
      lat: fixture.lat,
      lon: fixture.lon,
    });
    writeFileSync(file, JSON.stringify(legacy));
    const store = new FlatFileStore(file);
    const tree = store.load();
    const point = new Point("moved", fixture.lat, fixture.lon);
    expect(
      tree
        .find(new BoundingBox(point.lat, point.lon, point.lat, point.lon))
        .map((p) => p.id),
    ).toEqual(["moved"]);
    expect(JSON.parse(readFileSync(file, "utf8")).version).toBe(1);
    store.save(tree);
    expect(JSON.parse(readFileSync(file, "utf8")).version).toBe(2);
    expect(
      store
        .load()
        .find(new BoundingBox(-90, -180, 90, 180))
        .map((p) => p.id),
    ).toEqual(["moved"]);
  });

  it("rejects fractional and out-of-range version-2 coordinates", () => {
    const tree = new SphereQuadtree();
    tree.add(new Point("point", 10, 10));
    const data = tree.toJSON();
    const leaf = data.roots
      .flatMap((root) => root.children ?? [])
      .find((bin) => bin.points?.length);
    if (!leaf?.points) throw new Error("Missing point");
    leaf.points[0].latE8 = 10.5;
    expect(() => SphereQuadtree.fromJSON(data)).toThrow(/scaled/);
    leaf.points[0].latE8 = 9_000_000_001;
    expect(() => SphereQuadtree.fromJSON(data)).toThrow(/scaled/);
  });
});

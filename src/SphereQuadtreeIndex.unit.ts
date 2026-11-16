import { describe, expect, it, vi } from "vitest";

import { BoundingBox } from "./BoundingBox";
import { Point } from "./Point";
import { SphereQuadtree } from "./SphereQuadtree";
import { SphereQuadtreeIndex } from "./SphereQuadtreeIndex";

describe("SphereQuadtreeIndex", () => {
  it("loads on every operation and saves only successful mutations", () => {
    let saved = new SphereQuadtree();
    const store = {
      load: vi.fn(() => SphereQuadtree.fromJSON(saved.toJSON())),
      save: vi.fn((tree: SphereQuadtree) => {
        saved = tree;
      }),
    };
    const index = new SphereQuadtreeIndex({ store });
    index.add(new Point("home", 10, 10));
    expect(index.find(new BoundingBox(0, 0, 20, 20)).map((p) => p.id)).toEqual([
      "home",
    ]);
    expect(index.delete("missing")).toBe(false);
    expect(index.delete("home")).toBe(true);
    expect(store.load).toHaveBeenCalledTimes(4);
    expect(store.save).toHaveBeenCalledTimes(2);
  });

  it("propagates store errors and rejects conflicting options", () => {
    const index = new SphereQuadtreeIndex({
      store: {
        load: () => {
          throw new Error("load failed");
        },
        save: () => {},
      },
    });
    expect(() => index.add(new Point("x", 0, 0))).toThrow("load failed");
    const failing = new SphereQuadtreeIndex({
      store: {
        load: () => new SphereQuadtree(),
        save: () => {
          throw new Error("save failed");
        },
      },
    });
    expect(() => failing.add(new Point("x", 0, 0))).toThrow("save failed");
    expect(
      () =>
        new SphereQuadtreeIndex({
          file: "x",
          store: { load: () => new SphereQuadtree(), save: () => {} },
        }),
    ).toThrow();
  });

  it("loads once and saves once for a batch, and does not save failed or empty batches", () => {
    let saved = new SphereQuadtree();
    const store = {
      load: vi.fn(() => SphereQuadtree.fromJSON(saved.toJSON())),
      save: vi.fn((tree: SphereQuadtree) => {
        saved = tree;
      }),
    };
    const index = new SphereQuadtreeIndex({ store });
    index.addMany([new Point("a", 0, 0), new Point("b", 10, 10)]);
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(
      index
        .find(new BoundingBox(-90, -180, 90, 180))
        .map((p) => p.id)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(() =>
      index.addMany([new Point("c", 1, 1), new Point("a", 2, 2)]),
    ).toThrow(/already exists/);
    index.addMany([]);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(
      index
        .find(new BoundingBox(-90, -180, 90, 180))
        .map((p) => p.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { BoundingBox } from "./BoundingBox";
import { BinaryFileStore } from "./BinaryFileStore";
import { Point } from "./Point";
import { SphereQuadtree } from "./SphereQuadtree";

describe("BinaryFileStore", () => {
  const directory = mkdtempSync(join(tmpdir(), "sqt-binary-store-"));
  afterAll(() => rmSync(directory, { force: true, recursive: true }));

  it("persists and reloads a quadtree in a binary file", () => {
    const file = join(directory, "tree.bin");
    const store = new BinaryFileStore(file);
    const tree = new SphereQuadtree();
    tree.add(new Point("point", 12, 34));
    store.save(tree);
    const data = readFileSync(file);
    expect(data.subarray(0, 8).toString("ascii")).toBe("SQT-BIN1");
    expect(
      store
        .load()
        .find(new BoundingBox(-90, -180, 90, 180))
        .map((p) => p.id),
    ).toEqual(["point"]);
  });

  it("returns an empty tree for a missing file and rejects invalid data", () => {
    const store = new BinaryFileStore(join(directory, "missing.bin"));
    expect(store.load()).toBeInstanceOf(SphereQuadtree);
    const invalid = join(directory, "invalid.bin");
    writeFileSync(invalid, "not a binary index");
    expect(() => new BinaryFileStore(invalid).load()).toThrow(
      /Invalid binary quadtree file/,
    );
  });
});

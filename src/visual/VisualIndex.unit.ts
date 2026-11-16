import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { VisualIndex } from "./VisualIndex";

describe("VisualIndex", () => {
  const directory = mkdtempSync(join(tmpdir(), "sqt-visual-index-"));
  afterAll(() => rmSync(directory, { force: true, recursive: true }));

  it("adds, searches, deletes and persists points in every supported region", () => {
    const file = join(directory, "index.json");
    const index = new VisualIndex(file);
    index.add("inside", 10, 10);
    index.add("outside", -10, -10);
    const data = index.state();
    expect(data.bins).toHaveLength(80);
    expect(data.points).toHaveLength(2);
    expect(index.find("box", [0, 0, 20, 20]).map((p) => p.id)).toEqual([
      "inside",
    ]);
    expect(
      index.find("triangle", [0, 0, 0, 90, 90, 0]).map((p) => p.id),
    ).toEqual(["inside"]);
    expect(
      index.find("square", [0, 0, 0, 20, 20, 20, 20, 0]).map((p) => p.id),
    ).toEqual(["inside"]);
    const bin = data.bins.find((candidate) =>
      index
        .find("bin", [], candidate.id)
        .some((point) => point.id === "inside"),
    );
    expect(bin).toBeDefined();
    expect(() => index.find("bin", [], "0.5")).toThrow();
    expect(() => index.find("bin", [], "0.0.0")).toThrow();
    expect(() => index.find("box", [0])).toThrow();
    index.delete("inside");
    expect(index.state().points.map((point) => point.id)).toEqual(["outside"]);
    expect(() => index.delete("inside")).toThrow(/not found/);
    expect(
      new VisualIndex(file).state().points.map((point) => point.id),
    ).toEqual(["outside"]);
  });

  it("switches files only after successful native open and save operations", () => {
    const original = join(directory, "original.json");
    const copy = join(directory, "copy.json");
    const invalid = join(directory, "invalid.json");
    const index = new VisualIndex(original);
    index.add("original", 0, 0);
    index.saveAs(copy);
    index.add("copy", 10, 10);
    expect(
      new VisualIndex(original).state().points.map((point) => point.id),
    ).toEqual(["original"]);
    expect(new VisualIndex(copy).state().points).toHaveLength(2);
    writeFileSync(invalid, "{invalid");
    expect(() => index.open(invalid)).toThrow();
    expect(() => index.open(join(directory, "missing.json"))).toThrow();
    expect(() =>
      index.saveAs(join(directory, "missing", "index.json")),
    ).toThrow();
    expect(index.state().file).toBe(copy);
    expect(readFileSync(invalid, "utf8")).toBe("{invalid");
    index.open(original);
    expect(index.state().points.map((point) => point.id)).toEqual(["original"]);
  });

  it("finds points on shared triangle boundaries regardless of their assigned bin", () => {
    const index = new VisualIndex(join(directory, "boundary.json"));
    index.add("pole", 90, 0);
    const bins = index
      .state()
      .bins.filter((bin) =>
        bin.vertices.some((vertex) => vertex[2] > 1 - 1e-14),
      );
    expect(bins.length).toBe(5);
    for (const bin of bins) {
      expect(index.find("bin", [], bin.id).map((point) => point.id)).toContain(
        "pole",
      );
    }
  });
});

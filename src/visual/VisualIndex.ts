import { createHash } from "node:crypto";
import { statSync } from "node:fs";

import { BoundingBox } from "../BoundingBox";
import { FlatFileStore } from "../FlatFileStore";
import { Point } from "../Point";
import type { SearchRegion, TreeData } from "../SphereQuadtree";
import { Square } from "../Square";
import { Triangle } from "../Triangle";
import type { Vector } from "../vector";

export type VisualBin = {
  id: string;
  vertices: [Vector, Vector, Vector];
};

export type VisualPoint = {
  id: string;
  lat: number;
  lon: number;
};

export type VisualState = {
  bins: VisualBin[];
  file: string;
  points: VisualPoint[];
  revision: string;
};

type Bin = TreeData["roots"][number];

export class VisualIndex {
  constructor(private file = "spherequadtree.json") {}

  state(): VisualState {
    const data = new FlatFileStore(this.file).load().toJSON();
    const bins: VisualBin[] = [];
    const points: VisualPoint[] = [];
    const visit = (bin: Bin, id: string): void => {
      if (bin.children) {
        bin.children.forEach((child, index) => visit(child, `${id}.${index}`));
      } else {
        bins.push({ id, vertices: bin.triangle.vertices });
        for (const point of bin.points ?? []) {
          points.push(
            Point.fromScaled(point.id, point.latE8, point.lonE8).toJSON(),
          );
        }
      }
    };
    data.roots.forEach((bin, index) => visit(bin, String(index)));
    return {
      bins,
      file: this.file,
      points,
      revision: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    };
  }

  add(id: string, lat: number, lon: number): void {
    const store = new FlatFileStore(this.file);
    const tree = store.load();
    tree.add(new Point(id, lat, lon));
    store.save(tree);
  }

  delete(id: string): void {
    const store = new FlatFileStore(this.file);
    const tree = store.load();
    if (!tree.delete(id)) throw new Error(`Point id not found: ${id}`);
    store.save(tree);
  }

  find(kind: string, values: number[], binId?: string): VisualPoint[] {
    const tree = new FlatFileStore(this.file).load();
    let region: SearchRegion;
    if (kind === "bin") {
      if (!binId || !/^(?:[0-9]|1[0-9])(?:\.[0-3])+$/.test(binId)) {
        throw new Error("Invalid triangle selection");
      }
      const [root, ...indices] = binId.split(".").map(Number);
      let bin: Bin | undefined = tree.toJSON().roots[root];
      for (const index of indices) bin = bin?.children?.[index];
      if (!bin || bin.children)
        throw new Error("Triangle no longer exists; select it again");
      region = Triangle.fromJSON(bin.triangle);
    } else if (kind === "box" && values.length === 4) {
      region = new BoundingBox(values[0], values[1], values[2], values[3]);
    } else if (
      (kind === "triangle" && values.length === 6) ||
      (kind === "square" && values.length === 8)
    ) {
      const vertices = Array.from(
        { length: values.length / 2 },
        (_, index) =>
          new Point("vertex", values[index * 2], values[index * 2 + 1]).vector,
      );
      region =
        kind === "triangle"
          ? new Triangle(vertices[0], vertices[1], vertices[2])
          : new Square(vertices[0], vertices[1], vertices[2], vertices[3]);
    } else {
      throw new Error("Invalid search region or coordinates");
    }
    return tree.find(region).map((point) => point.toJSON());
  }

  open(file: string): void {
    if (!statSync(file).isFile()) throw new Error("Index path must be a file");
    new FlatFileStore(file).load();
    this.file = file;
  }

  saveAs(file: string): void {
    const tree = new FlatFileStore(this.file).load();
    new FlatFileStore(file).save(tree);
    this.file = file;
  }
}

import { BinaryFileStore } from "./BinaryFileStore";
import { FlatFileStore } from "./FlatFileStore";
import type { Point } from "./Point";
import type { SearchRegion } from "./SphereQuadtree";
import type { SphereQuadtree } from "./SphereQuadtree";

export type IndexStore = {
  load(): SphereQuadtree;
  save(tree: SphereQuadtree): void;
};

export type Persistence = "file binary" | "file json";

export type SphereQuadtreeIndexOptions = {
  file?: string;
  persistence?: Persistence;
  store?: IndexStore;
};

export class SphereQuadtreeIndex {
  private readonly store: IndexStore;

  constructor(options: SphereQuadtreeIndexOptions = {}) {
    if (
      options.store !== undefined &&
      (options.file !== undefined || options.persistence !== undefined)
    )
      throw new Error("Specify either store or file persistence");
    if (options.store) {
      this.store = options.store;
      return;
    }
    const persistence = options.persistence ?? "file binary";
    const file =
      options.file ??
      (persistence === "file binary"
        ? "spherequadtree.bin"
        : "spherequadtree.json");
    this.store =
      persistence === "file binary"
        ? new BinaryFileStore(file)
        : new FlatFileStore(file);
  }

  add(point: Point): void {
    const tree = this.store.load();
    tree.add(point);
    this.store.save(tree);
  }

  addMany(points: Iterable<Point>): void {
    const tree = this.store.load();
    let added = false;
    for (const point of points) {
      tree.add(point);
      added = true;
    }
    if (added) this.store.save(tree);
  }

  delete(id: string): boolean {
    const tree = this.store.load();
    if (!tree.delete(id)) return false;
    this.store.save(tree);
    return true;
  }

  find(region: SearchRegion): Point[] {
    return this.store.load().find(region);
  }
}

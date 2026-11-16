import { FlatFileStore } from "./FlatFileStore";
import type { Point } from "./Point";
import type { SearchRegion } from "./SphereQuadtree";
import type { SphereQuadtree } from "./SphereQuadtree";

export type IndexStore = {
  load(): SphereQuadtree;
  save(tree: SphereQuadtree): void;
};

export type SphereQuadtreeIndexOptions = {
  file?: string;
  store?: IndexStore;
};

export class SphereQuadtreeIndex {
  private readonly store: IndexStore;

  constructor(options: SphereQuadtreeIndexOptions = {}) {
    if (options.file !== undefined && options.store !== undefined) {
      throw new Error("Specify either file or store, not both");
    }
    this.store =
      options.store ?? new FlatFileStore(options.file ?? "spherequadtree.json");
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

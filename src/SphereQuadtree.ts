import { icosahedron } from "./icosahedron";
import { BoundingBox } from "./BoundingBox";
import { latLonToVector } from "./latLonToVector";
import { Point } from "./Point";
import type { Square } from "./Square";
import { Triangle } from "./Triangle";
import type { TriangleData } from "./Triangle";

type StoredPoint = { id: string; latE8: number; lonE8: number };
type LegacyPoint = { id: string; lat: number; lon: number };

type BinData<P> = {
  children?: BinData<P>[];
  points?: P[];
  triangle: TriangleData;
};

export type TreeData = {
  capacity: number;
  roots: BinData<StoredPoint>[];
  version: 2;
};

export type LegacyTreeData = {
  capacity: number;
  roots: BinData<LegacyPoint>[];
  version: 1;
};

export type SearchRegion = BoundingBox | Square | Triangle;

type Bin = {
  children?: Bin[];
  points: Point[];
  triangle: Triangle;
};

const MAX_DEPTH = 42;

export class SphereQuadtree {
  private readonly locations = new Map<string, Bin>();
  private roots: Bin[];

  constructor(
    readonly capacity = 32,
    data?: TreeData | LegacyTreeData,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error("Capacity must be a positive safe integer");
    }
    if (data) {
      if (
        (data.version !== 1 && data.version !== 2) ||
        data.capacity !== capacity ||
        !Array.isArray(data.roots) ||
        data.roots.length !== 20
      ) {
        throw new Error("Invalid or unsupported quadtree file");
      }
      const migrated: Point[] = [];
      this.roots = data.roots.map((root) =>
        this.deserialize(root, 0, data.version, migrated),
      );
      if (data.version === 1) {
        this.locations.clear();
        for (const point of migrated) this.insert(this.roots, point, 0);
      }
    } else {
      this.roots = icosahedron().map((triangle) => ({
        children: triangle
          .subdivide()
          .map((child) => ({ points: [], triangle: child })),
        points: [],
        triangle,
      }));
    }
  }

  add(point: Point): void {
    if (!(point instanceof Point)) throw new Error("Expected a Point");
    if (this.locations.has(point.id))
      throw new Error(`Point id already exists: ${point.id}`);
    this.insert(this.roots, point, 0);
  }

  private insert(bins: Bin[], point: Point, depth: number): void {
    const bin = bins.find((candidate) =>
      candidate.triangle.contains(point.vector),
    );
    if (!bin) throw new Error(`No bin contains point: ${point.id}`);
    if (bin.children) {
      this.insert(bin.children, point, depth + 1);
      return;
    }
    bin.points.push(point);
    this.locations.set(point.id, bin);
    if (bin.points.length > this.capacity && depth < MAX_DEPTH) {
      bin.children = bin.triangle
        .subdivide()
        .map((triangle) => ({ points: [], triangle }));
      const points = bin.points;
      bin.points = [];
      for (const existing of points)
        this.insert(bin.children, existing, depth + 1);
    }
  }

  delete(id: string): boolean {
    const bin = this.locations.get(id);
    if (!bin) return false;
    const index = bin.points.findIndex((point) => point.id === id);
    bin.points.splice(index, 1);
    this.locations.delete(id);
    return true;
  }

  find(region: SearchRegion): Point[] {
    const found: Point[] = [];
    const visit = (bins: Bin[]): void => {
      for (const bin of bins) {
        if (!region.intersects(bin.triangle)) continue;
        if (bin.children) visit(bin.children);
        else {
          for (const point of bin.points) {
            if (
              region instanceof BoundingBox
                ? region.contains(point)
                : region.contains(point.vector)
            )
              found.push(point);
          }
        }
      }
    };
    visit(this.roots);
    return found;
  }

  toJSON(): TreeData {
    const serialize = (bin: Bin): BinData<StoredPoint> =>
      bin.children
        ? {
            children: bin.children.map(serialize),
            triangle: bin.triangle.toJSON(),
          }
        : {
            points: bin.points.map((point) => ({
              id: point.id,
              latE8: point.latE8,
              lonE8: point.lonE8,
            })),
            triangle: bin.triangle.toJSON(),
          };
    return {
      capacity: this.capacity,
      roots: this.roots.map(serialize),
      version: 2,
    };
  }

  private deserialize(
    raw: BinData<StoredPoint | LegacyPoint>,
    depth: number,
    version: 1 | 2,
    migrated: Point[],
  ): Bin {
    if (!raw || typeof raw !== "object" || depth > MAX_DEPTH)
      throw new Error("Invalid bin");
    const bin: Bin = { points: [], triangle: Triangle.fromJSON(raw.triangle) };
    if (raw.children !== undefined) {
      if (
        !Array.isArray(raw.children) ||
        raw.children.length !== 4 ||
        raw.points !== undefined ||
        depth >= MAX_DEPTH
      ) {
        throw new Error("Invalid bin children");
      }
      bin.children = raw.children.map((child) =>
        this.deserialize(child, depth + 1, version, migrated),
      );
      if (
        !bin.children.every((child) =>
          child.triangle.vertices.every((vertex) =>
            bin.triangle.contains(vertex),
          ),
        )
      ) {
        throw new Error("Persisted child is outside its parent");
      }
    } else {
      if (!Array.isArray(raw.points)) throw new Error("Invalid bin points");
      for (const rawPoint of raw.points) {
        if (!rawPoint || typeof rawPoint !== "object")
          throw new Error("Invalid point");
        let point: Point;
        if (version === 1 && "lat" in rawPoint && "lon" in rawPoint) {
          point = new Point(rawPoint.id, rawPoint.lat, rawPoint.lon);
          if (
            !bin.triangle.contains(latLonToVector(rawPoint.lat, rawPoint.lon))
          ) {
            throw new Error("Persisted point is outside its bin");
          }
        } else if (
          version === 2 &&
          "latE8" in rawPoint &&
          "lonE8" in rawPoint
        ) {
          point = Point.fromScaled(rawPoint.id, rawPoint.latE8, rawPoint.lonE8);
        } else {
          throw new Error("Invalid persisted point coordinates");
        }
        if (
          (version === 2 && !bin.triangle.contains(point.vector)) ||
          this.locations.has(point.id)
        ) {
          throw new Error("Invalid or duplicate persisted point");
        }
        this.locations.set(point.id, bin);
        if (version === 1) migrated.push(point);
        else bin.points.push(point);
      }
    }
    return bin;
  }

  static fromJSON(data: TreeData | LegacyTreeData): SphereQuadtree {
    if (!data || typeof data !== "object")
      throw new Error("Invalid or unsupported quadtree file");
    return new SphereQuadtree(data.capacity, data);
  }
}

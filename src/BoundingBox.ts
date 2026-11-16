import { Point } from "./Point";
import { Triangle } from "./Triangle";
import { vector } from "./vector";
import type { Vector } from "./vector";

const EPSILON = 1e-10;

export class BoundingBox {
  private readonly latitudeLimits: [number, number];
  private readonly longitudeNormals: [Vector, Vector] | undefined;

  constructor(
    readonly south: number,
    readonly west: number,
    readonly north: number,
    readonly east: number,
  ) {
    if (
      !Number.isFinite(south) ||
      !Number.isFinite(north) ||
      south < -90 ||
      north > 90 ||
      south > north
    ) {
      throw new Error(
        "Bounding box latitudes must satisfy -90 <= south <= north <= 90",
      );
    }
    if (
      !Number.isFinite(west) ||
      !Number.isFinite(east) ||
      west < -180 ||
      west > 180 ||
      east < -180 ||
      east > 180
    ) {
      throw new Error(
        "Bounding box longitudes must be between -180 and 180 degrees",
      );
    }
    this.latitudeLimits = [
      Math.sin((south * Math.PI) / 180),
      Math.sin((north * Math.PI) / 180),
    ];
    const width = west <= east ? east - west : 360 - west + east;
    if (width <= 180) {
      const w = (west * Math.PI) / 180;
      const e = (east * Math.PI) / 180;
      this.longitudeNormals = [
        [-Math.sin(w), Math.cos(w), 0],
        [Math.sin(e), -Math.cos(e), 0],
      ];
    }
  }

  contains(point: Point): boolean {
    if (point.lat < this.south || point.lat > this.north) return false;
    const within = (lon: number): boolean =>
      this.west <= this.east
        ? lon >= this.west && lon <= this.east
        : lon >= this.west || lon <= this.east;
    return (
      within(point.lon) || (Math.abs(point.lon) === 180 && within(-point.lon))
    );
  }

  intersects(triangle: Triangle): boolean {
    const [a, b, c] = triangle.vertices;
    const center = vector.normalize([
      a[0] + b[0] + c[0],
      a[1] + b[1] + c[1],
      a[2] + b[2] + c[2],
    ]);
    const cosine = Math.min(
      ...triangle.vertices.map((vertex) => vector.dot(center, vertex)),
    );
    if (cosine > 0) {
      const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
      const horizontal = Math.sqrt(Math.max(0, 1 - center[2] * center[2]));
      const minimum =
        -center[2] >= cosine ? -1 : center[2] * cosine - horizontal * sine;
      const maximum =
        center[2] >= cosine ? 1 : center[2] * cosine + horizontal * sine;
      if (
        maximum < this.latitudeLimits[0] - EPSILON ||
        minimum > this.latitudeLimits[1] + EPSILON
      )
        return false;
    }
    if (
      this.longitudeNormals &&
      !triangle.contains([0, 0, 1]) &&
      !triangle.contains([0, 0, -1]) &&
      this.longitudeNormals.some((normal) =>
        triangle.vertices.every(
          (vertex) => vector.dot(normal, vertex) < -EPSILON,
        ),
      )
    ) {
      return false;
    }
    return true;
  }
}

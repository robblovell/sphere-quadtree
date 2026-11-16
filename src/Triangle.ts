import { vector } from "./vector";
import type { Vector } from "./vector";

export type TriangleData = {
  normals: [Vector, Vector, Vector];
  vertices: [Vector, Vector, Vector];
};

const EPSILON = 1e-12;

export class Triangle {
  readonly normals: [Vector, Vector, Vector];
  readonly vertices: [Vector, Vector, Vector];

  constructor(
    a: Vector,
    b: Vector,
    c: Vector,
    normals?: [Vector, Vector, Vector],
  ) {
    const storedUnit = (v: Vector): Vector => {
      if (Math.abs(Math.hypot(...v) - 1) > 1e-9) {
        throw new Error("Invalid persisted unit vector");
      }
      return [...v];
    };
    const unit = normals ? storedUnit : vector.normalize;
    this.vertices = [unit(a), unit(b), unit(c)];
    const [v0, v1, v2] = this.vertices;
    if (normals) {
      this.normals = [
        storedUnit(normals[0]),
        storedUnit(normals[1]),
        storedUnit(normals[2]),
      ];
      for (let i = 0; i < 3; i++) {
        const n = this.normals[i];
        if (
          Math.abs(vector.dot(n, this.vertices[i])) > 1e-9 ||
          Math.abs(vector.dot(n, this.vertices[(i + 1) % 3])) > 1e-9 ||
          vector.dot(n, this.vertices[(i + 2) % 3]) <= 0
        ) {
          throw new Error("Invalid persisted triangle normals");
        }
      }
    } else {
      const makeNormal = (x: Vector, y: Vector, opposite: Vector): Vector => {
        const n = vector.normalize(
          vector.cross(x, [y[0] - x[0], y[1] - x[1], y[2] - x[2]]),
        );
        const side = vector.dot(n, opposite);
        if (Math.abs(side) < 1e-15) {
          throw new Error("Triangle vertices must not lie on one great circle");
        }
        return side > 0 ? n : [-n[0], -n[1], -n[2]];
      };
      this.normals = [
        makeNormal(v0, v1, v2),
        makeNormal(v1, v2, v0),
        makeNormal(v2, v0, v1),
      ];
    }
    if (!this.vertices.every((v) => this.contains(v))) {
      throw new Error(
        "Triangle must be a non-degenerate minor spherical triangle",
      );
    }
  }

  contains(point: Vector): boolean {
    return this.normals.every(
      (normal) => vector.dot(normal, point) >= -EPSILON,
    );
  }

  intersects(other: Triangle): boolean {
    const separated = (triangle: Triangle, candidate: Triangle): boolean =>
      triangle.normals.some((normal) =>
        candidate.vertices.every(
          (vertex) => vector.dot(normal, vertex) < -EPSILON,
        ),
      );
    if (separated(this, other) || separated(other, this)) return false;
    if (
      this.vertices.some((v) => other.contains(v)) ||
      other.vertices.some((v) => this.contains(v))
    ) {
      return true;
    }
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const cross = vector.cross(this.normals[i], other.normals[j]);
        const length = Math.hypot(...cross);
        if (length < 1e-15) continue;
        const intersection: Vector = [
          cross[0] / length,
          cross[1] / length,
          cross[2] / length,
        ];
        if (
          (this.contains(intersection) && other.contains(intersection)) ||
          (this.contains([
            -intersection[0],
            -intersection[1],
            -intersection[2],
          ]) &&
            other.contains([
              -intersection[0],
              -intersection[1],
              -intersection[2],
            ]))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  subdivide(): [Triangle, Triangle, Triangle, Triangle] {
    const [a, b, c] = this.vertices;
    const midpoint = (x: Vector, y: Vector): Vector =>
      vector.normalize([x[0] + y[0], x[1] + y[1], x[2] + y[2]]);
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    return [
      new Triangle(a, ab, ca),
      new Triangle(ab, b, bc),
      new Triangle(ca, bc, c),
      new Triangle(ab, bc, ca),
    ];
  }

  toJSON(): TriangleData {
    return { normals: this.normals, vertices: this.vertices };
  }

  static fromJSON(data: TriangleData): Triangle {
    if (
      !data ||
      !Array.isArray(data.vertices) ||
      data.vertices.length !== 3 ||
      !Array.isArray(data.normals) ||
      data.normals.length !== 3 ||
      ![...data.vertices, ...data.normals].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
      )
    ) {
      throw new Error("Invalid persisted triangle");
    }
    return new Triangle(...data.vertices, data.normals);
  }
}

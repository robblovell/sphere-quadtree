import { Triangle } from "./Triangle";
import { vector } from "./vector";
import type { Vector } from "./vector";

export class Square {
  private readonly triangles: [Triangle, Triangle];
  readonly vertices: [Vector, Vector, Vector, Vector];

  constructor(a: Vector, b: Vector, c: Vector, d: Vector) {
    this.vertices = [
      vector.normalize(a),
      vector.normalize(b),
      vector.normalize(c),
      vector.normalize(d),
    ];
    let winding = 0;
    for (let i = 0; i < 4; i++) {
      const start = this.vertices[i];
      const end = this.vertices[(i + 1) % 4];
      const normal = vector.normalize(
        vector.cross(start, [
          end[0] - start[0],
          end[1] - start[1],
          end[2] - start[2],
        ]),
      );
      for (let j = 2; j < 4; j++) {
        const side = vector.dot(normal, this.vertices[(i + j) % 4]);
        if (Math.abs(side) < 1e-14 || (winding !== 0 && side * winding < 0)) {
          throw new Error(
            "Square vertices must form a nondegenerate convex spherical quadrilateral in order",
          );
        }
        winding = Math.sign(side);
      }
    }
    this.triangles = [
      new Triangle(this.vertices[0], this.vertices[1], this.vertices[2]),
      new Triangle(this.vertices[0], this.vertices[2], this.vertices[3]),
    ];
  }

  contains(point: Vector): boolean {
    return this.triangles.some((triangle) => triangle.contains(point));
  }

  intersects(triangle: Triangle): boolean {
    return this.triangles.some((part) => part.intersects(triangle));
  }
}

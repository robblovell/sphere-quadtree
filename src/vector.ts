export type Vector = readonly [number, number, number];

export const vector = {
  cross(a: Vector, b: Vector): Vector {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  },
  dot(a: Vector, b: Vector): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  normalize(a: Vector): Vector {
    const length = Math.hypot(...a);
    if (!Number.isFinite(length) || length < 1e-15) {
      throw new Error("Cannot normalize a zero or invalid vector");
    }
    return [a[0] / length, a[1] / length, a[2] / length];
  },
};

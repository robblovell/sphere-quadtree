import { randomUUID } from "node:crypto";

import { Point } from "./Point";

export function* generateFakePoints(
  count: number,
  random: () => number = Math.random,
): Generator<Point> {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Point count must be a non-negative safe integer");
  }
  for (let i = 0; i < count; i++) {
    const lat = (Math.asin(2 * random() - 1) * 180) / Math.PI;
    const lon = 360 * random() - 180;
    yield new Point(`fake-${randomUUID()}`, lat, lon);
  }
}

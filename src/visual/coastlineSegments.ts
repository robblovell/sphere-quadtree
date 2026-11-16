import { latLonToVector } from "../latLonToVector";
import type { Vector } from "../vector";

const RADIUS = 1.012;
const MAX_ANGLE = Math.PI / 180;

export function coastlineSegments(data: unknown): number[] {
  if (
    !data ||
    typeof data !== "object" ||
    !("type" in data) ||
    data.type !== "FeatureCollection" ||
    !("features" in data) ||
    !Array.isArray(data.features)
  ) {
    throw new Error("Invalid coastline feature collection");
  }
  const positions: number[] = [];
  const point = (coordinate: unknown): Vector => {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      typeof coordinate[0] !== "number" ||
      typeof coordinate[1] !== "number" ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1]) ||
      Math.abs(coordinate[0]) > 180 ||
      Math.abs(coordinate[1]) > 90
    ) {
      throw new Error("Invalid coastline coordinate");
    }
    return latLonToVector(coordinate[1], coordinate[0]);
  };
  const line = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error("Invalid coastline line");
    }
    let start = point(coordinates[0]);
    for (const coordinate of coordinates.slice(1)) {
      const end = point(coordinate);
      const dot = Math.max(
        -1,
        Math.min(1, start[0] * end[0] + start[1] * end[1] + start[2] * end[2]),
      );
      const steps = Math.max(1, Math.ceil(Math.acos(dot) / MAX_ANGLE));
      let previous = start;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = start[0] * (1 - t) + end[0] * t;
        const y = start[1] * (1 - t) + end[1] * t;
        const z = start[2] * (1 - t) + end[2] * t;
        const length = Math.hypot(x, y, z);
        if (length < 1e-12)
          throw new Error("Ambiguous antipodal coastline segment");
        const next: Vector = [x / length, y / length, z / length];
        positions.push(
          ...previous.map((value) => value * RADIUS),
          ...next.map((value) => value * RADIUS),
        );
        previous = next;
      }
      start = end;
    }
  };
  for (const feature of data.features) {
    if (
      !feature ||
      typeof feature !== "object" ||
      !("geometry" in feature) ||
      !feature.geometry ||
      typeof feature.geometry !== "object" ||
      !("type" in feature.geometry) ||
      !("coordinates" in feature.geometry)
    ) {
      throw new Error("Invalid coastline geometry");
    }
    if (feature.geometry.type === "LineString") {
      line(feature.geometry.coordinates);
    } else if (
      feature.geometry.type === "MultiLineString" &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      for (const part of feature.geometry.coordinates) line(part);
    } else {
      throw new Error("Unsupported coastline geometry");
    }
  }
  if (positions.length === 0) throw new Error("Coastline dataset is empty");
  return positions;
}

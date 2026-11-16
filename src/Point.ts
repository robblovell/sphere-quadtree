import type { Vector } from "./vector";

export class Point {
  readonly vector: Vector;

  constructor(
    readonly id: string,
    readonly lat: number,
    readonly lon: number,
  ) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Point id must be a non-empty string");
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error("Latitude must be between -90 and 90 degrees");
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new Error("Longitude must be between -180 and 180 degrees");
    }
    const phi = (lat * Math.PI) / 180;
    const lambda = (lon * Math.PI) / 180;
    this.vector = [
      Math.cos(phi) * Math.cos(lambda),
      Math.cos(phi) * Math.sin(lambda),
      Math.sin(phi),
    ];
  }

  static fromLatLon(id: string, lat: number, lon: number): Point {
    return new Point(id, lat, lon);
  }

  toJSON(): { id: string; lat: number; lon: number } {
    return { id: this.id, lat: this.lat, lon: this.lon };
  }
}

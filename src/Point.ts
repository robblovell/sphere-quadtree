import { latLonToVector } from "./latLonToVector";
import type { Vector } from "./vector";

const SCALE = 100_000_000;

export class Point {
  readonly latE8: number;
  readonly lonE8: number;
  readonly vector: Vector;

  constructor(
    readonly id: string,
    lat: number,
    lon: number,
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
    this.latE8 = Math.round(lat * SCALE) || 0;
    this.lonE8 = Math.round(lon * SCALE) || 0;
    this.vector = latLonToVector(this.lat, this.lon);
  }

  get lat(): number {
    return this.latE8 / SCALE;
  }

  get lon(): number {
    return this.lonE8 / SCALE;
  }

  static fromScaled(id: string, latE8: number, lonE8: number): Point {
    if (
      !Number.isSafeInteger(latE8) ||
      !Number.isSafeInteger(lonE8) ||
      Math.abs(latE8) > 90 * SCALE ||
      Math.abs(lonE8) > 180 * SCALE
    ) {
      throw new Error("Invalid scaled point coordinates");
    }
    return new Point(id, latE8 / SCALE, lonE8 / SCALE);
  }

  static fromLatLon(id: string, lat: number, lon: number): Point {
    return new Point(id, lat, lon);
  }

  toJSON(): { id: string; lat: number; lon: number } {
    return { id: this.id, lat: this.lat, lon: this.lon };
  }
}

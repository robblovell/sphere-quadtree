import { randomUUID } from "node:crypto";

import { Point } from "./Point";

export type FakeDataDistribution = "cities" | "chunky" | "equator" | "random";

const cityLocations: ReadonlyArray<readonly [number, number]> = [
  [35.6762, 139.6503],
  [28.6139, 77.209],
  [31.2304, 121.4737],
  [23.1291, 113.2644],
  [40.7128, -74.006],
  [19.076, 72.8777],
  [39.9042, 116.4074],
  [34.0522, -118.2437],
  [40.4168, -3.7038],
  [41.0082, 28.9784],
  [51.5074, -0.1278],
  [48.8566, 2.3522],
  [22.5726, 88.3639],
  [55.7558, 37.6173],
  [37.7749, -122.4194],
  [25.2048, 55.2708],
  [13.7563, 100.5018],
  [-23.5505, -46.6333],
  [18.5204, 73.8567],
  [32.0853, 34.7818],
  [25.033, 121.5654],
  [30.0444, 31.2357],
  [33.3152, 44.3661],
  [35.6892, 51.389],
  [43.6532, -79.3832],
  [37.5665, 126.978],
  [6.5244, 3.3792],
  [14.5995, 120.9842],
  [-6.2088, 106.8456],
  [45.4642, 9.19],
  [52.52, 13.405],
  [59.3293, 18.0686],
  [38.7223, -9.1393],
  [39.9334, 32.8597],
  [24.7136, 46.6753],
  [1.3521, 103.8198],
  [3.139, 101.6869],
  [21.0278, 105.8342],
  [19.4326, -99.1332],
  [34.6937, 135.5023],
  [22.3193, 114.1694],
  [35.1796, 129.0756],
  [-33.8688, 151.2093],
  [-37.8136, 144.9631],
  [-34.6037, -58.3816],
  [31.7683, 35.2137],
  [26.4207, 50.0888],
  [29.3759, 47.9774],
  [24.4539, 54.3773],
  [30.2672, -97.7431],
  [32.7767, -96.797],
  [29.7604, -95.3698],
  [33.4484, -112.074],
  [39.7392, -104.9903],
  [45.5017, -73.5673],
  [49.2827, -123.1207],
  [41.8781, -87.6298],
  [38.9072, -77.0369],
  [39.9526, -75.1652],
  [33.749, -84.388],
  [42.3601, -71.0589],
  [25.7617, -80.1918],
  [47.6062, -122.3321],
  [37.3382, -121.8863],
  [32.7157, -117.1611],
  [31.2001, 29.9187],
  [36.8065, 10.1815],
  [33.5731, -7.5898],
  [30.0131, 31.2089],
  [-1.2921, 36.8219],
  [-26.2041, 28.0473],
  [-33.9249, 18.4241],
  [9.9312, 76.2673],
  [17.385, 78.4867],
  [12.9716, 77.5946],
  [23.8103, 90.4125],
  [27.7172, 85.324],
  [35.8617, 104.1954],
  [30.5728, 104.0668],
  [29.563, 106.5516],
  [34.3416, 108.9398],
  [22.5431, 114.0579],
  [24.4798, 118.0894],
  [-12.0464, -77.0428],
  [-34.9011, -56.1645],
  [-12.9714, -38.5014],
  [-22.9068, -43.1729],
  [4.711, -74.0721],
  [10.4806, -66.9036],
  [19.0414, -98.2063],
  [-16.4897, -68.1193],
  [-33.4489, -70.6693],
  [35.1856, 33.3823],
  [32.8872, 13.1913],
  [36.7538, 3.0588],
  [41.3275, 19.8187],
  [44.4268, 26.1025],
  [50.0755, 14.4378],
  [48.2082, 16.3738],
  [52.2297, 21.0122],
];

const normal = (random: () => number): number => {
  const u = Math.max(Number.EPSILON, random());
  const v = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const randomSpherePoint = (random: () => number): readonly [number, number] => [
  (Math.asin(2 * random() - 1) * 180) / Math.PI,
  360 * random() - 180,
];

const pointFor = (
  distribution: FakeDataDistribution,
  random: () => number,
  clusters: ReadonlyArray<readonly [number, number]>,
): readonly [number, number] => {
  if (distribution === "random") return randomSpherePoint(random);
  if (distribution === "equator") {
    const latitude = Math.max(-90, Math.min(90, normal(random) * 18));
    return [latitude, 360 * random() - 180];
  }
  const center = clusters[Math.floor(random() * clusters.length)];
  const latitude = Math.max(-90, Math.min(90, center[0] + normal(random) * 4));
  const longitude = center[1] + normal(random) * 4;
  return [latitude, ((((longitude + 180) % 360) + 360) % 360) - 180];
};

export function* generateFakePoints(
  count: number,
  random: () => number = Math.random,
  distribution: FakeDataDistribution = "random",
): Generator<Point> {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Point count must be a non-negative safe integer");
  }
  if (!["cities", "chunky", "equator", "random"].includes(distribution))
    throw new Error(`Unknown fake data distribution: ${distribution}`);
  const clusters =
    distribution === "cities"
      ? cityLocations
      : distribution === "chunky"
        ? Array.from({ length: 16 }, () => randomSpherePoint(random))
        : [];
  for (let i = 0; i < count; i++) {
    const [lat, lon] = pointFor(distribution, random, clusters);
    yield new Point(`fake-${randomUUID()}`, lat, lon);
  }
}

import { latLonToVector } from "./latLonToVector";
import { Triangle } from "./Triangle";

export const icosahedron = (): Triangle[] => {
  const latitude = (Math.atan(0.5) * 180) / Math.PI;
  const vertices = [
    latLonToVector(90, 0),
    ...[0, 72, 144, -144, -72].map((lon) => latLonToVector(latitude, lon)),
    ...[36, 108, 180, -108, -36].map((lon) => latLonToVector(-latitude, lon)),
    latLonToVector(-90, 0),
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 1],
    [1, 6, 2],
    [2, 6, 7],
    [2, 7, 3],
    [3, 7, 8],
    [3, 8, 4],
    [4, 8, 9],
    [4, 9, 5],
    [5, 9, 10],
    [5, 10, 1],
    [1, 10, 6],
    [11, 7, 6],
    [11, 8, 7],
    [11, 9, 8],
    [11, 10, 9],
    [11, 6, 10],
  ];
  return faces.map(
    ([a, b, c]) => new Triangle(vertices[a], vertices[b], vertices[c]),
  );
};

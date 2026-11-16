# Sphere quadtree

A TypeScript reference implementation of a point index on a unit sphere. A polar-aligned icosahedron supplies 20 root triangles; each root is divided into four, and full leaf bins are recursively divided into four. Edge normals are cached per triangle and persisted alongside its vertices. Searches prune bins that cannot intersect the requested region and then test points in the remaining leaves.

## Setup

Requires Node.js 20 and npm.

```sh
npm install
npm run build
npm test
npm run lint
```

To make the `sqt` command available on your PATH, install the built package with `npm install -g .`. Alternatively, run `node dist/cli.js` in place of `sqt` in the examples below.

## Command line

Coordinates are in degrees: latitude is in `[-90, 90]` and longitude is in `[-180, 180]`. IDs are unique, non-empty strings. Results are JSON on stdout; errors are reported on stderr. A failed one-shot command exits with a nonzero status.

```sh
sqt add home 49.2827 -123.1207
sqt find 0 -180 0 -90 90 0
sqt delete home
```

Searches can use three latitude/longitude pairs for a triangle, four pairs for a great-circle quadrilateral, or latitude/longitude bounds:

```sh
sqt find square 40 -130 40 -110 60 -110 60 -130
sqt find box 40 -130 60 -110
```

The box arguments are `south west north east`; a west longitude greater than east crosses the antimeridian. The optional `--file` precedes the command and defaults to `spherequadtree.json`.

Use an interactive session to execute multiple commands against the same file:

```text
$ sqt --file places.json --interactive
sqt> add home 49.2827 -123.1207
sqt> find box 40 -130 60 -110
sqt> delete home
sqt> quit
```

Each interactive line uses the same command syntax as a one-shot invocation, without `sqt` or `--file`; arguments are separated by whitespace. Errors are reported without ending the session. `quit` or end-of-file exits. Prompts are shown only on a terminal.

## API

```ts
import {
  BoundingBox,
  Point,
  SphereQuadtreeIndex,
  Square,
  Triangle,
} from "spherequadtree";

const tree = new SphereQuadtreeIndex();
tree.add(new Point("home", 49.2827, -123.1207));

const query = new Triangle(
  new Point("a", 0, -180).vector,
  new Point("b", 0, -90).vector,
  new Point("c", 90, 0).vector,
);
const matches = tree.find(query);

const square = new Square(
  new Point("a", 40, -130).vector,
  new Point("b", 40, -110).vector,
  new Point("c", 60, -110).vector,
  new Point("d", 60, -130).vector,
);
const squareMatches = tree.find(square);
const boxMatches = tree.find(new BoundingBox(40, -130, 60, -110));
tree.delete("home"); // true if the ID existed
```

`SphereQuadtreeIndex` loads the index for each operation and automatically saves successful additions and deletions. Its default file is `spherequadtree.json` in the current working directory. Supply `new SphereQuadtreeIndex({ file: "places.json" })` for another file, or `{ store }` to inject an implementation of the exported `IndexStore` interface. A missing file starts an empty index; malformed or unreadable files and failed writes are errors. The lower-level `SphereQuadtree` and `FlatFileStore` classes remain available for explicit in-memory and persistence control.

Triangle and square edges are minor great-circle arcs. A square accepts four ordered vertices in either winding and requires a nondegenerate convex spherical quadrilateral; it does not enforce equal side lengths. A bounding box instead follows lines of latitude and longitude, includes its boundaries, and interprets `-180` and `180` as the same meridian. At the poles, box longitude filtering uses the longitude stored on the point.

Points on shared bin boundaries belong to one deterministically chosen bin, but match every query region whose boundary contains them. Triangle and square containment includes edges within a small floating-point tolerance. Duplicate IDs are rejected; duplicate coordinates are allowed. The lower-level `SphereQuadtree` capacity defaults to 32. Subdivision stops at depth 20 (root depth 0), allowing a leaf to exceed capacity for coincident or extremely close points. Deletion does not merge bins.

The index is loaded into memory and the whole file is rewritten on save via a temporary file in the same directory. This is a single-writer reference implementation: concurrent read-modify-write processes must be externally serialized. It is not intended as a storage solution for very large datasets. Root selection does not use a latitude-only prefilter: great-circle edges between ring vertices bow beyond the ring latitudes.

## Precision


To get within 1 meter, you need 5 decimal places, and to get within 1 centimeter, you need 7 decimal places. These values reflect precision at the equator, where one degree of latitude or longitude covers roughly 111.1 kilometers.

Decimal Precision Reference


Decimal Places	Precision at Equator	Common Use Case
1	~11.1 km	Large city or region
2	~1.11 km	Town or neighborhood
3	~111 m	Large sports field or campus
4	~11.1 m	Individual building or street
5	~1.11 m	Trees, cars, or specific doorways
6	~11.1 cm	Standard commercial GPS limit
7	~1.11 cm	Surveying and precision mapping
8	~1.11 mm	Tectonic plate movement tracking


Key Things to Keep in Mind

• Longitude shrinks near the poles. Latitude spacing stays nearly constant everywhere on Earth, while lines of longitude get closer together as you move away from the equator. At 45° latitude (such as the northern US or central Europe), east-west precision is roughly 30% tighter than the numbers in the table.
• Sub-meter accuracy requires specialized hardware. Standard smartphone GPS receivers typically only achieve an accuracy of 3 to 5 meters, even if they output coordinates with 7 or 8 decimal places. Reaching true centimeter-level accuracy requires Real-Time Kinematic (RTK) positioning or survey-grade equipment.
I would like to create a JavaScript reference implementation for a sphere-quadtree index for searching through location-based lat-lon values.

It's an implementation for spherical data using an icosahedron as the first level of bins for location-based records and dividing each of the 20 triangles into four in the next level down. From there, anytime a bin gets too full, it divides into four more bins and the data is shifted into these new bins at the next level. Bins divide down whenever a bin gets too full. The implementation has `add`, `delete`, and `find`.

It uses the finding we had earlier to determine if a vector determined by a particular lat-lon is in or out of each level of triangles:

 * To verify that $\mathbf{d}$ actually passes inside the spherical triangle, you must check which side of each triangle edge $\mathbf{d}$ falls on using the scalar triple product test from earlier $\mathbf{d} \cdot (\mathbf{v}_0 \times \mathbf{v}_1)$, $\mathbf{d} \cdot (\mathbf{v}_1 \times \mathbf{v}_2)$, and $\mathbf{d} \cdot (\mathbf{v}_2 \times \mathbf{v}_0)$ must all share the same sign.

Please write the reference implementation in typescript.

Please construct a test harness first that loads a set of lat-lon points, converts them to 3D unit vectors, and then tests whether each point is inside or outside a given triangle on the sphere using the scalar triple product test. Use Vitest for the testing framework.

Use a flat file implementation for persistence, and provide a simple command-line interface to add, delete, and find points in the sphere-quadtree index.

Please write the implementation using a modular structure with clear separation of concerns, including classes for the SphereQuadtree, Triangle, and Point. The SphereQuadtree class should handle the logic for adding, deleting, and finding points, while the Triangle class should encapsulate the logic for checking if a point is inside the triangle using the scalar triple product test.

Please optimize the implementation for performance, especially in the `find` method, which should efficiently traverse the quadtree structure to locate points within a specified triangle. Make sure things like vertex cross products are precomputed and stored as part of the triangle bin's persistence so that it is only computed when created. Cache any necessary computations to avoid redundant calculations during searches.

---

### What Positive Dot Products Mean on a Sphere

* **Hemisphere Containment:** For any unit vector $\mathbf{v}_i$ on the sphere and ray direction...
  $$
  \mathbf{d} \cdot (\mathbf{v}_0 \times \mathbf{v}_1)), (\mathbf{d} \cdot (\mathbf{v}_1 \times \mathbf{v}_2)), and (\mathbf{d} \cdot (\mathbf{v}_2 \times \mathbf{v}_0))
  $$
 
is less than 0.

* Northern Hemisphere Analogy: Think of $\mathbf{d}$ as pointing straight at the North Pole. Any point in the entire Northern Hemisphere has a positive dot product with the North Pole vector.

* Missing the Target: A small triangle sitting near the equator in South America is completely in the Northern Hemisphere (all three dot products are positive), yet a vector pointing at the North Pole passes nowhere near it.

Concrete Example on the Unit Sphere

Suppose your vector starts at the center $(0, 0, 0)$ and points straight up to the North Pole: $\mathbf{d} = (0, 0, 1)$.

* **Triangle on the Sphere:** Pick three vertices on the unit sphere near the equator, such as:
  $$
  \mathbf{v}_1 = (0.98, 0, 0.2), \quad \mathbf{v}_2 = (0.98, 0.1, 0.17), \quad \mathbf{v}_3 = (0.98, -0.1, 0.17)
  $$

* **Check the Dot Products:**
  $$
  \mathbf{d} \cdot \mathbf{v}_1 = 0.2 > 0, \quad \mathbf{d} \cdot \mathbf{v}_2 = 0.17 > 0, \quad \mathbf{d} \cdot \mathbf{v}_3 = 0.17 > 0
  $$
* Result: All three dot products are positive, yet the triangle sits near \((1, 0, 0)\) on the equator while your vector points at \((0, 0, 1)\) at the North Pole.

### Why Dot Products with Vertices Aren't Enough

* **Distance vs. Enclosure:** A dot product $\mathbf{d} \cdot \mathbf{v}_i$ only measures how close $\mathbf{d}$ is to each individual corner. It never checks whether $\mathbf{d}$ is surrounded by the three corners.

* **What You Need Instead:** To verify that $\mathbf{d}$ actually passes inside the spherical triangle, you must check which side of each triangle edge $\mathbf{d}$ falls on using the scalar triple product test from earlier:
$$
\mathbf{d} \cdot (\mathbf{v}_0 \times \mathbf{v}_1)), (\mathbf{d} \cdot (\mathbf{v}_1 \times \mathbf{v}_2)), and (\mathbf{d} \cdot (\mathbf{v}_2 \times \mathbf{v}_0))
$$
must all share the same sign).

---

> **If I were to match up an icosahedron to the earth surface with the first triangle having a vertex at the north pole, what would the data set be in lat-lon**

A regular icosahedron aligned with the Earth's poles has **12 vertices** distributed across **4 exact latitude tiers**: the North Pole, two mid-latitude rings at **±26.5651°**, and the South Pole.

Because one vertex is fixed at the North Pole, the geometry locks all other latitudes into place, leaving only one degree of freedom: your starting **longitude rotation** (set to **0°** at the Prime Meridian below).

### The 12 Vertices (Latitude, Longitude)

In a standard polar-aligned icosahedron, the northern ring sits at $\arctan(1/2) \approx 26.565051^\circ\text{ N}$ spaced every $72^\circ$, and the southern ring sits at $-26.565051^\circ\text{ S}$ staggered by $36^\circ$:

| Vertex ID | Region | Latitude (°) | Longitude (°) |
| :--- | :--- | :--- | :--- |
| **V0** | North Pole | `90.000000` | `0.000000` |
| **V1** | North Ring | `26.565051` | `0.000000` |
| **V2** | North Ring | `26.565051` | `72.000000` |
| **V3** | North Ring | `26.565051` | `144.000000` |
| **V4** | North Ring | `26.565051` | `-144.000000` |
| **V5** | North Ring | `26.565051` | `-72.000000` |
| **V6** | South Ring | `-26.565051` | `36.000000` |
| **V7** | South Ring | `-26.565051` | `108.000000` |
| **V8** | South Ring | `-26.565051` | `180.000000` |
| **V9** | South Ring | `-26.565051` | `-108.000000` |
| **V10** | South Ring | `-26.565051` | `-36.000000` |
| **V11** | South Pole | `-90.000000` | `0.000000` |

*(Note: To rotate the grid around the Earth, add your desired offset angle $\lambda_0$ to every longitude value and wrap within $[-180^\circ, 180^\circ]$.)*

### The 20 Triangular Faces (Counterclockwise Winding)

Grouping these 12 vertices into the **20 equilateral faces** gives three distinct bands around the globe:

* **North Cap (5 Triangles):**
  * **T1:** `(V0, V1, V2)`
  * **T2:** `(V0, V2, V3)`
  * **T3:** `(V0, V3, V4)`
  * **T4:** `(V0, V4, V5)`
  * **T5:** `(V0, V5, V1)`
* **Equatorial Band (10 Alternating Triangles):**
  * **T6:** `(V1, V6, V2)`
  * **T7:** `(V2, V6, V7)`
  * **T8:** `(V2, V7, V3)`
  * **T9:** `(V3, V7, V8)`
  * **T10:** `(V3, V8, V4)`
  * **T11:** `(V4, V8, V9)`
  * **T12:** `(V4, V9, V5)`
  * **T13:** `(V5, V9, V10)`
  * **T14:** `(V5, V10, V1)`
  * **T15:** `(V1, V10, V6)`
* **South Cap (5 Triangles):**
  * **T16:** `(V11, V7, V6)`
  * **T17:** `(V11, V8, V7)`
  * **T18:** `(V11, V9, V8)`
  * **T19:** `(V11, V10, V9)`
  * **T20:** `(V11, V6, V10)`

### How This Connects to Your Vector Test

* **Convert Lat/Lon to 3D Unit Vectors:** Before running your scalar triple product test from earlier, convert each vertex $(\phi, \lambda)$ into 3D Cartesian coordinates on the unit sphere using $x = \cos\phi\cos\lambda$, $y = \cos\phi\sin\lambda$, and $z = \sin\phi$.
* **Fast Latitude Pre-Filter:** Because the rings sit strictly at $\pm 26.565^\circ$, you can instantly skip checking 15 of the 20 triangles just by checking the latitude of your target ray $\mathbf{d}$ (e.g., if $\text{lat}(\mathbf{d}) > 26.565^\circ$, it can only be inside **T1–T5**).

> *Would you like this dataset formatted as a GeoJSON / JSON / CSV file, or would you like to see the 3D unit vector coordinates for each of these 12 vertices?*

## interfaces

Can you create a browser based interface to the sphere quadtree index that is started with sqt --visual? It would start up an electron window and allow you to add, delete, and find points in the sphere quadtree index. The interface should display a 3D visualization of the sphere quadtree as part of the interface. It would update as you make actions on the sqt. You should be able to rotate it and zoom in and out. The interface should also allow you to select a triangle on the sphere and see all the points that are contained within that triangle.
In addition to the browser based interface, it can also run as an electron app that can be started with sqt --electron. The electron app should have the same functionality as the browser based interface, but it should also allow you to save and load sphere quadtree indexes from disk.
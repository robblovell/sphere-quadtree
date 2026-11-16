import * as THREE from "three";

import { coastlineSegments } from "./coastlineSegments";
import { GlobeControls } from "./GlobeControls";
import type { VisualBin, VisualPoint, VisualState } from "./VisualIndex";

declare global {
  interface Window {
    sqtDesktop?: {
      open(): Promise<boolean>;
      saveAs(): Promise<boolean>;
    };
  }
}

type Query = {
  binId?: string;
  kind: string;
  values: number[];
};

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof type))
    throw new Error(`Missing interface element: ${id}`);
  return found;
}

const globe = element("globe", HTMLDivElement);
const status = element("status", HTMLParagraphElement);
const fileLabel = element("file", HTMLParagraphElement);
const results = element("results", HTMLUListElement);
const resultsTitle = element("results-title", HTMLHeadingElement);
const selectionLabel = element("selection", HTMLParagraphElement);
const searchKind = element("search-kind", HTMLSelectElement);
const coordinates = element("coordinates", HTMLInputElement);
const searchHelp = element("search-help", HTMLParagraphElement);
const coastlineToggle = element("coastline-toggle", HTMLInputElement);
const token =
  location.hash.slice(1) || sessionStorage.getItem("sqt-token") || "";
sessionStorage.setItem("sqt-token", token);
history.replaceState(null, "", location.pathname);
if (!/^[0-9a-f]{64}$/.test(token))
  throw new Error("Missing visual session token");

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
  status.textContent = `Unable to initialize the 3D view: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
globe.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#101923");
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.up.set(0, 0, 1);
camera.position.set(2.5, -3, 2);
new GlobeControls(camera, renderer.domElement);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
let lines:
  THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined;
let markers: THREE.InstancedMesh | undefined;
let selectedMesh:
  THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
let faceIds: string[] = [];
let state: VisualState | undefined;
let query: Query | undefined;
let matching: VisualPoint[] = [];
let pending = 0;
let queue = Promise.resolve();

const resize = (): void => {
  const width = Math.max(globe.clientWidth, 1);
  const height = Math.max(globe.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(globe);
resize();
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sqt-Token": token,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : response.statusText;
    throw new Error(message);
  }
  return data as T;
}

async function loadCoastlines(): Promise<void> {
  const data = await request<unknown>("/ne_110m_coastline.geojson");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coastlineSegments(data), 3),
  );
  const coastline = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: "#39ff14", depthWrite: false }),
  );
  coastline.renderOrder = 1;
  coastline.visible = coastlineToggle.checked;
  scene.add(coastline);
  coastlineToggle.disabled = false;
  coastlineToggle.addEventListener("change", () => {
    coastline.visible = coastlineToggle.checked;
  });
}

function report(error: unknown): void {
  status.textContent = error instanceof Error ? error.message : String(error);
}

async function run(
  action: () => Promise<void>,
  background = false,
): Promise<void> {
  if (background && pending > 0) return;
  pending++;
  queue = queue.then(async () => {
    try {
      if (!background) status.textContent = "";
      await action();
    } catch (error) {
      report(error);
    } finally {
      pending--;
    }
  });
  await queue;
}

function geometryFor(
  bin: VisualBin,
  positions: number[],
  ids?: string[],
): void {
  const [a, b, c] = bin.vertices.map((vertex) =>
    new THREE.Vector3(...vertex).normalize(),
  );
  const emit = (
    x: THREE.Vector3,
    y: THREE.Vector3,
    z: THREE.Vector3,
    depth: number,
  ): void => {
    if (depth === 0) {
      for (const point of [x, y, z])
        positions.push(point.x * 1.001, point.y * 1.001, point.z * 1.001);
      ids?.push(bin.id);
      return;
    }
    const xy = x.clone().add(y).normalize();
    const yz = y.clone().add(z).normalize();
    const zx = z.clone().add(x).normalize();
    emit(x, xy, zx, depth - 1);
    emit(xy, y, yz, depth - 1);
    emit(zx, yz, z, depth - 1);
    emit(xy, yz, zx, depth - 1);
  };
  emit(a, b, c, 2);
}

function draw(): void {
  if (!state) return;
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  if (lines) {
    scene.remove(lines);
    lines.geometry.dispose();
    lines.material.dispose();
  }
  if (markers) {
    scene.remove(markers);
    markers.geometry.dispose();
    (markers.material as THREE.Material).dispose();
  }
  if (selectedMesh) {
    scene.remove(selectedMesh);
    selectedMesh.geometry.dispose();
    selectedMesh.material.dispose();
    selectedMesh = undefined;
  }
  faceIds = [];
  const positions: number[] = [];
  const edges: number[] = [];
  for (const bin of state.bins) {
    geometryFor(bin, positions, faceIds);
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Vector3(...bin.vertices[i]);
      const b = new THREE.Vector3(...bin.vertices[(i + 1) % 3]);
      for (let j = 0; j < 4; j++) {
        const from = a
          .clone()
          .lerp(b, j / 4)
          .normalize()
          .multiplyScalar(1.004);
        const to = a
          .clone()
          .lerp(b, (j + 1) / 4)
          .normalize()
          .multiplyScalar(1.004);
        edges.push(...from.toArray(), ...to.toArray());
      }
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  surface.computeBoundingSphere();
  mesh = new THREE.Mesh(
    surface,
    new THREE.MeshBasicMaterial({ color: "#214454", side: THREE.DoubleSide }),
  );
  scene.add(mesh);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(edges, 3),
  );
  lines = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: "#83b4c3" }),
  );
  scene.add(lines);
  const selected = state.bins.find((bin) => bin.id === query?.binId);
  if (selected) {
    const selectedPositions: number[] = [];
    geometryFor(selected, selectedPositions);
    const selectedGeometry = new THREE.BufferGeometry();
    selectedGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        selectedPositions.map((value) => value * 1.003),
        3,
      ),
    );
    selectedMesh = new THREE.Mesh(
      selectedGeometry,
      new THREE.MeshBasicMaterial({ color: "#e9ab52", side: THREE.DoubleSide }),
    );
    scene.add(selectedMesh);
  }
  const markerGeometry = new THREE.SphereGeometry(0.0035, 8, 6);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  markers = new THREE.InstancedMesh(
    markerGeometry,
    markerMaterial,
    state.points.length,
  );
  const found = new Set(matching.map((point) => point.id));
  const transform = new THREE.Object3D();
  state.points.forEach((point, index) => {
    const lat = (point.lat * Math.PI) / 180;
    const lon = (point.lon * Math.PI) / 180;
    transform.position
      .set(
        Math.cos(lat) * Math.cos(lon),
        Math.cos(lat) * Math.sin(lon),
        Math.sin(lat),
      )
      .multiplyScalar(1.015);
    transform.updateMatrix();
    markers?.setMatrixAt(index, transform.matrix);
    markers?.setColorAt(
      index,
      new THREE.Color(found.has(point.id) ? "#ffb84d" : "#7fb8ce"),
    );
  });
  markers.instanceMatrix.needsUpdate = true;
  scene.add(markers);
}

function renderResults(): void {
  results.replaceChildren();
  resultsTitle.textContent = `Points (${matching.length}${state ? ` / ${state.points.length}` : ""})`;
  selectionLabel.textContent = query?.binId
    ? `Selected triangle: ${query.binId}`
    : query
      ? `Search: ${query.kind}`
      : "No triangle selected.";
  for (const point of matching) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = `${point.id}: ${point.lat}, ${point.lon}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${point.id}`);
    remove.addEventListener(
      "click",
      () =>
        void run(async () => {
          const updated = await request<VisualState>("/api/delete", {
            id: point.id,
          });
          await applyState(updated);
        }),
    );
    item.append(text, remove);
    results.append(item);
  }
}

async function applyState(next: VisualState): Promise<void> {
  state = next;
  fileLabel.textContent = next.file;
  if (query?.binId && !next.bins.some((bin) => bin.id === query?.binId)) {
    query = undefined;
    status.textContent =
      "The selected triangle changed; select a triangle again.";
  }
  matching = query
    ? await request<VisualPoint[]>("/api/find", query)
    : next.points;
  draw();
  renderResults();
}

async function refresh(): Promise<void> {
  const next = await request<VisualState>("/api/state");
  if (!state || state.revision !== next.revision || state.file !== next.file)
    await applyState(next);
}

element("add-form", HTMLFormElement).addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    const id = element("point-id", HTMLInputElement);
    const lat = element("latitude", HTMLInputElement);
    const lon = element("longitude", HTMLInputElement);
    const next = await request<VisualState>("/api/add", {
      id: id.value,
      lat: Number(lat.value),
      lon: Number(lon.value),
    });
    await applyState(next);
    id.value = "";
  });
});

const help: Record<string, string> = {
  box: "south west north east",
  square: "lat1 lon1 lat2 lon2 lat3 lon3 lat4 lon4 (ordered vertices)",
  triangle: "lat1 lon1 lat2 lon2 lat3 lon3",
};
searchKind.addEventListener("change", () => {
  searchHelp.textContent = help[searchKind.value];
});
element("find-form", HTMLFormElement).addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    const text = coordinates.value.trim();
    const parts = text ? text.split(/[\s,]+/) : [];
    if (parts.some((part) => part.length === 0))
      throw new Error("Coordinates must be numbers");
    const values = parts.map(Number);
    if (values.some((value) => !Number.isFinite(value)))
      throw new Error("Coordinates must be numbers");
    const next: Query = { kind: searchKind.value, values };
    const found = await request<VisualPoint[]>("/api/find", next);
    query = next;
    matching = found;
    draw();
    renderResults();
  });
});
element("clear", HTMLButtonElement).addEventListener(
  "click",
  () =>
    void run(async () => {
      query = undefined;
      if (state) await applyState(state);
    }),
);

let pointerStart: [number, number] | undefined;
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button === 0) pointerStart = [event.clientX, event.clientY];
});
renderer.domElement.addEventListener("pointercancel", () => {
  pointerStart = undefined;
});
renderer.domElement.addEventListener("pointerup", (event) => {
  const start = pointerStart;
  pointerStart = undefined;
  if (
    !start ||
    Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 4 ||
    !mesh
  )
    return;
  const bounds = renderer.domElement.getBoundingClientRect();
  mouse.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(mesh)[0];
  const id =
    hit?.faceIndex === undefined || hit.faceIndex === null
      ? undefined
      : faceIds[hit.faceIndex];
  if (id)
    void run(async () => {
      const next: Query = { binId: id, kind: "bin", values: [] };
      const found = await request<VisualPoint[]>("/api/find", next);
      query = next;
      matching = found;
      draw();
      renderResults();
    });
});

if (window.sqtDesktop) {
  element("desktop-actions", HTMLDivElement).hidden = false;
  element("open", HTMLButtonElement).addEventListener(
    "click",
    () =>
      void run(async () => {
        if (await window.sqtDesktop?.open()) {
          query = undefined;
          await applyState(await request<VisualState>("/api/state"));
        }
      }),
  );
  element("save", HTMLButtonElement).addEventListener(
    "click",
    () =>
      void run(async () => {
        if (await window.sqtDesktop?.saveAs())
          await applyState(await request<VisualState>("/api/state"));
      }),
  );
}

void run(async () => {
  await loadCoastlines();
  await refresh();
});
setInterval(() => void run(refresh, true), 2000);

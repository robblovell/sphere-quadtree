import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSync } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("flat-file CLI", () => {
  const directory = mkdtempSync(join(tmpdir(), "spherequadtree-test-"));
  const cli = join(directory, "cli.mjs");
  const api = join(directory, "index.mjs");
  const file = join(directory, "index.json");
  const run = (...args: string[]): string =>
    execFileSync(process.execPath, [cli, "--file", file, ...args], {
      encoding: "utf8",
    }).trim();

  beforeAll(() => {
    buildSync({
      bundle: true,
      entryPoints: ["src/cli.ts"],
      format: "esm",
      outfile: cli,
      platform: "node",
    });
    buildSync({
      bundle: true,
      entryPoints: ["src/index.ts"],
      format: "esm",
      outfile: api,
      platform: "node",
    });
  });
  afterAll(() => rmSync(directory, { force: true, recursive: true }));

  it("persists add, find, and delete across separate processes", () => {
    expect(JSON.parse(run("add", "home", "10", "10"))).toEqual({
      id: "home",
      lat: 10,
      lon: 10,
    });
    run("add", "outside", "-20", "-20");
    const query = ["find", "0", "0", "0", "90", "90", "0"];
    expect(JSON.parse(run(...query))).toEqual([
      { id: "home", lat: 10, lon: 10 },
    ]);
    expect(JSON.parse(run("delete", "home"))).toEqual({ deleted: "home" });
    expect(JSON.parse(run(...query))).toEqual([]);
    expect(
      JSON.parse(readFileSync(file, "utf8")).roots[0].triangle.normals,
    ).toHaveLength(3);
  });

  it("supports square and bounding-box searches, including antimeridian boxes", () => {
    run("add", "date", "0", "180");
    const square = [
      "find",
      "square",
      "-10",
      "170",
      "-10",
      "-170",
      "10",
      "-170",
      "10",
      "170",
    ];
    expect(
      JSON.parse(run(...square)).map((point: { id: string }) => point.id),
    ).toEqual(["date"]);
    expect(
      JSON.parse(run("find", "box", "-10", "170", "10", "-170")).map(
        (point: { id: string }) => point.id,
      ),
    ).toEqual(["date"]);
  });

  it("runs an interactive session, continues after errors, and stops at quit", () => {
    const result = spawnSync(
      process.execPath,
      [cli, "--interactive", "--file", file],
      {
        encoding: "utf8",
        input: [
          "add session 20 20",
          "add bad 999 0",
          "find box 10 10 30 30",
          "find 0 0 0 90 90 0",
          "find square 10 10 10 30 30 30 30 10",
          "delete session",
          "quit",
          "add afterquit 0 0",
          "",
        ].join("\n"),
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/Latitude/);
    const output = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(output).toEqual([
      { id: "session", lat: 20, lon: 20 },
      [{ id: "session", lat: 20, lon: 20 }],
      [{ id: "session", lat: 20, lon: 20 }],
      [{ id: "session", lat: 20, lon: 20 }],
      { deleted: "session" },
    ]);
    expect(
      JSON.parse(run("find", "box", "-90", "-180", "90", "180")).map(
        (point: { id: string }) => point.id,
      ),
    ).not.toContain("afterquit");
  });

  it("uses the default file for both the wrapper API and the CLI", () => {
    const script = `
      import { Point, SphereQuadtreeIndex } from ${JSON.stringify(pathToFileURL(api).href)};
      new SphereQuadtreeIndex().add(new Point("default", 12, 34));
    `;
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: directory,
    });
    const result = execFileSync(
      process.execPath,
      [cli, "find", "box", "0", "0", "20", "40"],
      {
        cwd: directory,
        encoding: "utf8",
      },
    );
    expect(JSON.parse(result)).toEqual([{ id: "default", lat: 12, lon: 34 }]);
  });

  it("returns rounded coordinates in separate CLI processes", () => {
    const point = JSON.parse(
      run("add", "precise", "49.2827123456", "-123.120712346"),
    );
    expect(point).toEqual({
      id: "precise",
      lat: 49.28271235,
      lon: -123.12071235,
    });
    expect(
      JSON.parse(
        run(
          "find",
          "box",
          "49.28271235",
          "-123.12071235",
          "49.28271235",
          "-123.12071235",
        ),
      ),
    ).toEqual([point]);
    expect(JSON.parse(run("delete", "precise"))).toEqual({
      deleted: "precise",
    });
  });

  it("generates fake data in batches while retaining existing records", () => {
    const fakeFile = join(directory, "fake.json");
    const invoke = (...args: string[]): string =>
      execFileSync(process.execPath, [cli, "--file", fakeFile, ...args], {
        encoding: "utf8",
      }).trim();
    invoke("add", "original", "0", "0");
    expect(JSON.parse(invoke("--fake-data", "150"))).toEqual({ added: 150 });
    expect(JSON.parse(invoke("--fake-data", "25"))).toEqual({ added: 25 });
    const points: Array<{ id: string; lat: number; lon: number }> = JSON.parse(
      invoke("find", "box", "-90", "-180", "90", "180"),
    );
    expect(points).toHaveLength(176);
    expect(points.find((point) => point.id === "original")).toBeDefined();
    expect(new Set(points.map((point) => point.id)).size).toBe(176);
    expect(points.filter((point) => point.id.startsWith("fake-"))).toHaveLength(
      175,
    );
    const before = readFileSync(fakeFile, "utf8");
    expect(JSON.parse(invoke("--fake-data", "0"))).toEqual({ added: 0 });
    expect(readFileSync(fakeFile, "utf8")).toBe(before);
    expect(
      JSON.parse(
        execFileSync(
          process.execPath,
          [cli, "--fake-data", "1", "--file", fakeFile],
          { encoding: "utf8" },
        ),
      ),
    ).toEqual({ added: 1 });
  });

  it("rejects malformed fake-data requests without changing the index", () => {
    const fakeFile = join(directory, "fake.json");
    const before = readFileSync(fakeFile, "utf8");
    for (const args of [
      ["--fake-data"],
      ["--fake-data", "-1"],
      ["--fake-data", "1.5"],
      ["--fake-data", "1e2"],
      ["--fake-data", "9007199254740992"],
      ["--fake-data", "1", "extra"],
      ["--fake-data", "1", "--interactive"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [cli, "--file", fakeFile, ...args],
        { encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Point count|Usage/);
      expect(readFileSync(fakeFile, "utf8")).toBe(before);
    }
  });

  it("accepts each fake-data distribution", () => {
    const fakeFile = join(directory, "distributions.json");
    for (const distribution of ["random", "chunky", "equator", "cities"]) {
      expect(
        JSON.parse(
          execFileSync(
            process.execPath,
            [cli, "--file", fakeFile, "--fake-data", "2", distribution],
            { encoding: "utf8" },
          ),
        ),
      ).toEqual({ added: 2 });
    }
    const invalid = spawnSync(
      process.execPath,
      [cli, "--file", fakeFile, "--fake-data", "1", "unknown"],
      { encoding: "utf8" },
    );
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/Usage/);
  });

  it("reports errors without overwriting the file", () => {
    const before = readFileSync(file, "utf8");
    const invalid = spawnSync(
      process.execPath,
      [cli, "--file", file, "add", "bad", "NaN", "0"],
      { encoding: "utf8" },
    );
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/Invalid coordinate/);
    expect(readFileSync(file, "utf8")).toBe(before);
    writeFileSync(file, "{invalid");
    const corrupt = spawnSync(
      process.execPath,
      [cli, "--file", file, "add", "bad", "0", "0"],
      { encoding: "utf8" },
    );
    expect(corrupt.status).not.toBe(0);
    expect(readFileSync(file, "utf8")).toBe("{invalid");
  });
});

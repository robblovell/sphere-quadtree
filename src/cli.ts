#!/usr/bin/env node
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BoundingBox } from "./BoundingBox";
import {
  generateFakePoints,
  type FakeDataDistribution,
} from "./generateFakePoints";
import { Point } from "./Point";
import { SphereQuadtreeIndex } from "./SphereQuadtreeIndex";
import { Square } from "./Square";
import { Triangle } from "./Triangle";
import { startVisualServer } from "./visual/startVisualServer";

const usage = `Usage: sqt [--file path] [--interactive]
       sqt [--file path] --visual | --electron
       sqt [--file path] --fake-data <count> [random|chunky|equator|cities]
       sqt [--file path] add <id> <lat> <lon>
       sqt [--file path] delete <id>
       sqt [--file path] find <lat1> <lon1> <lat2> <lon2> <lat3> <lon3>
       sqt [--file path] find square <lat1> <lon1> <lat2> <lon2> <lat3> <lon3> <lat4> <lon4>
       sqt [--file path] find box <south> <west> <north> <east>`;

const coordinate = (value: string): number => {
  if (value.trim() === "" || !Number.isFinite(Number(value)))
    throw new Error(`Invalid coordinate: ${value}`);
  return Number(value);
};

const execute = (tree: SphereQuadtreeIndex, args: string[]): void => {
  const [command, ...values] = args;
  if (command === "add" && values.length === 3) {
    const point = new Point(
      values[0],
      coordinate(values[1]),
      coordinate(values[2]),
    );
    tree.add(point);
    console.log(JSON.stringify(point));
  } else if (command === "delete" && values.length === 1) {
    if (!tree.delete(values[0]))
      throw new Error(`Point id not found: ${values[0]}`);
    console.log(JSON.stringify({ deleted: values[0] }));
  } else if (command === "find") {
    if (values[0] === "box" && values.length === 5) {
      console.log(
        JSON.stringify(
          tree.find(
            new BoundingBox(
              coordinate(values[1]),
              coordinate(values[2]),
              coordinate(values[3]),
              coordinate(values[4]),
            ),
          ),
        ),
      );
    } else {
      const square = values[0] === "square";
      const coordinates = square ? values.slice(1) : values;
      if (coordinates.length !== (square ? 8 : 6)) throw new Error(usage);
      const points = Array.from(
        { length: square ? 4 : 3 },
        (_, i) =>
          new Point(
            "vertex",
            coordinate(coordinates[i * 2]),
            coordinate(coordinates[i * 2 + 1]),
          ).vector,
      );
      const region = square
        ? new Square(points[0], points[1], points[2], points[3])
        : new Triangle(points[0], points[1], points[2]);
      console.log(JSON.stringify(tree.find(region)));
    }
  } else {
    throw new Error(usage);
  }
};

try {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let mode: "interactive" | "visual" | "electron" | "fake-data" | undefined;
  let fakeCount: number | undefined;
  let fakeDistribution: FakeDataDistribution = "random";
  while (
    [
      "--file",
      "--interactive",
      "--visual",
      "--electron",
      "--fake-data",
    ].includes(args[0])
  ) {
    const option = args.shift();
    if (option === "--file") {
      if (file !== undefined || !args[0] || args[0].startsWith("--"))
        throw new Error(usage);
      file = args.shift();
    } else {
      if (mode) throw new Error(usage);
      if (option === "--fake-data") {
        const value = args.shift();
        if (
          !value ||
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value))
        ) {
          throw new Error("Point count must be a non-negative safe integer");
        }
        fakeCount = Number(value);
        mode = "fake-data";
      } else {
        mode =
          option === "--interactive"
            ? "interactive"
            : option === "--visual"
              ? "visual"
              : "electron";
      }
    }
  }
  const tree = new SphereQuadtreeIndex({ file });
  if (mode === "fake-data") {
    if (
      args.length > 1 ||
      fakeCount === undefined ||
      (args.length === 1 &&
        !["random", "chunky", "equator", "cities"].includes(args[0]))
    )
      throw new Error(usage);
    if (args.length === 1) fakeDistribution = args[0] as FakeDataDistribution;
    tree.addMany(generateFakePoints(fakeCount, Math.random, fakeDistribution));
    console.log(JSON.stringify({ added: fakeCount }));
  } else if (mode === "visual") {
    if (args.length) throw new Error(usage);
    const assets = join(dirname(fileURLToPath(import.meta.url)), "visual");
    const visual = await startVisualServer(file, assets);
    console.log(`Visual interface: ${visual.url}`);
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "rundll32"
          : "xdg-open";
    const commandArgs =
      process.platform === "win32"
        ? ["url.dll,FileProtocolHandler", visual.url]
        : [visual.url];
    const opener = spawn(command, commandArgs, { stdio: "ignore" });
    opener.on("error", (error) =>
      console.error(`Unable to open browser: ${error.message}`),
    );
    opener.on("close", (code) => {
      if (code !== 0 && code !== null)
        console.error(
          `Unable to open browser (exit ${code}); open the URL above.`,
        );
    });
  } else if (mode === "electron") {
    if (args.length) throw new Error(usage);
    const executable: unknown = createRequire(import.meta.url)("electron");
    if (typeof executable !== "string")
      throw new Error("Electron executable is unavailable");
    const main = join(dirname(fileURLToPath(import.meta.url)), "electron.js");
    const child = spawn(
      executable,
      [main, ...(file === undefined ? [] : ["--file", file])],
      { stdio: "inherit" },
    );
    child.on("error", (error) => {
      console.error(`Unable to start Electron: ${error.message}`);
      process.exitCode = 1;
    });
    child.on("close", (code, signal) => {
      if (code !== 0) {
        console.error(
          `Electron exited ${signal ? `on signal ${signal}` : `with code ${code}`}`,
        );
        process.exitCode = 1;
      }
    });
  } else if (mode === "interactive") {
    if (args.length) throw new Error(usage);
    const terminal = !!process.stdin.isTTY && !!process.stdout.isTTY;
    const session = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal,
    });
    let closed = false;
    if (terminal) {
      session.setPrompt("sqt> ");
      session.prompt();
    }
    session.on("line", (line) => {
      if (closed) return;
      const tokens = line.trim().split(/\s+/);
      if (tokens.length === 1 && tokens[0] === "quit") {
        closed = true;
        session.close();
        return;
      }
      if (line.trim()) {
        try {
          execute(tree, tokens);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
        }
      }
      if (terminal) session.prompt();
    });
  } else {
    execute(tree, args);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

#!/usr/bin/env node
import { createInterface } from "node:readline";

import { BoundingBox } from "./BoundingBox";
import { Point } from "./Point";
import { SphereQuadtreeIndex } from "./SphereQuadtreeIndex";
import { Square } from "./Square";
import { Triangle } from "./Triangle";

const usage = `Usage: sqt [--file path] [--interactive]
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
  let interactive = false;
  while (args[0] === "--file" || args[0] === "--interactive") {
    if (args.shift() === "--file") {
      if (file !== undefined || !args[0] || args[0].startsWith("--"))
        throw new Error(usage);
      file = args.shift();
    } else {
      if (interactive) throw new Error(usage);
      interactive = true;
    }
  }
  const tree = new SphereQuadtreeIndex({ file });
  if (interactive) {
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

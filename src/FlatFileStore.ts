import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { SphereQuadtree } from "./SphereQuadtree";
import type { TreeData } from "./SphereQuadtree";

export class FlatFileStore {
  constructor(readonly path: string) {}

  load(): SphereQuadtree {
    let contents: string;
    try {
      contents = readFileSync(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return new SphereQuadtree();
      throw error;
    }
    return SphereQuadtree.fromJSON(JSON.parse(contents) as TreeData);
  }

  save(tree: SphereQuadtree): void {
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(tree), { flag: "wx" });
    try {
      renameSync(temporary, this.path);
    } catch (error) {
      unlinkSync(temporary);
      throw error;
    }
  }
}

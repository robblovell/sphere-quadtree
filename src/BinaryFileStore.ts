import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { SphereQuadtree } from "./SphereQuadtree";
import type { LegacyTreeData, TreeData } from "./SphereQuadtree";

const HEADER = Buffer.from("SQT-BIN1", "ascii");

export class BinaryFileStore {
  constructor(readonly path: string) {}

  load(): SphereQuadtree {
    let contents: Buffer;
    try {
      contents = readFileSync(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return new SphereQuadtree();
      throw error;
    }
    if (
      contents.length < HEADER.length ||
      !contents.subarray(0, HEADER.length).equals(HEADER)
    )
      throw new Error("Invalid binary quadtree file");
    const payload = contents.subarray(HEADER.length);
    if (payload.length < 4) throw new Error("Invalid binary quadtree file");
    const length = payload.readUInt32BE(0);
    if (length !== payload.length - 4)
      throw new Error("Invalid binary quadtree file");
    return SphereQuadtree.fromJSON(
      JSON.parse(gunzipSync(payload.subarray(4)).toString("utf8")) as
        TreeData | LegacyTreeData,
    );
  }

  save(tree: SphereQuadtree): void {
    const compressed = gzipSync(Buffer.from(JSON.stringify(tree), "utf8"));
    const payload = Buffer.allocUnsafe(4 + compressed.length);
    payload.writeUInt32BE(compressed.length, 0);
    compressed.copy(payload, 4);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, Buffer.concat([HEADER, payload]), { flag: "wx" });
    try {
      renameSync(temporary, this.path);
    } catch (error) {
      unlinkSync(temporary);
      throw error;
    }
  }
}

import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { join } from "node:path";

import { VisualIndex } from "./VisualIndex";

export type VisualServer = {
  close(): Promise<void>;
  index: VisualIndex;
  server: Server;
  url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 16_384) throw new Error("Request body is too large");
    chunks.push(bytes);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!isRecord(value)) throw new Error("Request body must be an object");
  return value;
}

export async function startVisualServer(
  file: string | undefined,
  assets: string,
): Promise<VisualServer> {
  const index = new VisualIndex(file);
  const token = randomBytes(32).toString("hex");
  let host = "";
  const json = (
    response: ServerResponse,
    status: number,
    value: unknown,
  ): void => {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(value));
  };
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== `http://${host}`)
    ) {
      json(response, 403, { error: "Forbidden origin" });
      return;
    }
    const path = new URL(request.url ?? "/", `http://${host}`).pathname;
    const staticFiles: Record<string, [string, string]> = {
      "/": ["index.html", "text/html; charset=utf-8"],
      "/ne_110m_coastline.geojson": [
        "ne_110m_coastline.geojson",
        "application/geo+json; charset=utf-8",
      ],
      "/renderer.js": ["renderer.js", "text/javascript; charset=utf-8"],
      "/style.css": ["style.css", "text/css; charset=utf-8"],
    };
    if (request.method === "GET" && staticFiles[path]) {
      try {
        const [name, contentType] = staticFiles[path];
        const content = await readFile(join(assets, name));
        response.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        });
        response.end(content);
      } catch (error) {
        json(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    const provided = request.headers["x-sqt-token"];
    if (
      typeof provided !== "string" ||
      !/^[0-9a-f]{64}$/.test(provided) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    ) {
      json(response, 403, { error: "Unauthorized" });
      return;
    }
    try {
      if (request.method === "GET" && path === "/api/state") {
        json(response, 200, index.state());
      } else if (request.method === "POST") {
        const body = await readJson(request);
        if (
          path === "/api/add" &&
          typeof body.id === "string" &&
          typeof body.lat === "number" &&
          typeof body.lon === "number"
        ) {
          index.add(body.id, body.lat, body.lon);
          json(response, 200, index.state());
        } else if (path === "/api/delete" && typeof body.id === "string") {
          index.delete(body.id);
          json(response, 200, index.state());
        } else if (
          path === "/api/find" &&
          typeof body.kind === "string" &&
          Array.isArray(body.values) &&
          body.values.every(
            (value) => typeof value === "number" && Number.isFinite(value),
          ) &&
          (body.binId === undefined || typeof body.binId === "string")
        ) {
          json(response, 200, index.find(body.kind, body.values, body.binId));
        } else {
          json(response, 400, { error: "Invalid request" });
        }
      } else {
        json(response, 404, { error: "Not found" });
      }
    } catch (error) {
      json(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to determine visual server address");
  }
  host = `127.0.0.1:${address.port}`;
  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    index,
    server,
    url: `http://${host}/#${token}`,
  };
}

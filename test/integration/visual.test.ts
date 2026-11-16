import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSync } from "esbuild";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FlatFileStore } from "../../src/FlatFileStore";
import { Point } from "../../src/Point";
import { startVisualServer } from "../../src/visual/startVisualServer";
import type { VisualServer } from "../../src/visual/startVisualServer";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe("visual interface", () => {
  const directory = mkdtempSync(join(tmpdir(), "sqt-visual-test-"));
  const assets = join(directory, "visual");
  const file = join(directory, "index.json");
  let server: VisualServer;
  let origin: string;
  let token: string;

  beforeAll(async () => {
    mkdirSync(assets);
    copyFileSync("src/visual/index.html", join(assets, "index.html"));
    copyFileSync("src/visual/style.css", join(assets, "style.css"));
    copyFileSync(
      "src/visual/ne_110m_coastline.geojson",
      join(assets, "ne_110m_coastline.geojson"),
    );
    buildSync({
      bundle: true,
      entryPoints: ["src/visual/renderer.ts"],
      format: "esm",
      outfile: join(assets, "renderer.js"),
      platform: "browser",
    });
    server = await startVisualServer(file, assets);
    const url = new URL(server.url);
    origin = url.origin;
    token = url.hash.slice(1);
  });
  afterAll(async () => {
    await server?.close();
    rmSync(directory, { force: true, recursive: true });
  });

  it("requires a session token and rejects foreign origins", async () => {
    expect((await fetch(`${origin}/api/state`)).status).toBe(403);
    expect(
      (
        await fetch(`${origin}/api/state`, {
          headers: { "X-Sqt-Token": "a".repeat(63) + "é" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${origin}/api/state`, {
          headers: { "X-Sqt-Token": token, Origin: "https://example.com" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${origin}/api/state`, {
          headers: { "X-Sqt-Token": token },
        })
      ).status,
    ).toBe(200);
    const page = await fetch(origin);
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect((await fetch(`${origin}/../package.json`)).status).toBe(403);
    const coastlines = await fetch(`${origin}/ne_110m_coastline.geojson`);
    expect(coastlines.status).toBe(200);
    expect(coastlines.headers.get("content-type")).toContain(
      "application/geo+json",
    );
    expect((await coastlines.json()).features).toHaveLength(134);
  });

  it("handles API mutations and searches with explicit errors", async () => {
    const post = (path: string, value: unknown): Promise<Response> =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sqt-Token": token },
        body: JSON.stringify(value),
      });
    expect(
      (await post("/api/add", { id: "api", lat: 10, lon: 10 })).status,
    ).toBe(200);
    expect(
      (await post("/api/add", { id: "api", lat: 10, lon: 10 })).status,
    ).toBe(400);
    expect(
      (await post("/api/add", { id: "invalid", lat: 91, lon: 0 })).status,
    ).toBe(400);
    expect(
      (await post("/api/find", { kind: "box", values: [0, 0, 20, 20] })).status,
    ).toBe(200);
    expect(
      (await post("/api/find", { kind: "bin", values: [], binId: "0.4" }))
        .status,
    ).toBe(400);
    expect((await post("/api/delete", { id: "missing" })).status).toBe(400);
    expect((await post("/api/delete", { id: "api" })).status).toBe(200);
  });

  it.skipIf(process.platform === "win32")(
    "starts --visual with the requested index",
    async () => {
      const cli = join(directory, "cli.mjs");
      const bin = join(directory, "bin");
      const cliFile = join(directory, "cli-index.json");
      mkdirSync(bin);
      const opener = join(
        bin,
        process.platform === "darwin" ? "open" : "xdg-open",
      );
      writeFileSync(opener, "#!/bin/sh\nexit 0\n");
      chmodSync(opener, 0o755);
      buildSync({
        bundle: true,
        entryPoints: ["src/cli.ts"],
        format: "esm",
        outfile: cli,
        platform: "node",
      });
      const child = spawn(
        process.execPath,
        [cli, "--file", cliFile, "--visual"],
        {
          env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      try {
        const url = await new Promise<string>((resolve, reject) => {
          let output = "";
          child.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
            const match = output.match(/Visual interface: (http:\/\/[^\s]+)/);
            if (match) resolve(match[1]);
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            reject(new Error(`CLI exited unexpectedly: ${code}`)),
          );
        });
        const parsed = new URL(url);
        const response = await fetch(`${parsed.origin}/api/state`, {
          headers: { "X-Sqt-Token": parsed.hash.slice(1) },
        });
        expect((await response.json()).file).toBe(cliFile);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
          await new Promise<void>((resolve) =>
            child.once("close", () => resolve()),
          );
        }
      }
    },
    30_000,
  );

  it.skipIf(process.platform === "win32")(
    "passes the selected file to the Electron entry point",
    () => {
      const location = join(directory, "electron-cli");
      const modules = join(location, "node_modules", "electron");
      mkdirSync(modules, { recursive: true });
      const cli = join(location, "cli.mjs");
      const executable = join(location, "electron-stub.cjs");
      const argsFile = join(location, "args.json");
      writeFileSync(join(modules, "package.json"), '{"main":"index.cjs"}');
      writeFileSync(
        join(modules, "index.cjs"),
        `module.exports = ${JSON.stringify(executable)};`,
      );
      writeFileSync(
        executable,
        `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\n`,
      );
      chmodSync(executable, 0o755);
      buildSync({
        bundle: true,
        entryPoints: ["src/cli.ts"],
        format: "esm",
        outfile: cli,
        platform: "node",
      });
      execFileSync(process.execPath, [cli, "--electron", "--file", file]);
      expect(JSON.parse(readFileSync(argsFile, "utf8"))).toEqual([
        join(realpathSync(location), "electron.js"),
        "--file",
        file,
        "--persistence",
        "file",
        "binary",
      ]);
    },
  );

  describe.skipIf(!existsSync(chrome))("in a real browser", () => {
    let browser: Browser;
    beforeAll(async () => {
      browser = await chromium.launch({
        args: ["--enable-unsafe-swiftshader"],
        executablePath: chrome,
        headless: true,
      });
    });
    afterAll(async () => {
      await browser?.close();
    });

    it("reports coastline loading errors without disabling the index", async () => {
      const page = await browser.newPage();
      await page.route("**/ne_110m_coastline.geojson", (route) =>
        route.fulfill({
          contentType: "application/json",
          json: { error: "Coastline asset unavailable" },
          status: 500,
        }),
      );
      await page.goto(server.url);
      await page.getByText("Coastline asset unavailable").waitFor();
      await page.waitForFunction(() =>
        document
          .querySelector("#results-title")
          ?.textContent?.includes("0 / 0"),
      );
      expect(
        await page.getByLabel("Show continent coastlines").isDisabled(),
      ).toBe(true);
      expect(
        await page.getByText("Coastline asset unavailable").isVisible(),
      ).toBe(true);
      await page.close();
    }, 15_000);

    it("renders, rotates, zooms, edits, searches, selects, and reloads", async () => {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 800 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.url);
      await page.waitForSelector("#globe canvas");
      await page.waitForFunction(() => {
        const toggle = document.querySelector("#coastline-toggle");
        return toggle instanceof HTMLInputElement && !toggle.disabled;
      });
      const canvas = page.locator("#globe canvas");
      const withCoastlines = await canvas.screenshot();
      await page.getByLabel("Show continent coastlines").uncheck();
      await page.waitForTimeout(100);
      const withoutCoastlines = await canvas.screenshot();
      expect(withCoastlines.equals(withoutCoastlines)).toBe(false);
      await page.getByLabel("Show continent coastlines").check();
      await page.waitForFunction(() =>
        document
          .querySelector("#results-title")
          ?.textContent?.includes("0 / 0"),
      );
      await page.locator("#point-id").fill("home");
      await page.locator("#latitude").fill("10");
      await page.locator("#longitude").fill("10");
      await page.locator("#add-form button").click();
      await page.getByText("home: 10, 10").waitFor();
      await page.locator("#coordinates").fill("0 0 20 20");
      await page.locator("#find-form button[type=submit]").click();
      expect(await page.locator("#results-title").innerText()).toContain(
        "1 / 1",
      );
      await page.locator("#search-kind").selectOption("triangle");
      await page.locator("#coordinates").fill("0 0 0 90 90 0");
      await page.locator("#find-form button[type=submit]").click();
      await page.getByText("Search: triangle").waitFor();
      expect(await page.locator("#results-title").innerText()).toContain(
        "1 / 1",
      );
      await page.locator("#search-kind").selectOption("square");
      await page.locator("#coordinates").fill("0 0 0 20 20 20 20 0");
      await page.locator("#find-form button[type=submit]").click();
      await page.getByText("Search: square").waitFor();
      expect(await page.locator("#results-title").innerText()).toContain(
        "1 / 1",
      );
      await page.locator("#coordinates").fill("0 0 wrong");
      await page.locator("#find-form button[type=submit]").click();
      await page.getByText("Coordinates must be numbers").waitFor();
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("Missing canvas bounds");
      const before = await canvas.screenshot();
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 80, y + 30, { steps: 5 });
      await page.mouse.up();
      await page.mouse.wheel(0, -250);
      const after = await canvas.screenshot();
      expect(before.equals(after)).toBe(false);
      await page.mouse.click(x, y);
      await page.waitForFunction(() =>
        document
          .querySelector("#selection")
          ?.textContent?.includes("Selected triangle:"),
      );
      await page.locator("#clear").click();
      await page.getByRole("button", { name: "Delete home" }).click();
      await page.waitForFunction(() =>
        document
          .querySelector("#results-title")
          ?.textContent?.includes("0 / 0"),
      );
      const store = new FlatFileStore(file);
      const tree = store.load();
      tree.add(new Point("external", 20, 20));
      store.save(tree);
      await page.getByText("external: 20, 20").waitFor({ timeout: 8000 });
      await page.reload();
      await page.getByText("external: 20, 20").waitFor();
      expect(errors).toEqual([]);
      await page.close();
    }, 30_000);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { _electron } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { VisualIndex } from "../../src/visual/VisualIndex";

describe.skipIf(process.env.SQT_ELECTRON_TEST !== "1")(
  "Electron interface",
  () => {
    let directory: string;
    beforeAll(() => {
      directory = mkdtempSync(join(tmpdir(), "sqt-electron-test-"));
    });
    afterAll(() => rmSync(directory, { force: true, recursive: true }));

    it("uses the shared interface and native open and save dialogs", async () => {
      const original = join(directory, "original.json");
      const saved = join(directory, "saved.json");
      const other = join(directory, "other.json");
      new VisualIndex(other).add("other", -10, -10);
      const executable: unknown = createRequire(import.meta.url)("electron");
      if (typeof executable !== "string")
        throw new Error("Missing Electron executable");
      const app = await _electron.launch({
        executablePath: executable,
        args: [resolve("dist/electron.js"), "--file", original],
      });
      try {
        const page = await app.firstWindow();
        await page.waitForSelector("#desktop-actions:not([hidden])");
        await page.waitForFunction(() => {
          const toggle = document.querySelector("#coastline-toggle");
          return toggle instanceof HTMLInputElement && !toggle.disabled;
        });
        expect(await page.evaluate(() => typeof window.require)).toBe(
          "undefined",
        );
        await page.locator("#point-id").fill("home");
        await page.locator("#latitude").fill("10");
        await page.locator("#longitude").fill("10");
        await page.locator("#add-form button").click();
        await page.getByText("home: 10, 10").waitFor();
        await app.evaluate(({ dialog }, path) => {
          dialog.showSaveDialog = async () => ({
            canceled: false,
            filePath: path,
          });
        }, saved);
        await page.locator("#save").click();
        await page.getByText(saved).waitFor();
        expect(
          new VisualIndex(saved).state().points.map((point) => point.id),
        ).toEqual(["home"]);
        await app.evaluate(({ dialog }, path) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [path],
          });
        }, other);
        await page.locator("#open").click();
        await page.getByText("other: -10, -10").waitFor();
        expect(await page.locator("#file").innerText()).toBe(other);
        await page.getByRole("button", { name: "Delete other" }).click();
        await page.waitForFunction(() =>
          document
            .querySelector("#results-title")
            ?.textContent?.includes("0 / 0"),
        );
        expect(new VisualIndex(other).state().points).toEqual([]);
        expect(new VisualIndex(saved).state().points).toHaveLength(1);
      } finally {
        await app.close();
      }
    }, 30_000);
  },
);

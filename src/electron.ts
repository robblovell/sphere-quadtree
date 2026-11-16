import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain } from "electron";

import type { Persistence } from "./SphereQuadtreeIndex";
import { startVisualServer } from "./visual/startVisualServer";

const entry = fileURLToPath(import.meta.url);
const directory = dirname(entry);
const entryIndex = process.argv.indexOf(entry);
if (entryIndex < 0) throw new Error("Unable to identify Electron entry point");
const args = process.argv.slice(entryIndex + 1);
let file: string | undefined;
let persistence: Persistence = "file binary";
while (args.length) {
  const option = args.shift();
  if (option === "--file" && file === undefined && args[0]) {
    file = args.shift();
  } else if (
    option === "--persistence" &&
    args.shift() === "file" &&
    (args[0] === "binary" || args[0] === "json")
  ) {
    persistence = `file ${args.shift()}` as Persistence;
  } else {
    throw new Error(
      "Usage: electron.js [--file path] [--persistence file binary|json]",
    );
  }
}

app.on("window-all-closed", () => app.quit());
void app
  .whenReady()
  .then(async () => {
    const visual = await startVisualServer(
      file,
      join(directory, "visual"),
      persistence,
    );
    app.on("before-quit", () => {
      void visual.close().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    });
    const window = new BrowserWindow({
      height: 900,
      minHeight: 600,
      minWidth: 850,
      title: "Sphere Quadtree",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(directory, "preload.cjs"),
        sandbox: true,
      },
      width: 1400,
    });
    const origin = new URL(visual.url).origin;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    const verifySender = (sender: Electron.IpcMainInvokeEvent): void => {
      if (
        sender.sender !== window.webContents ||
        sender.senderFrame !== window.webContents.mainFrame ||
        new URL(sender.senderFrame.url).origin !== origin
      ) {
        throw new Error("Unauthorized window");
      }
    };
    ipcMain.handle("sqt:open", async (event) => {
      verifySender(event);
      const result = await dialog.showOpenDialog(window, {
        filters: [
          {
            extensions: [persistence === "file binary" ? "bin" : "json"],
            name: "Quadtree index",
          },
        ],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return false;
      visual.index.open(result.filePaths[0]);
      return true;
    });
    ipcMain.handle("sqt:save-as", async (event) => {
      verifySender(event);
      const result = await dialog.showSaveDialog(window, {
        filters: [
          {
            extensions: [persistence === "file binary" ? "bin" : "json"],
            name: "Quadtree index",
          },
        ],
      });
      if (result.canceled || !result.filePath) return false;
      visual.index.saveAs(result.filePath);
      return true;
    });
    await window.loadURL(visual.url);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.exit(1);
  });

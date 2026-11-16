import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain } from "electron";

import { startVisualServer } from "./visual/startVisualServer";

const entry = fileURLToPath(import.meta.url);
const directory = dirname(entry);
const entryIndex = process.argv.indexOf(entry);
if (entryIndex < 0) throw new Error("Unable to identify Electron entry point");
const args = process.argv.slice(entryIndex + 1);
const file = args[0] === "--file" ? args[1] : undefined;
if (args.length && (args[0] !== "--file" || args.length !== 2 || !file)) {
  throw new Error("Usage: electron.js [--file path]");
}

app.on("window-all-closed", () => app.quit());
void app
  .whenReady()
  .then(async () => {
    const visual = await startVisualServer(file, join(directory, "visual"));
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
        filters: [{ extensions: ["json"], name: "Quadtree index" }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return false;
      visual.index.open(result.filePaths[0]);
      return true;
    });
    ipcMain.handle("sqt:save-as", async (event) => {
      verifySender(event);
      const result = await dialog.showSaveDialog(window, {
        filters: [{ extensions: ["json"], name: "Quadtree index" }],
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

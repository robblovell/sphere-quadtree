import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sqtDesktop", {
  open: () => ipcRenderer.invoke("sqt:open"),
  saveAs: () => ipcRenderer.invoke("sqt:save-as"),
});

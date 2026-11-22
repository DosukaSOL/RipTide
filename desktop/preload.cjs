// The only bridge between the sandboxed app and the computer: read and write
// RipTide's own data files. No other Node or Electron access is exposed.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("riptideDesktop", {
  readAll: () => ipcRenderer.sendSync("rt:readAll"),
  write: (key, value) => ipcRenderer.sendSync("rt:write", String(key), value === null ? null : String(value)),
  dataDir: () => ipcRenderer.sendSync("rt:dataDir"),
  openDataDir: () => ipcRenderer.send("rt:openDataDir"),
  version: () => ipcRenderer.sendSync("rt:version"),
});

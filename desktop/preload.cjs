// The only bridge between the sandboxed app and the computer: read and write
// RipTide's own data files, and see or start app updates. No other Node or
// Electron access is exposed.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("riptideDesktop", {
  readAll: () => ipcRenderer.sendSync("rt:readAll"),
  readBackup: (key) => ipcRenderer.sendSync("rt:readBackup", String(key)),
  writeMany: (entries) => ipcRenderer.sendSync("rt:writeMany", entries),
  write: (key, value) => ipcRenderer.sendSync("rt:write", String(key), value === null ? null : String(value)),
  dataDir: () => ipcRenderer.sendSync("rt:dataDir"),
  openDataDir: () => ipcRenderer.send("rt:openDataDir"),
  version: () => ipcRenderer.sendSync("rt:version"),
  updates: {
    get: () => ipcRenderer.sendSync("rt:update:get"),
    check: () => ipcRenderer.send("rt:update:check"),
    install: () => ipcRenderer.send("rt:update:install"),
    later: () => ipcRenderer.send("rt:update:later"),
    openNotes: () => ipcRenderer.send("rt:update:notes"),
    setAuto: (on) => ipcRenderer.send("rt:update:auto", on === true),
    onChange: (cb) => {
      if (typeof cb !== "function") return () => {};
      const handler = (_event, state) => cb(state);
      ipcRenderer.on("rt:update", handler);
      return () => ipcRenderer.removeListener("rt:update", handler);
    },
  },
});

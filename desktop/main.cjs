// RipTide Tools desktop app (Electron main process).
// Serves the built app from app://riptide/, keeps every renderer sandboxed with no
// Node access, and saves data as files in a RipTide folder on the user's computer.
"use strict";
const { app, BrowserWindow, Menu, ipcMain, protocol, session, shell, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const storage = require("./storage.cjs");

const ORIGIN = "app://riptide";
const APP_DIR = path.join(__dirname, "app");
const PRELOAD = path.join(__dirname, "preload.cjs");
const WEBSITE = "https://dosukasol.github.io/RipTide/";
const ISSUES = "https://github.com/DosukaSOL/RipTide/issues/new";
const ALLOWED_PERMISSIONS = new Set(["window-management", "clipboard-sanitized-write", "persistent-storage"]);

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

/* ---------- where data lives ---------- */
let dataDir = "";
function chooseDataDir() {
  const candidates = [process.env.RIPTIDE_DATA_DIR, path.join(app.getPath("documents"), "RipTide"), path.join(app.getPath("userData"), "data")].filter(Boolean);
  for (const dir of candidates) if (storage.writable(dir)) return dir;
  return candidates[candidates.length - 1];
}

/* ---------- helpers ---------- */
const isApp = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "app:" && u.host === "riptide";
  } catch {
    return false;
  }
};
const openExternal = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") void shell.openExternal(u.toString());
  } catch {
    /* not a URL: ignore */
  }
};
const fromApp = (e) => isApp(e.senderFrame?.url ?? "");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf", ".ico": "image/x-icon" };

/* ---------- window state ---------- */
const stateFile = () => path.join(app.getPath("userData"), "window.json");
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const ok = [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width >= 900 && b.height >= 600;
    if (!ok) return null;
    // Only reuse it if it's still on a connected display.
    const visible = screen.getAllDisplays().some((d) => b.x < d.workArea.x + d.workArea.width - 100 && b.x + b.width > d.workArea.x + 100 && b.y >= d.workArea.y - 20 && b.y < d.workArea.y + d.workArea.height - 100);
    return visible ? b : null;
  } catch {
    return null;
  }
}
function saveBounds(win) {
  try {
    if (win.isDestroyed() || win.isMinimized()) return;
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* not important enough to fail over */
  }
}

const childPrefs = () => ({ preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false });

let main = null;
function createMain() {
  const saved = loadBounds();
  main = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1000,
    minHeight: 640,
    title: "RipTide Tools",
    backgroundColor: "#130f26",
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: childPrefs(),
  });
  if (saved?.maximized) main.maximize();
  main.once("ready-to-show", () => main.show());
  main.on("close", () => saveBounds(main));
  main.on("closed", () => (main = null));
  void main.loadURL(`${ORIGIN}/index.html?shell=tools`);
}

/* ---------- menu ---------- */
function buildMenu() {
  const mac = process.platform === "darwin";
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [{ label: "Open data folder", accelerator: "CmdOrCtrl+Shift+O", click: () => void shell.openPath(dataDir) }, { type: "separator" }, mac ? { role: "close" } : { role: "quit" }],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: "RipTide website", click: () => openExternal(WEBSITE) }, { label: "Report a problem", click: () => openExternal(ISSUES) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- storage IPC (sync, so writes are on disk before the call returns) ---------- */
ipcMain.on("rt:readAll", (e) => {
  e.returnValue = fromApp(e) ? storage.readAll(dataDir) : {};
});
ipcMain.on("rt:write", (e, key, value) => {
  e.returnValue = fromApp(e) && storage.isKey(key) && (value === null || typeof value === "string") ? storage.writeKey(dataDir, key, value) : false;
});
ipcMain.on("rt:dataDir", (e) => {
  e.returnValue = fromApp(e) ? dataDir : "";
});
ipcMain.on("rt:version", (e) => {
  e.returnValue = app.getVersion();
});
ipcMain.on("rt:openDataDir", (e) => {
  if (fromApp(e)) void shell.openPath(dataDir);
});

/* ---------- every window and webview ---------- */
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-navigate", (ev, url) => {
    if (!isApp(url)) {
      ev.preventDefault();
      openExternal(url);
    }
  });
  wc.on("will-attach-webview", (ev) => ev.preventDefault());
  wc.setWindowOpenHandler(({ url }) => {
    // Pop-out tool windows stay inside the app; everything else opens in the browser.
    if (isApp(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { backgroundColor: "#130f26", autoHideMenuBar: true, title: "RipTide Tools", icon: path.join(__dirname, "icon.png"), webPreferences: childPrefs() } };
    }
    openExternal(url);
    return { action: "deny" };
  });
});

app.on("second-instance", () => {
  if (!main) return createMain();
  if (main.isMinimized()) main.restore();
  main.focus();
});

app.whenReady().then(() => {
  dataDir = chooseDataDir();

  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    if (u.host !== "riptide") return new Response("Not found", { status: 404 });
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR + path.sep)) return new Response("Forbidden", { status: 403 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "x-content-type-options": "nosniff" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => cb(isApp(details.requestingUrl ?? "") && ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => isApp(origin ?? "") && ALLOWED_PERMISSIONS.has(permission));
  // Nothing in the app needs the network; block any request that isn't the app itself or DevTools.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = isApp(details.url) || details.url.startsWith("devtools://") || details.url.startsWith("data:") || details.url.startsWith("blob:");
    cb({ cancel: !ok });
  });

  buildMenu();
  createMain();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMain();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

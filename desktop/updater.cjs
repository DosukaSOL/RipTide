// One-tap updates for the RipTide desktop app.
//
// When the app opens (and every few hours) it asks GitHub Releases for the newest version.
// If there is one, the app shows a popup. "Update now" downloads it, checks its sha512
// against the release's latest*.yml, then the app closes, installs and opens again:
// - Windows: the new installer runs silently over the old one (electron-updater).
// - Linux: the AppImage file is replaced, or the .deb is installed (electron-updater).
// - macOS: the new app is unzipped next to the old one and swapped in after RipTide quits.
//
// The updater has its own network session that can only reach GitHub. The app's pages
// still have no network access; they only see the status and can press the buttons.
"use strict";
const { app, BrowserWindow, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Readable, Transform } = require("node:stream");
const u = require("./updates.cjs");

const PARTITION = "electron-updater"; // the session electron-updater makes its requests in
const FIRST_CHECK_MS = 4000;
const EVERY_MS = 6 * 60 * 60 * 1000;
const MAX_DOWNLOAD = 1024 * 1024 * 1024;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 120000 }, (err) => (err ? reject(err) : resolve())));

/** A short message for people, never a raw error (those can hold file paths). */
function friendly(err) {
  const m = String(err?.message ?? err ?? "");
  if (/sha512|checksum/i.test(m)) return "The download didn't match its checksum, so nothing was installed. Try again.";
  if (/net::|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|HTTP 5\d\d|socket|network/i.test(m)) return "Couldn't reach GitHub. Check your internet connection and try again.";
  if (/HTTP 404|Cannot find|No published versions|latest.*\.yml/i.test(m)) return "The new version's files aren't on GitHub yet. Try again in a few minutes.";
  if (/EACCES|EPERM|permission|not permitted|read-only/i.test(m)) return "RipTide doesn't have permission to replace itself here. Download the update from GitHub instead.";
  return "Something went wrong while updating. Try again, or download the update from GitHub.";
}

function setup({ isApp }) {
  const feed = u.testFeed(process.env.RIPTIDE_UPDATE_FEED);
  const prefsFile = path.join(app.getPath("userData"), "updates.json");
  const prefs = u.loadPrefs(prefsFile);
  let packageType = null;
  try {
    packageType = fs.readFileSync(path.join(process.resourcesPath, "package-type"), "utf8").trim();
  } catch {
    /* not a Linux package build */
  }
  const mode = u.installMode({ platform: process.platform, env: process.env, execPath: process.execPath, packageType });
  // A copy run with `electron .` has nothing to update, and tests can switch updates off.
  const off = process.env.RIPTIDE_UPDATES === "off" || (!app.isPackaged && !feed);
  const unsupported = !off && process.platform === "linux" && mode === "manual";

  const state = {
    status: off ? "off" : unsupported ? "unsupported" : "idle",
    current: app.getVersion(),
    version: null,
    percent: null,
    error: null,
    mode,
    auto: prefs.auto,
    dismissed: false,
    checkedAt: null,
  };
  let info = null;
  let checking = false;
  let lastSent = -1;

  const broadcast = () => {
    const s = u.publicState(state);
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed() && isApp(w.webContents.getURL())) w.webContents.send("rt:update", s);
    }
  };
  const set = (patch) => {
    Object.assign(state, patch);
    broadcast();
  };
  const progress = (pct) => {
    const p = Math.floor(pct);
    if (p === lastSent) return;
    lastSent = p;
    set({ percent: p });
  };

  // The updater's own session: GitHub (and the local test feed) only, nothing else.
  const ses = session.fromPartition(PARTITION, { cache: false });
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !u.isAllowedUrl(d.url, feed) }));
  ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));

  let au = null;
  const updater = () => {
    if (au) return au;
    let mod;
    try {
      mod = require("./vendor/electron-updater.cjs");
    } catch {
      mod = require("electron-updater"); // running from source, before packaging
    }
    au = mod.autoUpdater;
    au.logger = null;
    au.autoDownload = false;
    au.autoInstallOnAppQuit = false;
    au.allowPrerelease = false;
    au.allowDowngrade = false;
    au.disableWebInstaller = true;
    if (feed) {
      au.forceDevUpdateConfig = !app.isPackaged;
      au.setFeedURL({ provider: "generic", url: feed });
    } else {
      au.setFeedURL({ provider: "github", owner: u.OWNER, repo: u.REPO, releaseType: "release" });
    }
    au.on("download-progress", (p) => {
      if (state.status === "downloading" && Number.isFinite(p?.percent)) progress(p.percent);
    });
    au.on("error", (e) => {
      if (state.status === "downloading" || state.status === "installing") set({ status: "failed", error: friendly(e), percent: null });
    });
    return au;
  };

  async function check(manual = false) {
    if (off || unsupported || checking || ["downloading", "installing"].includes(state.status)) return;
    checking = true;
    set({ status: "checking", error: null });
    try {
      const r = await updater().checkForUpdates();
      const v = r?.updateInfo?.version;
      if (r?.isUpdateAvailable && u.isVersion(v) && v !== state.current) {
        info = r.updateInfo;
        // A version you closed the popup for stays quiet until the next launch.
        set({ status: "available", version: v, dismissed: state.version === v && state.dismissed, checkedAt: Date.now() });
      } else {
        set({ status: "uptodate", version: null, checkedAt: Date.now() });
      }
    } catch (e) {
      // Automatic checks fail quietly (offline is normal); a check you asked for says why.
      set({ status: state.version ? "available" : "error", error: manual ? friendly(e) : null, checkedAt: Date.now() });
    } finally {
      checking = false;
    }
  }

  async function download(url, dest, size) {
    const res = await ses.fetch(url, { redirect: "follow", cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length")) || size || 0;
    let got = 0;
    const count = new Transform({
      transform(chunk, _enc, cb) {
        got += chunk.length;
        if (got > MAX_DOWNLOAD) return cb(new Error("download too large"));
        if (total) progress((got / total) * 99);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), count, fs.createWriteStream(dest, { flags: "wx", mode: 0o600 }));
  }

  /** macOS: download the zip, check it, unpack next to the app, swap after quitting. */
  async function installMac() {
    const zip = u.macZip(info);
    const url = zip && u.assetUrl(state.version, zip.name, feed);
    const bundle = u.macBundle(process.execPath);
    if (!zip || !url || !bundle) throw new Error("no macOS download in this release");
    const stage = await fsp.mkdtemp(path.join(path.dirname(bundle), ".riptide-update-"));
    try {
      const file = path.join(stage, "update.zip");
      await download(url, file, zip.size);
      if (!u.sameHash(await u.sha512File(file), zip.sha512)) throw new Error("sha512 checksum mismatch");
      await run("/usr/bin/ditto", ["-x", "-k", file, stage]);
      await fsp.rm(file, { force: true });
      const apps = (await fsp.readdir(stage)).filter((n) => n.endsWith(".app"));
      if (apps.length !== 1) throw new Error("unexpected zip contents");
      const fresh = path.join(stage, path.basename(bundle));
      if (apps[0] !== path.basename(bundle)) await fsp.rename(path.join(stage, apps[0]), fresh);
      await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", fresh]);
      const script = path.join(stage, "swap.sh");
      await fsp.writeFile(script, u.MAC_SWAP, { mode: 0o700 });
      set({ status: "installing", percent: 100 });
      await delay(700);
      spawn("/bin/bash", [script, String(process.pid), stage, bundle], { detached: true, stdio: "ignore" }).unref();
      app.quit();
    } catch (e) {
      await fsp.rm(stage, { recursive: true, force: true }).catch(() => {});
      throw e;
    }
  }

  async function install() {
    if (!["available", "failed"].includes(state.status) || !state.version) return;
    if (mode === "manual") {
      void shell.openExternal(u.releasePage(state.version));
      return;
    }
    lastSent = -1;
    set({ status: "downloading", percent: 0, error: null, dismissed: false });
    try {
      if (mode === "mac") return await installMac();
      await updater().downloadUpdate();
      set({ status: "installing", percent: 100 });
      await delay(700); // the popup says "Restarting" and open pages finish saving
      // The new copy waits for this one to exit before it starts (see main.cjs).
      process.env.RIPTIDE_UPDATED_FROM = String(process.pid);
      updater().quitAndInstall(true, true);
    } catch (e) {
      set({ status: "failed", error: friendly(e), percent: null });
    }
  }

  /* ---------- what the app's pages can ask for ---------- */
  const ok = (e) => isApp(e.senderFrame?.url ?? "");
  ipcMain.on("rt:update:get", (e) => {
    e.returnValue = ok(e) ? u.publicState(state) : null;
  });
  ipcMain.on("rt:update:check", (e) => ok(e) && void check(true));
  ipcMain.on("rt:update:install", (e) => ok(e) && void install());
  ipcMain.on("rt:update:later", (e) => ok(e) && set({ dismissed: true }));
  ipcMain.on("rt:update:notes", (e) => ok(e) && void shell.openExternal(u.releasePage(state.version)));
  ipcMain.on("rt:update:auto", (e, on) => {
    if (!ok(e) || typeof on !== "boolean") return;
    prefs.auto = on;
    u.savePrefs(prefsFile, prefs);
    set({ auto: on });
  });

  /** Start checking: soon after the window opens, then every few hours while automatic checks are on. */
  function start() {
    if (off || unsupported) return;
    setTimeout(() => state.auto && void check(), FIRST_CHECK_MS);
    setInterval(() => state.auto && ["idle", "uptodate", "error"].includes(state.status) && void check(), EVERY_MS);
  }

  return { start, check, state };
}

module.exports = { setup, friendly };

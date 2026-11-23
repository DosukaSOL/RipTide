// Update helpers for the RipTide desktop app that don't need Electron, so they can be
// unit tested: preferences, which install method fits this computer, which addresses
// the updater may contact, checksums and the macOS swap step.
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const OWNER = "DosukaSOL";
const REPO = "RipTide";
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases`;
/** The only hosts the updater may talk to: GitHub releases and the servers its downloads redirect to. */
const GITHUB_HOSTS = new Set(["github.com", "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.]{1,40})?$/;
const ASSET = /^RipTide-[A-Za-z0-9._-]{1,80}$/;

const isVersion = (v) => typeof v === "string" && VERSION.test(v);
const releasePage = (version) => (isVersion(version) ? `${RELEASES}/tag/v${version}` : `${RELEASES}/latest`);

/* ---------- preferences (userData/updates.json) ---------- */
const DEFAULT_PREFS = Object.freeze({ auto: true });

function loadPrefs(file) {
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8"));
    return { auto: typeof p?.auto === "boolean" ? p.auto : DEFAULT_PREFS.auto };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(file, prefs) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ auto: prefs.auto === true }));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/* ---------- test feed ---------- */
/**
 * Automated tests point the updater at a local server with RIPTIDE_UPDATE_FEED.
 * Only plain addresses on this computer are accepted, never anything on the internet.
 */
function testFeed(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(u.hostname) || u.username || u.password) return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** May the updater open this address? GitHub over HTTPS, or the local test feed. */
function isAllowedUrl(url, feed) {
  try {
    const u = new URL(url);
    if (feed) {
      const f = new URL(feed);
      if (u.protocol === f.protocol && u.host === f.host) return true;
    }
    return u.protocol === "https:" && GITHUB_HOSTS.has(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/* ---------- how this copy of the app can update ---------- */
/** The .app bundle that holds the running executable, or null. */
function macBundle(execPath) {
  const bundle = path.resolve(execPath, "..", "..", "..");
  return bundle.endsWith(".app") ? bundle : null;
}

const canWrite = (p) => {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * - "auto": electron-updater downloads and installs (Windows installer, Linux AppImage and .deb).
 * - "mac": RipTide downloads the new app and swaps it in place (no Apple certificate needed).
 * - "manual": this copy can't replace itself (run from the DMG, a read-only folder, or an
 *   unpacked build), so the button opens the download page instead.
 */
function installMode({ platform, env = {}, execPath = "", packageType = null, writable = canWrite }) {
  if (platform === "win32") return "auto";
  if (platform === "linux") {
    if (env.APPIMAGE && path.isAbsolute(env.APPIMAGE) && writable(path.dirname(env.APPIMAGE))) return "auto";
    if (packageType === "deb") return "auto";
    return "manual";
  }
  if (platform === "darwin") {
    const bundle = macBundle(execPath);
    if (!bundle || bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) return "manual";
    return writable(bundle) && writable(path.dirname(bundle)) ? "mac" : "manual";
  }
  return "manual";
}

/** The macOS zip in an update's file list, with its checksum. */
function macZip(info) {
  const files = Array.isArray(info?.files) ? info.files : [];
  const f = files.find((x) => typeof x?.url === "string" && x.url.endsWith(".zip"));
  if (!f) return null;
  const name = path.posix.basename(f.url);
  if (!ASSET.test(name) || typeof f.sha512 !== "string" || !/^[A-Za-z0-9+/]{80,90}={0,2}$/.test(f.sha512)) return null;
  const size = Number.isSafeInteger(f.size) && f.size > 0 ? f.size : 0;
  return { name, sha512: f.sha512, size };
}

/** Where to download an update file from. */
function assetUrl(version, name, feed) {
  if (!isVersion(version) || !ASSET.test(name)) return null;
  return feed ? `${feed}/${encodeURIComponent(name)}` : `${RELEASES}/download/v${version}/${encodeURIComponent(name)}`;
}

/** sha512 of a file, base64, as electron-builder writes it in latest*.yml. */
function sha512File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha512");
    fs.createReadStream(file)
      .on("error", reject)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("base64")));
  });
}

/** True when two base64 checksums match, compared in constant time. */
function sameHash(a, b) {
  const x = Buffer.from(String(a), "base64");
  const y = Buffer.from(String(b), "base64");
  return x.length === 64 && y.length === 64 && crypto.timingSafeEqual(x, y);
}

/**
 * The macOS swap step, run by /bin/bash after RipTide quits. Arguments, never pasted in:
 * $1 the app's process id, $2 the staging folder holding the new app, $3 the installed app.
 * It waits up to 60 s for the app to quit, moves the old app aside, moves the new one in
 * (putting the old one back if that fails), clears the download quarantine and reopens it.
 */
const MAC_SWAP = `#!/bin/bash
pid="$1"; stage="$2"; target="$3"
case "$(basename "$stage")" in .riptide-update-*) ;; *) exit 2 ;; esac
case "$target" in *.app) ;; *) exit 2 ;; esac
new="$stage/$(basename "$target")"
[ -d "$new" ] || { rm -rf "$stage"; exit 3; }
for _ in $(seq 1 300); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
if kill -0 "$pid" 2>/dev/null; then rm -rf "$stage"; exit 4; fi
old="$stage/previous.app"
if mv "$target" "$old"; then
  if ! mv "$new" "$target"; then mv "$old" "$target"; fi
fi
xattr -dr com.apple.quarantine "$target" 2>/dev/null
rm -rf "$stage"
open "$target"
`;

/** Linux: a process that has exited but whose parent hasn't collected it yet. */
function isZombie(pid) {
  if (process.platform !== "linux") return false;
  try {
    return /^\d+ \(.*\) Z /s.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return false;
  }
}

/** Wait (blocking) until a process has exited, up to ms. Used by the relaunched app after an update. */
function waitForExit(pid, ms) {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;
  const end = Date.now() + ms;
  const cell = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < end) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (isZombie(pid)) return; // exited, just not collected by its parent yet
    Atomics.wait(cell, 0, 0, 100);
  }
}

/** The status the app's pages are allowed to see. */
function publicState(s) {
  return {
    status: s.status,
    current: s.current,
    version: isVersion(s.version) ? s.version : null,
    percent: Number.isFinite(s.percent) ? Math.max(0, Math.min(100, Math.round(s.percent))) : null,
    error: typeof s.error === "string" ? s.error.slice(0, 200) : null,
    mode: s.mode,
    auto: s.auto === true,
    dismissed: s.dismissed === true,
    checkedAt: Number.isFinite(s.checkedAt) ? s.checkedAt : null,
  };
}

module.exports = { OWNER, REPO, RELEASES, isVersion, releasePage, loadPrefs, savePrefs, testFeed, isAllowedUrl, macBundle, installMode, macZip, assetUrl, sha512File, sameHash, MAC_SWAP, waitForExit, publicState };

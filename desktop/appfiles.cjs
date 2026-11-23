// Maps an app://riptide/ address to a file inside the packaged app folder, and nothing else.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

/**
 * The file for an app:// URL, or an HTTP status when it can't be served:
 * 400 for an address that can't be decoded, 403 for anything that would leave the app
 * folder (../, encoded slashes, symlinks pointing outside), 404 for anything missing.
 */
async function resolveAppFile(appDir, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { status: 400 };
  }
  if (u.protocol !== "app:" || u.host !== "riptide") return { status: 404 };
  let rel;
  try {
    rel = decodeURIComponent(u.pathname);
  } catch {
    return { status: 400 }; // malformed escapes like %E0%A4
  }
  if (rel.includes("\0") || rel.includes("\\")) return { status: 403 };
  rel = rel.replace(/^\/+/, "") || "index.html";
  const root = await fs.promises.realpath(appDir).catch(() => path.resolve(appDir));
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) return { status: 403 };
  let real;
  try {
    real = await fs.promises.realpath(file);
  } catch {
    return { status: 404 };
  }
  // A symlink inside the folder must not lead outside it.
  if (!real.startsWith(root + path.sep)) return { status: 403 };
  try {
    if (!(await fs.promises.stat(real)).isFile()) return { status: 404 };
  } catch {
    return { status: 404 };
  }
  return { status: 200, file: real };
}

module.exports = { resolveAppFile };

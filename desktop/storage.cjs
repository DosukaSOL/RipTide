// File storage for the RipTide desktop app. One readable JSON file per key.
// Writes are atomic (temp file, then rename) and the previous version is kept as
// <key>.json.bak, so a crash or power cut mid-write never loses data.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const KEY = /^riptide\.[a-z0-9.-]{1,60}$/;
const MAX_BYTES = 20 * 1024 * 1024;

const isKey = (k) => typeof k === "string" && KEY.test(k);
const fileFor = (dir, key) => path.join(dir, `${key}.json`);

function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Read one key: the main file if it's valid JSON, otherwise its backup. */
function readKey(dir, key) {
  for (const f of [fileFor(dir, key), `${fileFor(dir, key)}.bak`]) {
    try {
      const st = fs.statSync(f);
      if (!st.isFile() || st.size > MAX_BYTES) continue;
      const text = fs.readFileSync(f, "utf8");
      if (isJson(text)) return text;
    } catch {
      /* missing or unreadable: try the next one */
    }
  }
  return null;
}

/** Every valid key in the folder. */
function readAll(dir) {
  const out = {};
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  const keys = new Set();
  for (const n of names) {
    const m = /^(.+)\.json(\.bak)?$/.exec(n);
    if (m && isKey(m[1])) keys.add(m[1]);
  }
  for (const k of keys) {
    const v = readKey(dir, k);
    if (v !== null) out[k] = v;
  }
  return out;
}

/** Write or delete one key. Returns true on success. */
function writeKey(dir, key, value) {
  if (!isKey(key)) return false;
  const f = fileFor(dir, key);
  try {
    if (value === null) {
      for (const x of [f, `${f}.bak`]) fs.rmSync(x, { force: true });
      return true;
    }
    if (typeof value !== "string" || Buffer.byteLength(value) > MAX_BYTES || !isJson(value)) return false;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, value, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (fs.existsSync(f)) {
      // Keep the last good version as a backup before replacing it.
      if (fs.readFileSync(f, "utf8") !== value) fs.copyFileSync(f, `${f}.bak`);
    }
    fs.renameSync(tmp, f);
    return true;
  } catch {
    return false;
  }
}

/** True if the folder can be created and written to. */
function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = { isKey, readKey, readAll, writeKey, writable, MAX_BYTES };

// File storage for the RipTide desktop app. One readable JSON file per key.
// Writes are atomic (temp file, then rename) and the previous version is kept as
// <key>.json.bak, so a crash or power cut mid-write never loses data.
// Several keys can be written as one change (writeMany): either every key gets its new
// version or none do, including after a crash halfway (see recoverCommit).
//
// Every function takes an optional `fsx` (defaults to node:fs) so tests can inject disk
// failures such as ENOSPC, EPERM or a failed rename.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const KEY = /^riptide\.[a-z0-9.-]{1,60}$/;
const MAX_BYTES = 20 * 1024 * 1024;

const JOURNAL = "riptide-commit.journal";
const STAGED = ".commit-new";
const BEFORE = ".commit-old";

const isKey = (k) => typeof k === "string" && KEY.test(k);
const fileFor = (dir, key) => path.join(dir, `${key}.json`);
const code = (e) => (e && typeof e.code === "string" ? e.code : "EIO");

/** Write a file and flush it to disk before returning. */
function writeSynced(fsx, file, text) {
  const fd = fsx.openSync(file, "w");
  try {
    fsx.writeFileSync(fd, text, "utf8");
    fsx.fsyncSync(fd);
  } finally {
    fsx.closeSync(fd);
  }
}

/** Flush a folder's entries (renames) to disk where the system supports it. */
function syncDir(fsx, dir) {
  if (process.platform === "win32") return;
  try {
    const fd = fsx.openSync(dir, "r");
    try {
      fsx.fsyncSync(fd);
    } finally {
      fsx.closeSync(fd);
    }
  } catch {
    /* not supported on this filesystem */
  }
}

function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read one key: the main file if it's valid JSON, otherwise its backup. If the main file is gone,
 * the key was deleted (saves replace the file in one step, so it's never missing mid-save), and
 * the backup isn't used to bring it back.
 */
function readKey(dir, key) {
  if (!fs.existsSync(fileFor(dir, key))) return null;
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

/** The backup copy of one key (the version before the last save), if it's valid JSON. */
function readBackup(dir, key) {
  if (!isKey(key)) return null;
  const f = `${fileFor(dir, key)}.bak`;
  try {
    const st = fs.statSync(f);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    const text = fs.readFileSync(f, "utf8");
    return isJson(text) ? text : null;
  } catch {
    return null;
  }
}

/** Every valid key in the folder. Finishes an interrupted multi-key change first. */
function readAll(dir, fsx = fs) {
  recoverCommit(dir, fsx);
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

const validValue = (v) => v === null || (typeof v === "string" && Buffer.byteLength(v) <= MAX_BYTES && isJson(v));

/** Keep the current version as <file>.bak before it's replaced, but only if it's readable. */
function keepBackup(fsx, f, next) {
  if (!fsx.existsSync(f)) return;
  const prev = fsx.readFileSync(f, "utf8");
  // A damaged file must never replace a good backup.
  if (prev !== next && isJson(prev)) fsx.copyFileSync(f, `${f}.bak`);
}

/**
 * Write or delete one key. Returns { ok: true } or { ok: false, error } with the system error
 * code (ENOSPC, EPERM, EACCES…). On failure the current file is left exactly as it was.
 */
function writeKeyResult(dir, key, value, fsx = fs) {
  if (!isKey(key)) return { ok: false, error: "EINVAL" };
  if (!validValue(value)) return { ok: false, error: "EINVAL" };
  const f = fileFor(dir, key);
  if (value === null) {
    try {
      for (const x of [f, `${f}.bak`]) fsx.rmSync(x, { force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: code(e) };
    }
  }
  const tmp = `${f}.${process.pid}.tmp`;
  try {
    fsx.mkdirSync(dir, { recursive: true });
    writeSynced(fsx, tmp, value);
    keepBackup(fsx, f, value);
    fsx.renameSync(tmp, f);
    syncDir(fsx, dir);
    return { ok: true };
  } catch (e) {
    try {
      fsx.rmSync(tmp, { force: true });
    } catch {
      /* nothing more to clean up */
    }
    return { ok: false, error: code(e) };
  }
}

/** Write or delete one key. Returns true on success. */
function writeKey(dir, key, value, fsx = fs) {
  return writeKeyResult(dir, key, value, fsx).ok;
}

/**
 * Write several keys as one change: afterwards every key has its new value, or none do.
 *
 * 1. Every new value is written to a staged file and flushed. If any of those fails, the staged
 *    files are removed and nothing has changed.
 * 2. A journal listing the keys is written. From here on the change is committed: if the app
 *    stops, recoverCommit finishes it on the next start.
 * 3. Each current file is copied aside, then replaced (or deleted). If a replace fails, the files
 *    already replaced are put back from their copies and nothing has changed.
 * 4. The journal and copies are removed.
 *
 * entries: [{ key, value }] where value is a JSON string or null to delete.
 */
function writeMany(dir, entries, fsx = fs) {
  if (!Array.isArray(entries) || !entries.length) return { ok: true };
  const seen = new Set();
  for (const e of entries) {
    if (!e || !isKey(e.key) || seen.has(e.key) || !validValue(e.value)) return { ok: false, error: "EINVAL" };
    seen.add(e.key);
  }
  recoverCommit(dir, fsx); // never start on top of an unfinished change
  const staged = [];
  try {
    fsx.mkdirSync(dir, { recursive: true });
    for (const e of entries) {
      if (e.value === null) continue;
      const s = `${fileFor(dir, e.key)}${STAGED}`;
      staged.push(s); // before writing, so a half-written file is cleaned up too
      writeSynced(fsx, s, e.value);
    }
  } catch (err) {
    for (const s of staged) {
      try {
        fsx.rmSync(s, { force: true });
      } catch {
        /* best effort */
      }
    }
    return { ok: false, error: code(err) };
  }

  const journal = path.join(dir, JOURNAL);
  try {
    writeSynced(fsx, `${journal}.tmp`, JSON.stringify({ v: 1, keys: entries.map((e) => ({ key: e.key, del: e.value === null })) }));
    fsx.renameSync(`${journal}.tmp`, journal);
    syncDir(fsx, dir);
  } catch (err) {
    for (const s of staged) {
      try {
        fsx.rmSync(s, { force: true });
      } catch {
        /* best effort */
      }
    }
    try {
      fsx.rmSync(`${journal}.tmp`, { force: true });
    } catch {
      /* best effort */
    }
    return { ok: false, error: code(err) };
  }

  const done = [];
  try {
    for (const e of entries) {
      const f = fileFor(dir, e.key);
      const had = fsx.existsSync(f);
      if (had) fsx.copyFileSync(f, `${f}${BEFORE}`);
      if (e.value === null) {
        fsx.rmSync(f, { force: true });
        fsx.rmSync(`${f}.bak`, { force: true });
      } else {
        keepBackup(fsx, f, e.value);
        fsx.renameSync(`${f}${STAGED}`, f);
      }
      done.push({ f, had });
    }
    syncDir(fsx, dir);
  } catch (err) {
    // Put back what was already replaced, then drop the change.
    for (const { f, had } of done.reverse()) {
      try {
        if (had) fsx.renameSync(`${f}${BEFORE}`, f);
        else fsx.rmSync(f, { force: true });
      } catch {
        /* the journal stays, so the next start finishes the change instead */
        return { ok: false, error: code(err), partial: true };
      }
    }
    for (const e of entries) {
      for (const x of [`${fileFor(dir, e.key)}${STAGED}`, `${fileFor(dir, e.key)}${BEFORE}`]) {
        try {
          fsx.rmSync(x, { force: true });
        } catch {
          /* best effort */
        }
      }
    }
    try {
      fsx.rmSync(journal, { force: true });
    } catch {
      /* best effort */
    }
    return { ok: false, error: code(err) };
  }
  cleanup(dir, entries.map((e) => e.key), fsx);
  return { ok: true };
}

function cleanup(dir, keys, fsx) {
  for (const k of keys) {
    for (const x of [`${fileFor(dir, k)}${STAGED}`, `${fileFor(dir, k)}${BEFORE}`]) {
      try {
        fsx.rmSync(x, { force: true });
      } catch {
        /* best effort */
      }
    }
  }
  try {
    fsx.rmSync(path.join(dir, JOURNAL), { force: true });
    syncDir(fsx, dir);
  } catch {
    /* best effort */
  }
}

/**
 * Finish a multi-key change that was committed (its journal exists) but stopped halfway:
 * staged files still waiting are moved into place, deletes are done again, then the journal is
 * removed. Safe to run any number of times.
 */
function recoverCommit(dir, fsx = fs) {
  const journal = path.join(dir, JOURNAL);
  let list;
  try {
    if (!fsx.existsSync(journal)) {
      fsx.rmSync(`${journal}.tmp`, { force: true }); // never committed: nothing to finish
      return false;
    }
    const j = JSON.parse(fsx.readFileSync(journal, "utf8"));
    list = Array.isArray(j?.keys) ? j.keys.filter((k) => k && isKey(k.key)) : [];
  } catch {
    return false;
  }
  for (const { key, del } of list) {
    const f = fileFor(dir, key);
    try {
      if (del) {
        fsx.rmSync(f, { force: true });
        fsx.rmSync(`${f}.bak`, { force: true });
      } else if (fsx.existsSync(`${f}${STAGED}`)) {
        keepBackup(fsx, f, fsx.readFileSync(`${f}${STAGED}`, "utf8"));
        fsx.renameSync(`${f}${STAGED}`, f);
      }
    } catch {
      return false; // try again next time
    }
  }
  cleanup(dir, list.map((k) => k.key), fsx);
  return true;
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

module.exports = { isKey, readKey, readBackup, readAll, writeKey, writeKeyResult, writeMany, recoverCommit, writable, MAX_BYTES, JOURNAL };

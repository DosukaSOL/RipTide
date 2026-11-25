const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const storage = require("../storage.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "riptide-store-"));

test("writes readable JSON files and reads them back", () => {
  const dir = tmp();
  assert.equal(storage.writeKey(dir, "riptide.map.v2", JSON.stringify({ a: 1 })), true);
  assert.equal(fs.readFileSync(path.join(dir, "riptide.map.v2.json"), "utf8"), '{"a":1}');
  assert.deepEqual(storage.readAll(dir), { "riptide.map.v2": '{"a":1}' });
});

test("keeps the previous version as a backup and falls back to it", () => {
  const dir = tmp();
  storage.writeKey(dir, "riptide.heist.v1", '{"v":1}');
  storage.writeKey(dir, "riptide.heist.v1", '{"v":2}');
  assert.equal(fs.readFileSync(path.join(dir, "riptide.heist.v1.json.bak"), "utf8"), '{"v":1}');
  fs.writeFileSync(path.join(dir, "riptide.heist.v1.json"), '{"v":2'); // cut off mid-write
  assert.equal(storage.readKey(dir, "riptide.heist.v1"), '{"v":1}', "a damaged file never loses data");
});

test("refuses unknown keys, path tricks, invalid JSON and huge values", () => {
  const dir = tmp();
  for (const k of ["../evil", "riptide/../../x", "other.key", "riptide.", "RIPTIDE.MAP", "riptide.a b"]) assert.equal(storage.writeKey(dir, k, "{}"), false, k);
  assert.equal(storage.writeKey(dir, "riptide.map.v2", "not json"), false);
  assert.equal(storage.writeKey(dir, "riptide.map.v2", 42), false);
  assert.equal(storage.writeKey(dir, "riptide.map.v2", JSON.stringify("x".repeat(storage.MAX_BYTES + 1))), false);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("deleting a key removes its file and backup; stray files are ignored", () => {
  const dir = tmp();
  storage.writeKey(dir, "riptide.settings.v1", "{}");
  storage.writeKey(dir, "riptide.settings.v1", '{"x":1}');
  assert.equal(storage.writeKey(dir, "riptide.settings.v1", null), true);
  fs.writeFileSync(path.join(dir, "notes.txt"), "hi");
  fs.writeFileSync(path.join(dir, "evil.json"), "{}");
  assert.deepEqual(storage.readAll(dir), {});
  assert.equal(storage.readAll(path.join(dir, "missing")).constructor, Object);
});

test("unchanged writes don't overwrite the backup", () => {
  const dir = tmp();
  storage.writeKey(dir, "riptide.flags.v1", '{"a":1}');
  storage.writeKey(dir, "riptide.flags.v1", '{"a":2}');
  storage.writeKey(dir, "riptide.flags.v1", '{"a":2}');
  assert.equal(fs.readFileSync(path.join(dir, "riptide.flags.v1.json.bak"), "utf8"), '{"a":1}');
});

/* ---------- audit fixes ---------- */

test("a damaged file never replaces a good backup", () => {
  const dir = tmp();
  storage.writeKey(dir, "riptide.heist.v1", '{"v":1}');
  storage.writeKey(dir, "riptide.heist.v1", '{"v":2}');
  fs.writeFileSync(path.join(dir, "riptide.heist.v1.json"), '{"v":2'); // damaged
  assert.equal(storage.writeKey(dir, "riptide.heist.v1", '{"v":3}'), true);
  assert.equal(fs.readFileSync(path.join(dir, "riptide.heist.v1.json.bak"), "utf8"), '{"v":1}', "good backup kept");
  assert.equal(storage.readKey(dir, "riptide.heist.v1"), '{"v":3}');
});

test("a main file deleted outside the app isn't brought back from its backup", () => {
  const dir = tmp();
  storage.writeKey(dir, "riptide.map.v2", '{"v":1}');
  storage.writeKey(dir, "riptide.map.v2", '{"v":2}');
  fs.rmSync(path.join(dir, "riptide.map.v2.json"));
  assert.equal(storage.readKey(dir, "riptide.map.v2"), null);
  assert.deepEqual(storage.readAll(dir), {});
});

test("readBackup returns the previous version, or null", () => {
  const dir = tmp();
  assert.equal(storage.readBackup(dir, "riptide.map.v2"), null);
  storage.writeKey(dir, "riptide.map.v2", '{"v":1}');
  assert.equal(storage.readBackup(dir, "riptide.map.v2"), null);
  storage.writeKey(dir, "riptide.map.v2", '{"v":2}');
  assert.equal(storage.readBackup(dir, "riptide.map.v2"), '{"v":1}');
  fs.writeFileSync(path.join(dir, "riptide.map.v2.json.bak"), "{broken");
  assert.equal(storage.readBackup(dir, "riptide.map.v2"), null);
  assert.equal(storage.readBackup(dir, "../etc/passwd"), null);
});

test("a write that can't finish leaves the current file alone", () => {
  const dir = tmp();
  storage.writeKey(dir, "riptide.flags.v1", '{"a":1}');
  // A directory where the temp file should go makes the write fail part-way.
  fs.mkdirSync(path.join(dir, `riptide.flags.v1.json.${process.pid}.tmp`));
  assert.equal(storage.writeKey(dir, "riptide.flags.v1", '{"a":2}'), false);
  assert.equal(storage.readKey(dir, "riptide.flags.v1"), '{"a":1}');
});

/* ---------- durable saves: failure codes and multi-key commits ---------- */

/** A copy of fs whose chosen call fails with the given code, optionally only on its nth use. */
function failing(method, errCode, nth = 1, match = () => true) {
  let n = 0;
  return new Proxy(fs, {
    get(target, prop) {
      if (prop !== method) return target[prop];
      return (...a) => {
        if (match(...a) && ++n === nth) throw Object.assign(new Error(errCode), { code: errCode });
        return target[prop](...a);
      };
    },
  });
}

test("a failed single write reports the system error and changes nothing", () => {
  for (const [method, errCode] of [["writeFileSync", "ENOSPC"], ["fsyncSync", "EIO"], ["renameSync", "EPERM"], ["openSync", "EACCES"]]) {
    const dir = tmp();
    storage.writeKey(dir, "riptide.map.v2", '{"v":1}');
    const r = storage.writeKeyResult(dir, "riptide.map.v2", '{"v":2}', failing(method, errCode));
    assert.deepEqual(r, { ok: false, error: errCode }, method);
    assert.equal(storage.readKey(dir, "riptide.map.v2"), '{"v":1}', `${method}: original intact`);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith(".tmp")), [], `${method}: no temp files left`);
  }
});

const three = (v) => [
  { key: "riptide.map.v2", value: JSON.stringify({ map: v }) },
  { key: "riptide.heist.v1", value: JSON.stringify({ heist: v }) },
  { key: "riptide.settings.v1", value: JSON.stringify({ settings: v }) },
];
const snapshot = (dir) => storage.readAll(dir);

test("writeMany writes every key, keeps backups and leaves no working files", () => {
  const dir = tmp();
  assert.deepEqual(storage.writeMany(dir, three(1)), { ok: true });
  assert.deepEqual(storage.writeMany(dir, three(2)), { ok: true });
  const all = snapshot(dir);
  assert.equal(all["riptide.map.v2"], '{"map":2}');
  assert.equal(all["riptide.settings.v1"], '{"settings":2}');
  assert.equal(storage.readBackup(dir, "riptide.heist.v1"), '{"heist":1}');
  assert.deepEqual(fs.readdirSync(dir).filter((n) => /commit|journal|tmp/.test(n)), []);
});

test("writeMany: a failure while staging changes nothing (disk full on the second key)", () => {
  const dir = tmp();
  storage.writeMany(dir, three(1));
  const before = snapshot(dir);
  const r = storage.writeMany(dir, three(2), failing("writeFileSync", "ENOSPC", 2));
  assert.deepEqual(r, { ok: false, error: "ENOSPC" });
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(fs.readdirSync(dir).filter((n) => /commit|journal|tmp/.test(n)), []);
});

test("writeMany: a failed replace halfway puts back the keys already replaced", () => {
  const dir = tmp();
  storage.writeMany(dir, three(1));
  const before = snapshot(dir);
  // The second rename of a staged file into place fails.
  const r = storage.writeMany(dir, three(2), failing("renameSync", "EPERM", 2, (from) => String(from).endsWith(".commit-new")));
  assert.equal(r.ok, false);
  assert.equal(r.error, "EPERM");
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(fs.readdirSync(dir).filter((n) => /commit|journal/.test(n)), []);
});

test("writeMany: invalid entries are refused before touching the disk", () => {
  const dir = tmp();
  for (const bad of [[{ key: "../evil", value: "{}" }], [{ key: "riptide.a", value: "{cut" }], [{ key: "riptide.a", value: "{}" }, { key: "riptide.a", value: "{}" }]]) {
    assert.deepEqual(storage.writeMany(dir, bad), { ok: false, error: "EINVAL" });
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("a change that stopped after its journal was written is finished on the next read", () => {
  const dir = tmp();
  storage.writeMany(dir, three(1));
  // Simulate the process dying right after the first key was replaced: the second replace fails,
  // and so does putting the first one back, so the journal and the staged files stay behind.
  let replaced = 0;
  const dead = new Proxy(fs, {
    get(target, prop) {
      if (prop !== "renameSync") return target[prop];
      return (from, to) => {
        const f = String(from);
        if ((f.endsWith(".commit-new") && ++replaced === 2) || f.endsWith(".commit-old")) throw Object.assign(new Error("killed"), { code: "KILLED" });
        return target.renameSync(from, to);
      };
    },
  });
  const r = storage.writeMany(dir, three(2), dead);
  assert.equal(r.ok, false);
  assert.ok(fs.existsSync(path.join(dir, storage.JOURNAL)), "journal kept for recovery");
  // Next start: readAll finishes the change, so every key has the new value.
  const all = storage.readAll(dir);
  assert.equal(all["riptide.map.v2"], '{"map":2}');
  assert.equal(all["riptide.heist.v1"], '{"heist":2}');
  assert.equal(all["riptide.settings.v1"], '{"settings":2}');
  assert.ok(!fs.existsSync(path.join(dir, storage.JOURNAL)));
  assert.deepEqual(fs.readdirSync(dir).filter((n) => /commit|journal/.test(n)), []);
});

test("a change that stopped before its journal was written leaves the old values", () => {
  const dir = tmp();
  storage.writeMany(dir, three(1));
  fs.writeFileSync(path.join(dir, "riptide.map.v2.json.commit-new"), '{"map":9}');
  fs.writeFileSync(path.join(dir, `${storage.JOURNAL}.tmp`), "{}");
  const all = storage.readAll(dir);
  assert.equal(all["riptide.map.v2"], '{"map":1}');
  assert.ok(!fs.existsSync(path.join(dir, `${storage.JOURNAL}.tmp`)));
});

test("writeMany deletes keys given null", () => {
  const dir = tmp();
  storage.writeMany(dir, three(1));
  assert.deepEqual(storage.writeMany(dir, [{ key: "riptide.map.v2", value: null }, { key: "riptide.heist.v1", value: '{"heist":3}' }]), { ok: true });
  const all = storage.readAll(dir);
  assert.equal(all["riptide.map.v2"], undefined);
  assert.equal(all["riptide.heist.v1"], '{"heist":3}');
});

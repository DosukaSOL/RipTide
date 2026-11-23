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

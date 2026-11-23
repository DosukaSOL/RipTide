const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveAppFile } = require("../appfiles.cjs");

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "riptide-app-"));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "map"), { recursive: true });
  fs.writeFileSync(path.join(app, "index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(app, "map", "a b.json"), "{}");
  fs.writeFileSync(path.join(root, "secret.txt"), "private");
  return { root, app };
};

test("serves files inside the app folder", async () => {
  const { app } = setup();
  const real = fs.realpathSync(app);
  assert.deepEqual(await resolveAppFile(app, "app://riptide/"), { status: 200, file: path.join(real, "index.html") });
  assert.deepEqual(await resolveAppFile(app, "app://riptide/index.html?x=1#y"), { status: 200, file: path.join(real, "index.html") });
  assert.deepEqual(await resolveAppFile(app, "app://riptide/map/a%20b.json"), { status: 200, file: path.join(real, "map", "a b.json") });
});

test("never leaves the app folder, however the address is written", async () => {
  const { app } = setup();
  for (const u of ["app://riptide/%2e%2e/secret.txt", "app://riptide/..%2fsecret.txt", "app://riptide/map/..%2f..%2fsecret.txt", "app://riptide/%5c..%5csecret.txt", "app://riptide/index.html%00.png"]) {
    const r = await resolveAppFile(app, u);
    assert.ok(r.status === 403 || r.status === 404, `${u} gave ${r.status}`);
    assert.equal(r.file, undefined);
  }
});

test("malformed addresses are refused, not crashed on", async () => {
  const { app } = setup();
  assert.equal((await resolveAppFile(app, "app://riptide/%E0%A4%A")).status, 400);
  assert.equal((await resolveAppFile(app, "not a url")).status, 400);
  assert.equal((await resolveAppFile(app, "app://evil/index.html")).status, 404);
  assert.equal((await resolveAppFile(app, "app://riptide/map")).status, 404, "folders aren't files");
  assert.equal((await resolveAppFile(app, "app://riptide/missing.js")).status, 404);
});

test("a symlink inside the app folder can't point outside it", { skip: process.platform === "win32" }, async () => {
  const { root, app } = setup();
  fs.symlinkSync(path.join(root, "secret.txt"), path.join(app, "link.txt"));
  assert.equal((await resolveAppFile(app, "app://riptide/link.txt")).status, 403);
});

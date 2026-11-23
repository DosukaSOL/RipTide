const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const u = require("../updates.cjs");

const tmp = (p = "riptide-upd-") => fs.mkdtempSync(path.join(os.tmpdir(), p));

test("preferences default to automatic checks and survive bad files", () => {
  const dir = tmp();
  const f = path.join(dir, "updates.json");
  assert.deepEqual(u.loadPrefs(f), { auto: true });
  fs.writeFileSync(f, "{not json");
  assert.deepEqual(u.loadPrefs(f), { auto: true });
  fs.writeFileSync(f, JSON.stringify({ auto: "no", extra: 1 }));
  assert.deepEqual(u.loadPrefs(f), { auto: true });
  assert.equal(u.savePrefs(f, { auto: false }), true);
  assert.deepEqual(u.loadPrefs(f), { auto: false });
  assert.equal(fs.readFileSync(f, "utf8"), '{"auto":false}');
});

test("the test feed only accepts plain addresses on this computer", () => {
  assert.equal(u.testFeed("http://127.0.0.1:8123/feed/"), "http://127.0.0.1:8123/feed");
  assert.equal(u.testFeed("http://localhost:9000"), "http://localhost:9000");
  for (const bad of ["https://127.0.0.1:1/", "http://evil.example/", "http://127.0.0.1.evil.example/", "http://user:pw@127.0.0.1/", "file:///tmp", "", undefined, 5]) {
    assert.equal(u.testFeed(bad), null, String(bad));
  }
});

test("the updater may only reach GitHub over HTTPS, or the local test feed", () => {
  for (const ok of [
    "https://github.com/DosukaSOL/RipTide/releases/download/v0.2.0/latest.yml",
    "https://release-assets.githubusercontent.com/github-production-release-asset/1",
    "https://objects.githubusercontent.com/x",
    "https://api.github.com/repos/DosukaSOL/RipTide/releases",
  ]) assert.equal(u.isAllowedUrl(ok, null), true, ok);
  for (const bad of ["http://github.com/x", "https://github.com.evil.example/x", "https://evil.example/github.com", "https://user@github.com/x", "https://gist.githubusercontent.com/x", "ftp://github.com", "not a url"]) {
    assert.equal(u.isAllowedUrl(bad, null), false, bad);
  }
  assert.equal(u.isAllowedUrl("http://127.0.0.1:8123/latest.yml", "http://127.0.0.1:8123"), true);
  assert.equal(u.isAllowedUrl("http://127.0.0.1:9999/latest.yml", "http://127.0.0.1:8123"), false);
});

test("versions and release links are validated", () => {
  assert.equal(u.isVersion("0.2.0"), true);
  assert.equal(u.isVersion("1.0.0-beta.1"), true);
  for (const bad of ["v0.2.0", "0.2", "0.2.0/../../x", "0.2.0 ", "", null]) assert.equal(u.isVersion(bad), false, String(bad));
  assert.equal(u.releasePage("0.2.0"), "https://github.com/DosukaSOL/RipTide/releases/tag/v0.2.0");
  assert.equal(u.releasePage("../x"), "https://github.com/DosukaSOL/RipTide/releases/latest");
  assert.equal(u.assetUrl("0.2.0", "RipTide-macOS.zip", null), "https://github.com/DosukaSOL/RipTide/releases/download/v0.2.0/RipTide-macOS.zip");
  assert.equal(u.assetUrl("0.2.0", "RipTide-macOS.zip", "http://127.0.0.1:1"), "http://127.0.0.1:1/RipTide-macOS.zip");
  assert.equal(u.assetUrl("0.2.0", "../evil.zip", null), null);
  assert.equal(u.assetUrl("bad", "RipTide-macOS.zip", null), null);
});

test("each kind of install picks the right way to update", () => {
  const yes = () => true;
  const no = () => false;
  assert.equal(u.installMode({ platform: "win32" }), "auto");
  assert.equal(u.installMode({ platform: "linux", env: { APPIMAGE: "/home/a/RipTide-Linux.AppImage" }, writable: yes }), "auto");
  assert.equal(u.installMode({ platform: "linux", env: { APPIMAGE: "/opt/RipTide-Linux.AppImage" }, writable: no }), "manual");
  assert.equal(u.installMode({ platform: "linux", env: { APPIMAGE: "relative.AppImage" }, writable: yes }), "manual");
  assert.equal(u.installMode({ platform: "linux", env: {}, packageType: "deb" }), "auto");
  assert.equal(u.installMode({ platform: "linux", env: {} }), "manual");
  const exe = "/Applications/RipTide Tools.app/Contents/MacOS/RipTide Tools";
  assert.equal(u.macBundle(exe), "/Applications/RipTide Tools.app");
  assert.equal(u.installMode({ platform: "darwin", execPath: exe, writable: yes }), "mac");
  assert.equal(u.installMode({ platform: "darwin", execPath: exe, writable: no }), "manual");
  assert.equal(u.installMode({ platform: "darwin", execPath: "/Volumes/RipTide Tools/RipTide Tools.app/Contents/MacOS/RipTide Tools", writable: yes }), "manual");
  assert.equal(u.installMode({ platform: "darwin", execPath: "/private/var/folders/x/T/AppTranslocation/ABC/d/RipTide Tools.app/Contents/MacOS/RipTide Tools", writable: yes }), "manual");
  assert.equal(u.installMode({ platform: "freebsd" }), "manual");
});

test("the macOS zip is found in the release's file list", () => {
  const sha = crypto.createHash("sha512").update("x").digest("base64");
  const info = { files: [{ url: "RipTide-macOS.dmg", sha512: sha, size: 10 }, { url: "RipTide-macOS.zip", sha512: sha, size: 20 }] };
  assert.deepEqual(u.macZip(info), { name: "RipTide-macOS.zip", sha512: sha, size: 20 });
  assert.equal(u.macZip({ files: [{ url: "../../evil.zip", sha512: sha }] }), null);
  assert.equal(u.macZip({ files: [{ url: "RipTide-macOS.zip", sha512: "short" }] }), null);
  assert.equal(u.macZip({}), null);
});

test("checksums are computed and compared like electron-builder writes them", async () => {
  const dir = tmp();
  const f = path.join(dir, "a.bin");
  fs.writeFileSync(f, crypto.randomBytes(300000));
  const expected = crypto.createHash("sha512").update(fs.readFileSync(f)).digest("base64");
  const got = await u.sha512File(f);
  assert.equal(got, expected);
  assert.equal(u.sameHash(got, expected), true);
  assert.equal(u.sameHash(got, crypto.createHash("sha512").update("other").digest("base64")), false);
  assert.equal(u.sameHash(got, "abc"), false);
});

test("the page only sees a clean status", () => {
  const s = u.publicState({ status: "downloading", current: "0.1.0", version: "0.2.0", percent: 140.4, error: "x".repeat(500), mode: "auto", auto: true, dismissed: 0, checkedAt: 5, secret: "/home/me" });
  assert.deepEqual(Object.keys(s).sort(), ["auto", "checkedAt", "current", "dismissed", "error", "mode", "percent", "status", "version"]);
  assert.equal(s.percent, 100);
  assert.equal(s.error.length, 200);
  assert.equal(s.dismissed, false);
  assert.equal(u.publicState({ version: "../x" }).version, null);
});

// Waiters run as separate processes, so this test process stays free to reap the stand-in app
// when it exits (as the real app's own parent does). A blocked parent would leave a zombie.
const finished = (child) => new Promise((resolve) => child.on("close", (code) => resolve(code)));

test("waiting for an old copy to exit returns as soon as it's gone", async () => {
  const old = spawn(process.execPath, ["-e", "setTimeout(() => {}, 400)"]);
  const t = Date.now();
  const waiter = spawn(process.execPath, ["-e", `require(${JSON.stringify(require.resolve("../updates.cjs"))}).waitForExit(${old.pid}, 5000)`]);
  assert.equal(await finished(waiter), 0);
  assert.ok(Date.now() - t >= 300 && Date.now() - t < 3000, `waited ${Date.now() - t} ms`);
  const t2 = Date.now();
  u.waitForExit(process.pid, 5000); // never waits for itself
  u.waitForExit(1, 5000);
  u.waitForExit(NaN, 5000);
  assert.ok(Date.now() - t2 < 100);
});

test("an old copy that has exited but wasn't collected yet counts as gone (Linux)", { skip: process.platform !== "linux" }, () => {
  // This process blocks while waiting, so it can't collect the child: the child stays a zombie.
  const old = spawn(process.execPath, ["-e", "setTimeout(() => {}, 300)"]);
  const t = Date.now();
  u.waitForExit(old.pid, 5000);
  assert.ok(Date.now() - t < 3000, `waited ${Date.now() - t} ms`);
});

/* ---------- the macOS swap step, run with stand-ins for macOS's `open` and `xattr` ---------- */
const hasBash = spawnSync("bash", ["-c", "true"]).status === 0;
function swapFixture(withNew = true) {
  const root = tmp("riptide-swap-");
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const log = path.join(root, "log");
  fs.writeFileSync(path.join(bin, "open"), `#!/bin/bash\necho "open $1" >> "${log}"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "xattr"), `#!/bin/bash\necho "xattr $*" >> "${log}"\n`, { mode: 0o755 });
  const target = path.join(root, "RipTide Tools.app");
  fs.mkdirSync(path.join(target, "Contents"), { recursive: true });
  fs.writeFileSync(path.join(target, "Contents", "version"), "0.1.0");
  const stage = fs.mkdtempSync(path.join(root, ".riptide-update-"));
  if (withNew) {
    fs.mkdirSync(path.join(stage, "RipTide Tools.app", "Contents"), { recursive: true });
    fs.writeFileSync(path.join(stage, "RipTide Tools.app", "Contents", "version"), "0.2.0");
  }
  const script = path.join(stage, "swap.sh");
  fs.writeFileSync(script, u.MAC_SWAP, { mode: 0o700 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  return { root, log, target, stage, script, env };
}

test("macOS swap: waits for the app to quit, swaps in the new version and reopens it", { skip: !hasBash }, async () => {
  const fx = swapFixture();
  const app = spawn(process.execPath, ["-e", "setTimeout(() => {}, 700)"]);
  const t = Date.now();
  const code = await finished(spawn("bash", [fx.script, String(app.pid), fx.stage, fx.target], { env: fx.env, stdio: "ignore" }));
  assert.equal(code, 0);
  assert.ok(Date.now() - t >= 500, "waited for the app to quit");
  assert.equal(fs.readFileSync(path.join(fx.target, "Contents", "version"), "utf8"), "0.2.0");
  assert.equal(fs.existsSync(fx.stage), false, "staging folder removed");
  assert.deepEqual(fs.readdirSync(fx.root).sort(), ["RipTide Tools.app", "bin", "log"]);
  const log = fs.readFileSync(fx.log, "utf8");
  assert.match(log, /xattr -dr com\.apple\.quarantine .*RipTide Tools\.app/);
  assert.match(log, /open .*RipTide Tools\.app\n$/);
});

test("macOS swap: refuses odd arguments and leaves the installed app alone", { skip: !hasBash }, () => {
  const fx = swapFixture();
  const other = tmp("not-a-stage-");
  for (const args of [[process.pid, other, fx.target], [999999, fx.stage, path.join(fx.root, "Documents")]]) {
    const r = spawnSync("bash", [fx.script, String(args[0]), args[1], args[2]], { env: fx.env });
    assert.equal(r.status, 2);
  }
  assert.equal(fs.readFileSync(path.join(fx.target, "Contents", "version"), "utf8"), "0.1.0");
  assert.equal(fs.existsSync(fx.log), false, "nothing opened");
});

test("macOS swap: gives up without touching anything if the app never quits", { skip: !hasBash }, async () => {
  const fx = swapFixture();
  const quick = u.MAC_SWAP.replace("seq 1 300", "seq 1 3");
  fs.writeFileSync(fx.script, quick);
  const app = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"]);
  const code = await finished(spawn("bash", [fx.script, String(app.pid), fx.stage, fx.target], { env: fx.env, stdio: "ignore" }));
  app.kill();
  assert.equal(code, 4);
  assert.equal(fs.readFileSync(path.join(fx.target, "Contents", "version"), "utf8"), "0.1.0");
  assert.equal(fs.existsSync(fx.stage), false);
});

test("macOS swap: a missing new app changes nothing", { skip: !hasBash }, () => {
  const fx = swapFixture(false);
  const r = spawnSync("bash", [fx.script, "999999", fx.stage, fx.target], { env: fx.env });
  assert.equal(r.status, 3);
  assert.equal(fs.readFileSync(path.join(fx.target, "Contents", "version"), "utf8"), "0.1.0");
});

test("friendly messages never include file paths", () => {
  const { friendly } = loadFriendly();
  assert.match(friendly(new Error("sha512 checksum mismatch, expected abc")), /checksum/);
  assert.match(friendly(new Error("net::ERR_INTERNET_DISCONNECTED")), /Couldn't reach GitHub/);
  assert.match(friendly(new Error("EACCES: permission denied, open '/home/someone/x'")), /permission/);
  assert.doesNotMatch(friendly(new Error("weird /home/someone/secret")), /home/);
});

// updater.cjs needs Electron; give it a stand-in so its message helper can be tested here.
function loadFriendly() {
  const Module = require("node:module");
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === "electron") return {};
    return orig.call(this, req, ...rest);
  };
  try {
    return require("../updater.cjs");
  } finally {
    Module._load = orig;
  }
}

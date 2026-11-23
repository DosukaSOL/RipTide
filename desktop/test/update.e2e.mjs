// End-to-end test of one-tap updates on Linux, against a local update feed.
// Needs two packaged builds of the app: the AppImage that's installed (old) and the release
// folder of the version to update to (new, with latest-linux.yml).
//
// Usage (needs a display, use xvfb-run):
//   node desktop/test/update.e2e.mjs <old AppImage> <new release dir>
//
// It checks that the app finds the new version, that "Later" leaves a one-tap button in the
// top bar, that a download with the wrong checksum installs nothing, that the updater's
// network session can't reach anything but GitHub and the feed, and that "Update now"
// saves your data, replaces the AppImage, quits and starts the new version.
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const [oldAppImage, newDir] = process.argv.slice(2);
for (const p of [oldAppImage, newDir]) if (!p || !existsSync(p)) throw new Error("Usage: update.e2e.mjs <old AppImage> <new release dir>");
const yml = readFileSync(join(newDir, "latest-linux.yml"), "utf8");
const newVersion = /^version: (.+)$/m.exec(yml)[1].trim();
const newAppImage = join(newDir, "RipTide-Linux.AppImage");
const sha512 = (f) => createHash("sha512").update(readFileSync(f)).digest("base64");

/* ---------- a local feed: a good one, and one whose checksum is wrong ---------- */
const feeds = { good: yml, bad: yml.replace(/sha512: .+/g, `sha512: ${createHash("sha512").update("not the file").digest("base64")}`) };
const hits = [];
const server = createServer((req, res) => {
  const [, feed, file = ""] = new URL(req.url, "http://feed").pathname.split("/");
  hits.push(req.url);
  if (!feeds[feed]) return res.writeHead(404).end();
  if (file === "latest-linux.yml") return res.writeHead(200, { "content-type": "text/yaml" }).end(feeds[feed]);
  const f = join(newDir, decodeURIComponent(file));
  if (!/^RipTide-[\w.-]+$/.test(file) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-length": statSync(f).size });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const feedUrl = (name) => `http://127.0.0.1:${server.address().port}/${name}`;

let passed = 0;
const step = async (name, fn) => {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const home = mkdtempSync(join(tmpdir(), "riptide-upd-"));
const installed = join(home, "RipTide-Linux.AppImage");
copyFileSync(oldAppImage, installed);
chmodSync(installed, 0o755);
// Run exactly what's inside the installed AppImage (unpacked, because Playwright has to start it).
execFileSync(installed, ["--appimage-extract"], { cwd: home, stdio: "ignore" });
const exe = join(home, "squashfs-root", "riptide-tools");
const dataDir = join(home, "data");
const profile = join(home, "profile");

const launch = async (feed) => {
  const env = {
    ...process.env,
    RIPTIDE_DATA_DIR: dataDir,
    RIPTIDE_USER_DATA: profile,
    RIPTIDE_UPDATE_FEED: feedUrl(feed),
    APPIMAGE: installed,
    APPIMAGE_EXTRACT_AND_RUN: "1",
  };
  delete env.RIPTIDE_UPDATES;
  const app = await electron.launch({ executablePath: exe, args: ["--no-sandbox"], env });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(String(e)));
  await win.waitForSelector(".rt-root", { timeout: 30000 });
  return { app, win, errors };
};

/* ---------- 1. a download that doesn't match its checksum installs nothing ---------- */
{
  const { app, win, errors } = await launch("bad");
  await step("finds the new version and offers it in a popup", async () => {
    await win.getByRole("dialog").getByText(`RipTide Tools ${newVersion} is ready`).waitFor({ timeout: 30000 });
    assert.equal(await win.evaluate(() => document.activeElement?.textContent), "Update now");
  });
  await step("the updater's own network session can't reach other websites", async () => {
    const r = await app.evaluate(async ({ session }) => {
      const ses = session.fromPartition("electron-updater");
      const tryFetch = (u) => ses.fetch(u).then(() => "open", () => "blocked");
      return [await tryFetch("https://example.com/"), await tryFetch("http://github.com/"), await tryFetch("https://github.com.evil.example/")];
    });
    assert.deepEqual(r, ["blocked", "blocked", "blocked"]);
  });
  await step("a download with the wrong checksum is refused and nothing changes", async () => {
    const before = sha512(installed);
    await win.getByRole("button", { name: "Update now" }).click();
    await win.getByText("The update didn't install").waitFor({ timeout: 120000 });
    await win.getByText(/didn't match its checksum/).waitFor();
    assert.equal(sha512(installed), before, "installed AppImage untouched");
    assert.equal(app.process().exitCode, null, "app still running");
  });
  assert.deepEqual(errors, []);
  await app.close();
}

/* ---------- 2. Later, keep working, then one tap ---------- */
{
  const { app, win, errors } = await launch("good");
  const pid = app.process().pid;
  await step('"Later" closes the popup and leaves a one-tap button in the top bar', async () => {
    await win.getByRole("dialog").waitFor({ timeout: 30000 });
    await win.getByRole("button", { name: "Later" }).click();
    await win.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    await win.getByRole("button", { name: `Update to ${newVersion}` }).waitFor();
  });
  await step("settings show the new version with an Update now button", async () => {
    await win.evaluate(() => (location.hash = "/settings"));
    await win.getByText(`Version ${newVersion} is ready to install.`).waitFor();
  });
  await step("one tap downloads, saves your work, closes, replaces the AppImage and starts the new version", async () => {
    await win.evaluate(() => (location.hash = "/heist"));
    await win.getByRole("button", { name: "Create plan" }).click();
    await win.fill("#rt-plan-notes", "Typed right before updating");
    await win.getByRole("button", { name: `Update to ${newVersion}` }).click();
    await win.getByText(`Downloading ${newVersion}`).waitFor({ timeout: 10000 });
    // The app quits by itself to install. (Watch the process: the new copy inherits Playwright's
    // pipes, so Playwright itself never hears that the old one closed.)
    const gone = () => {
      try {
        process.kill(pid, 0);
        return /^\d+ \(.*\) Z /s.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
      } catch {
        return true;
      }
    };
    for (let i = 0; i < 240 && !gone(); i++) await new Promise((r) => setTimeout(r, 500));
    assert.ok(gone(), "old version quit");
    assert.match(readFileSync(join(dataDir, "riptide.heist.v1.json"), "utf8"), /Typed right before updating/);
    assert.equal(sha512(installed), sha512(newAppImage), "AppImage replaced with the new version");
    // electron-updater starts the new AppImage with RIPTIDE_UPDATED_FROM=<old pid>. Find that
    // AppImage's app process (Chromium rewrites the app's own environment block, so look at the
    // AppImage runtime that started it), check it runs the new build, and that it's still
    // running a few seconds later: it waited for the old copy instead of handing over and quitting.
    const procs = () => readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map((d) => {
      try {
        const cmd = readFileSync(`/proc/${d}/cmdline`, "utf8").split("\0");
        const ppid = Number(/^\d+ \(.*\) \S (\d+)/s.exec(readFileSync(`/proc/${d}/stat`, "utf8"))[1]);
        return { pid: Number(d), ppid, cmd };
      } catch {
        return null;
      }
    }).filter(Boolean);
    const startedByUpdate = (p) => {
      try {
        return p.cmd[0] === installed && readFileSync(`/proc/${p.pid}/environ`, "utf8").split("\0").includes(`RIPTIDE_UPDATED_FROM=${pid}`);
      } catch {
        return false;
      }
    };
    const find = () => {
      const all = procs();
      const runtimes = all.filter(startedByUpdate);
      const apps = all.filter((p) => runtimes.some((r) => r.pid === p.ppid) && /riptide-tools$/.test(p.cmd[0]) && !p.cmd.some((a) => a.startsWith("--type=")));
      return { runtimes, apps };
    };
    let found = find();
    for (let i = 0; i < 60 && !found.apps.length; i++) {
      await new Promise((r) => setTimeout(r, 500));
      found = find();
    }
    assert.ok(found.apps.length, "new version started");
    const md5 = createHash("md5").update(readFileSync(newAppImage)).digest("hex");
    assert.ok(found.apps[0].cmd[0].includes(md5), `runs the new build (${found.apps[0].cmd[0]})`);
    await new Promise((r) => setTimeout(r, 6000));
    const later = find();
    assert.ok(later.apps.some((a) => a.pid === found.apps[0].pid), "new version kept running");
    console.log(`    new copy: pid ${found.apps[0].pid}, ${basename(dirname(found.apps[0].cmd[0]))}`);
    for (const p of [...later.apps, ...later.runtimes]) process.kill(p.pid);
  });
  assert.deepEqual(errors, []);
}

await step("every update request went to the local feed", async () => {
  assert.ok(hits.some((h) => h.includes("/latest-linux.yml")));
  assert.ok(hits.some((h) => h.includes("/RipTide-Linux.AppImage")));
});
writeFileSync(join(home, "feed-hits.txt"), hits.join("\n"));
server.close();
console.log(`\n${passed} update checks passed`);
process.exit(0); // Playwright still holds the old app's connection open

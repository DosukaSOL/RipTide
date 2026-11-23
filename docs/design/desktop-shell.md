# Desktop app

RipTide Tools ships as a desktop app for Windows, macOS and Linux, built from the same code as the browser version. It lives in [`desktop/`](../../desktop).

## Why a desktop app

- **Data never gets cleared.** Everything is saved as files on your computer instead of in browser storage.
- **Works offline,** with no account.
- **Updates itself.** When a new version is out, one click installs it and reopens the app.
- **Pop-out windows** are real app windows that can sit on any monitor.

## How it's built

- **Electron** wraps the built app. It's larger than a Tauri app, but it renders the same everywhere and builds for all three systems in GitHub Actions with no extra toolchain.
- The app is served from `app://riptide/`, never from the network. Every request the app's pages make that isn't the app itself is blocked.
- Every window is sandboxed, with context isolation on and no Node access. External links open in the system browser, and navigating away from the app is blocked.
- The only bridge to the computer (`desktop/preload.cjs`) reads and writes RipTide's own data files and shows the update status. Keys must match `riptide.*`, values must be valid JSON, and calls are only accepted from the app's own pages.

## Where data lives

- `Documents/RipTide`, one readable JSON file per tool, for example `riptide.heist.v1.json`. If Documents isn't writable, the app's own data folder is used instead. **File → Open data folder** shows it, and so does Settings.
- Writes are atomic (temp file, then rename), and the previous version is kept as `<file>.json.bak`. A damaged file falls back to its backup automatically.
- On start, the files are loaded before anything reads storage. Data from earlier versions that only lived in the app's browser storage is copied to files the first time.

## Updates

One click, like a game launcher: the app checks for a new version, shows a popup, and **Update now** downloads it, closes the app, installs it and opens the new version. Code lives in `desktop/updater.cjs` (Electron side) and `desktop/updates.cjs` (the parts that are unit tested).

- **When it checks:** 4 seconds after the app opens, then every 6 hours while it's open. Settings → Updates has **Check now** and a switch to turn automatic checks off. Closing the popup with **Later** leaves an **Update to x.y.z** button in the top bar until the next launch.
- **What it sends:** a request to GitHub Releases for `latest.yml` (or `latest-mac.yml`, `latest-linux.yml`), and the download itself when you click update. No account, ID or data goes with it. GitHub sees the computer's IP address, as with any download.
- **What it can reach:** the updater has its own network session that only allows HTTPS to `github.com`, `api.github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com`. The app's pages still have no network access at all; they can only read the status and press the buttons.
- **Checking the download:** every file's sha512 is listed in the release's `latest*.yml`, and a download that doesn't match is deleted, never installed. Downgrades and pre-releases are ignored.
- **How each system installs:**
  - Windows: the new installer runs silently over the old one (electron-updater), keeping the install folder, then starts the app.
  - Linux AppImage: the AppImage file is replaced and started again. Linux `.deb`: the package is installed with `dpkg` (the system asks for your password).
  - macOS: there's no Apple certificate yet, so the standard macOS updater can't be used. RipTide downloads the zip, checks its sha512 and code signature, unpacks it next to the app, quits, and a small script swaps the new app in (putting the old one back if anything fails) and reopens it. This needs the app to be in a folder you can write to, like Applications. Run from the DMG, it opens the download page instead.
- **After restarting:** the new copy waits for the old one to finish quitting before it starts, so it never hands over to the copy on its way out.
- **Tests:** `desktop/test/updates.test.cjs` (unit tests, including the macOS swap script with stand-ins for `open` and `xattr`) and `desktop/test/update.e2e.mjs`, which updates a real Linux AppImage from one build to the next against a local feed, including a download with a wrong checksum.

## Builds and releases

- `.github/workflows/desktop.yml` builds a Windows installer, a universal macOS DMG and zip, a Linux AppImage and a `.deb`, with the `latest*.yml` update files. Run it from the Actions tab with a version like `v0.2.0` (or push that tag) to publish a GitHub Release. The version you type becomes the app's version, so each release must be higher than the last one for installed apps to update.
- The Linux build is launched and tested automatically (`desktop/test/app.e2e.mjs`): saving, restarts, backups, pop-outs, link handling, and no network or Node access.
- The builds aren't code-signed yet. macOS builds are signed ad hoc so they run on Apple silicon. Proper signing comes later.

## Building it yourself

```bash
npm install && npm run build
cd desktop && npm install
npm start        # run it
npm run dist     # build installers for your system into desktop/release
```

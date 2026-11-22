# Desktop app

RipTide Tools ships as a desktop app for Windows, macOS and Linux, built from the same code as the browser version. It lives in [`desktop/`](../../desktop).

## Why a desktop app

- **Data never gets cleared.** Everything is saved as files on your computer instead of in browser storage.
- **Works offline,** with no account.
- **Pop-out windows** are real app windows that can sit on any monitor.

## How it's built

- **Electron** wraps the built app. It's larger than a Tauri app, but it renders the same everywhere and builds for all three systems in GitHub Actions with no extra toolchain.
- The app is served from `app://riptide/`, never from the network. Every request that isn't the app itself is blocked.
- Every window is sandboxed, with context isolation on and no Node access. External links open in the system browser, and navigating away from the app is blocked.
- The only bridge to the computer (`desktop/preload.cjs`) reads and writes RipTide's own data files. Keys must match `riptide.*`, values must be valid JSON, and calls are only accepted from the app's own pages.

## Where data lives

- `Documents/RipTide`, one readable JSON file per tool, for example `riptide.heist.v1.json`. If Documents isn't writable, the app's own data folder is used instead. **File → Open data folder** shows it, and so does Settings.
- Writes are atomic (temp file, then rename), and the previous version is kept as `<file>.json.bak`. A damaged file falls back to its backup automatically.
- On start, the files are loaded before anything reads storage. Data from earlier versions that only lived in the app's browser storage is copied to files the first time.

## Builds and releases

- `.github/workflows/desktop.yml` builds a Windows installer, a universal macOS DMG, a Linux AppImage and a `.deb`. Pushing a tag like `v0.1.0` publishes them as a GitHub Release.
- The Linux build is launched and tested automatically (`desktop/test/app.e2e.mjs`): saving, restarts, backups, pop-outs, link handling, and no network or Node access.
- The builds aren't code-signed yet. macOS builds are signed ad hoc so they run on Apple silicon. Proper signing and auto-updates come later.

## Building it yourself

```bash
npm install && npm run build
cd desktop && npm install
npm start        # run it
npm run dist     # build installers for your system into desktop/release
```

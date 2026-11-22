# Desktop shell (planned, not built)

RipTide Tools runs in the browser today. Pop-out windows, multi-display placement and restore all work there, within what browsers allow. A native desktop app would remove those limits. This note records the plan so the web build doesn't paint us into a corner.

## Why a desktop app

- Place windows on any display without asking for the browser's display permission.
- Restore windows exactly, including which display they were on, after a restart.
- Read capture files from a folder the person picks (for example, PresentMon's output folder) instead of importing them one at a time.
- Run without a browser tab.

## Options

| | Tauri | Electron |
| --- | --- | --- |
| Size | Small, uses the system web view | Large, ships Chromium |
| Rendering | Differs slightly between Windows (WebView2), macOS and Linux | The same everywhere |
| Native code | Rust | Node |
| Window management | Good | Very good |

The lean is **Tauri**. The target audience is PC gamers who care about disk space and background memory, and GTA VI on PC means Windows, where WebView2 is already installed.

## Boundary between the app and the native side

The React app stays as it is. A small native layer offers a fixed, typed list of commands and nothing else:

- `windows.open(tool, geometry)`, `windows.list()`, `windows.focus(tool)`, `windows.close(tool)`
- `displays.list()` returns position, size and scale only
- `captures.watch(folder)` streams new capture files from a folder the person picked through a native dialog

Rules:

- No general file-system, shell or network access is exposed to the web layer.
- Every command validates its input with the same zod schemas used in `packages/tools`.
- The app works the same with or without the native layer. `windows.ts` checks for it and falls back to the browser code that exists today.
- Still no game memory reads, no injection and no automation. Watching a folder of files your capture tool wrote is the limit.

## When

After the web shell is accepted and replaces classic Studio. Nothing here blocks GTA VI support.

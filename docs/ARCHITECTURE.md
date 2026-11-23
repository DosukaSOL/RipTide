# Architecture

Riptide has one idea at its centre: **a server is a document**. Everything else reads or writes that document.

## The Blueprint

A Blueprint is a single JSON file (`*.riptide.json`) validated by a strict schema in [`packages/core/src/blueprint.ts`](../packages/core/src/blueprint.ts). It holds:

- `meta`: name, tagline, slots, region, language
- `engine`: which game it targets
- `world`: time, weather, traffic, police, PvP, zones
- `economy`: currency, jobs, costs, taxes, unemployment pay, autopilot
- `roles`: permissions with inheritance
- `rulebook`: plain-English rules
- `mods`: catalog references
- `visuals`: look and feel
- `access`: whitelist, application, queue priority
- `schedule`: restarts, events, weather changes
- `ops`: backups and preview servers

Because it's one file, it diffs cleanly in git, can be shared as a code, and can be compiled for different engines.

## The engine (`packages/core`)

| Module | Job |
| --- | --- |
| `blueprint.ts` | Schema, validation, permission inheritance |
| `catalog.ts` | Every integration, what it provides and needs, estimated cost |
| `compatibility.ts` | Conflicts, missing dependencies, wrong-engine mods, start order, one-click fixes |
| `budget.ts` | Server time, player memory and download estimates |
| `economy.ts` | Deterministic agent-based wallet simulation and advice |
| `rules/rulebook.ts` | Plain English to enforcement config, Markdown and Discord output |
| `readiness.ts` | Launch readiness score and checklist |
| `hosting.ts` | Machine sizing, cost estimate, region ranking |
| `share.ts` | Stable short codes and portable share strings |
| `diff.ts` | Readable Blueprint diffs for previews and history |
| `adapters/` | FiveM, GTA VI (waiting) and docker output |

The engine has no UI and no network access. The Studio and the CLI both call it directly, so they can never disagree.

## Adapters

An adapter takes a valid Blueprint and returns files. Today:

- **FiveM** writes `server.cfg`, a runtime config the Riptide runtime resource applies in game, and the rules page.
- **Docker** writes a compose stack for self-hosting.
- **GTA VI** writes a portable bundle and a capability report. When Rockstar ships PC server tooling, this adapter learns to speak it. Nothing upstream changes.

## Safety by design

- Text fields are single-line and can't contain control characters, so nothing in a Blueprint can inject extra lines into a generated config. Adapters escape again as a second layer.
- Secrets never live in a Blueprint. Adapters emit placeholders such as `{{secret:CFX_LICENSE_KEY}}` that the deploy step fills in.
- The CLI refuses to write files outside the output folder.
- Stored Studio data is re-validated on load and ignored if it fails.
- The Studio ships a strict Content Security Policy, loads no third-party scripts or fonts, and the dev server binds to `127.0.0.1` only.

## Studio (`apps/studio`)

React, bundled with esbuild. State is the Blueprint plus an undo history, saved locally after each change. Every screen derives its numbers from the engine on the fly, so moving a slider re-runs the forecast, the budget or the readiness score immediately.

## RipTide Tools (`packages/tools`, `apps/studio/src/tools`)

The app opens RipTide Tools with `?shell=tools` (remembered per device) and classic Studio otherwise. Studio runs inside the shell unchanged under `#/studio/...`.

- **`packages/tools`** holds the logic, with no UI: frame-time capture parsing and stats for ViceLab, heist plans, map places, packs, search and found tracking, window layout recovery, and versioned zod schemas for everything stored on the device. It's covered by the unit tests.
- **Shell** (`apps/studio/src/tools`): open tools stay mounted while you switch. ViceLab, Heist Ops and the map can pop out into their own windows; windows talk over a same-origin BroadcastChannel and share state through storage events.
- **Map data** (`apps/studio/assets/map/leonida`): official map tiles and community places, bundled and loaded from the app's own origin. `scripts/map/import-gtadb.mjs` rebuilds them from a local gtadb.org checkout. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
- Every stored value is validated when it's read, so corrupt or tampered storage falls back to safe defaults. The last change is saved even if the page closes straight away.

## Desktop app (`desktop`)

Electron around the same built app, served from `app://riptide/` with every window sandboxed and the network blocked. One-click updates come from GitHub Releases through a separate network session that can only reach GitHub. Data is saved as JSON files in `Documents/RipTide` with atomic writes and a backup of each file; `apps/studio/src/desktop.ts` loads the files before anything reads storage and writes every change back. Details in [design/desktop-shell.md](design/desktop-shell.md).

## Website (`site`)

A static page with no dependencies. `scripts/build-site.mjs` puts it together with the built app at `/app/`, and `.github/workflows/pages.yml` runs the tests, builds both and publishes them to GitHub Pages on every push to `main`.

## Tests

- `npm test`: unit tests for `packages/core` and `packages/tools`.
- `desktop/test/app.e2e.mjs`: launches the packaged desktop app and checks saving, restarts, backups, pop-outs and isolation.
- `npm run e2e`: browser tests for every tool, pop-out windows, keep-alive, corrupt storage, the map, and six screen sizes from 1366×768 to 1080p at 200%.

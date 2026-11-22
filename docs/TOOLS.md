# RipTide Tools (preview)

RipTide Tools is the new home for everything RipTide makes: Studio plus four companion tools in one shell. It's a preview. Classic Studio stays the default until the new shell is accepted.

## Try it

**In your browser:** https://dosukasol.github.io/RipTide/app/?shell=tools

**Locally:**

```bash
npm run build && npm run dev
```

Then open `http://127.0.0.1:5173/?shell=tools`. The choice is remembered on this device. Go back with `?shell=classic`, or turn it off under Settings → RipTide Tools shell.

Everything runs on your machine. Nothing is uploaded, and there are no accounts, analytics or network calls.

## What's built, what's a demonstration, and what waits for GTA VI

| Tool | Built and working today | Demonstration only | Blocked by GTA VI |
| --- | --- | --- | --- |
| **Shell** | Sidebar, routing, feature flag, keep-alive (open tools stay mounted with their state), Alt+1–9 and Ctrl+B, auto-collapse on narrow windows, startup animation, reduced motion | None | None |
| **RipTide Studio** | Everything in classic Studio, embedded unchanged under `#/studio/...`. Old links redirect | Hosted deploys, preview servers and deploy history (labelled "Example data") | GTA VI adapter |
| **ViceLab** | Imports real frame-time captures from PresentMon, OCAT, FrameView, CapFrameX and MangoHud. Calculates average FPS, 1% and 0.1% lows, p99 and stability. Recommends a preset from **your own runs only** (needs at least two). Wipe compare for your own screenshots. History with import/export. Hardware profiles from what the browser reports | The "Start benchmark" timer guides a run. RipTide doesn't record the game itself; you import the capture your capture tool saved | GTA VI as a game choice (disabled), GTA VI presets and settings names |
| **Heist Ops** | Plans with roles, phases, status, checklists and notes. Two templates. Export/import as a file to share with your crew. Several plans per device | The preview plan you see before creating one | Live crew rooms (see [design/heist-sync.md](design/heist-sync.md)). Any real GTA VI heist, mission or payout data. Plans are templates you fill in |
| **Interactive Map** | Rockstar's official map of Leonida, tiled and bundled. About 900 community-mapped places from gtadb.org in nine categories, with region filter, ranked search, details (type, real-world inspiration, whether you can go inside, position). Found tracking with up to 8 playthroughs, hide found, next unfound, favourites. Your own markers with categories, notes and tags. Saved filters, bookmarks, map packs with a review step. Pops out to a second window and keeps its state | None | None. Collectibles, missions and weapon pickups simply aren't mapped yet, so Collectibles shows "—" until data exists. You can track your own by giving markers the Collectibles category |
| **Workspaces** | Pop any of ViceLab, Heist Ops or the Map into its own window. Windows dock back, remember position and size, and come back on screen if a monitor is unplugged. Multi-display detection where the browser allows it (Window Management API). Saved workspaces, restore on startup | None | None. The native desktop app is planned (see [design/desktop-shell.md](design/desktop-shell.md)) |
| **Roadmap** | Honest status for every tool and 12 planned tools, each labelled with what it waits for | None | Most planned tools wait for GTA VI on PC, GTA VI Online, Rockstar's policy, or a verified data source |
| **Settings** | Motion (system, reduced, full), startup animation, shell toggle, export everything to one file, restore it, reset each store separately | None | None |
| **Help & feedback** | Keyboard shortcuts, plain-language notes, links to issues and private security reports | None | None |

## Interactive Map data

- **Map:** © Rockstar Games, the official map of Leonida released at launch. Tiles prepared by gtadb.org, bundled at zoom 0–4 (about 13 MB).
- **Places:** gtadb.org and contributors, CC BY 4.0, filtered and categorised by RipTide. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for exactly what changed.
- **Refreshing:** `node scripts/map/import-gtadb.mjs --src <gtadb checkout>` rebuilds tiles and places from a local clone. RipTide never fetches from gtadb.org while running.
- **Your progress** (found places, favourites, playthroughs, markers) stays on this device. Earlier preview markers made on the old placeholder map aren't moved to Leonida; the app offers to remove them.

## What RipTide Tools will never do

It doesn't read game memory, inject into game processes, automate gameplay, or touch anti-cheat. ViceLab reads files your own capture tools wrote. The Map shows data you or a pack you approved put there.

## Safety

- Every stored value is validated with a schema when it's read. Corrupt or tampered storage falls back to safe defaults instead of breaking the app.
- Imported files are size-capped (captures 50 MB, map packs 20 MB, plans parsed with a strict schema), and text fields have control characters stripped.
- Unsigned map packs are always downgraded to "Community" and stay hidden until you approve them, whatever they claim about themselves.
- Pop-out windows only talk to RipTide windows on the same origin, through a BroadcastChannel and storage events. They open without a link back to the opener. There's no `eval`, and nothing you import or type is ever rendered as HTML.
- Running out of storage shows a warning instead of silently losing work.

## Requirements from the design hand-off

| Requirement | Status |
| --- | --- |
| Exact logo files, brand tokens and fonts (Adventor, DM Sans, Anonymous Pro) | Done. `brand/mark.svg` and `brand/lockup.png` are copied into the build |
| No fabricated data, honest empty states, GTA VI dependencies gated | Done. Studio's example panels are labelled. Map data is credited and marked as community data |
| Two or more tools mounted at once | Done, covered by the end-to-end test |
| Map pops out to a second monitor and keeps its filters | Done, covered by the end-to-end test |
| Windows recover when a monitor is unplugged | Done (`clampToScreens`, unit-tested) |
| Keyboard support and visible focus | Done |
| Reduced motion, motion 160–240 ms | Done |
| 125–200% display scaling; 1920×1080, 1600×900, 1366×768 | Done, covered by the end-to-end test |
| No Blueprint schema change without migration | Done. The Blueprint schema didn't change |
| CLI and core tests keep passing | Done |
| Feature flag, classic Studio stays default | Done |

## Tests

```bash
npm test          # core + tools unit tests
npm run build
npm run e2e       # browser tests: every tool, pop-out, keep-alive, corrupt storage, six screen sizes
```

`npm run e2e` uses Playwright. Pass `-- --chrome /path/to/chrome` to use an installed Chrome, and `-- --shots dir` to save screenshots.

## Design references

The reference screens and hand-off notes are in [design/v2](design/v2).

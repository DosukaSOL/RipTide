# Asset register

Every artwork, screenshot, icon, font, dataset and media file in RipTide, who owns it, under what terms, and how to remove it. The full record, with paths, revisions and hashes, is [assets.json](assets.json). A test (`packages/tools/test/assets.test.ts`) fails if a tracked asset file isn't in it exactly once, or if anything containing the map art is recorded as licensed.

Prepared from the repository on 2026-11-25. Not reviewed by counsel, and not legal advice.

| Asset | Owner | Terms | Shipped in | Risk |
| --- | --- | --- | --- | --- |
| Leonida map art (2,011 tiles) | Rockstar Games; tiles prepared by gtadb.org | **No licence on record** | Repository, website `/app/`, desktop releases from v0.1.0 (unless built with `RIPTIDE_MAP_ART=off`) | High |
| Screenshots and trailer showing the map art (8 files) | RipTide UI, containing Rockstar's art | **No licence on record** for the art | Repository, README, website | High |
| Place data (`places.json`) | gtadb.org and contributors | CC BY 4.0, credited with changes stated | Every build | Low |
| Screenshots without game art (16 files) | Dosuka | All rights reserved | Repository, README, website | Low |
| Design mockups (5 files) | Dosuka | All rights reserved | Repository | Low |
| Logo, mark, wordmark, app icons | Dosuka | All rights reserved; original, not derived from game art | Everywhere | Low |
| DM Sans | The DM Sans Project Authors | OFL 1.1 | Web app, website, desktop | Low |
| Anonymous Pro | Mark Simonson | OFL 1.1 (Reserved Font Name) | Web app, website, desktop | Low |
| TeX Gyre Adventor Bold | TeX Gyre authors (GUST) | GUST Font License (LPPL 1.3c) | Web app, website, desktop | Low |
| Bundled npm code (React, Zod, d3, react-icons with Lucide icons, …) | Their authors | MIT / ISC / BSD, checked on every build | Web app, website, desktop | Low |
| Electron, electron-updater | Their authors | MIT (and the licences listed with the app) | Desktop | Low |

## Adding something

1. Add an entry to [assets.json](assets.json): owner, source, exact revision or hash, licence (an SPDX id, or `LicenseRef-…` when there isn't one), obligations, evidence of rights, where it ships, risk and how to remove it.
2. If it's third-party, add its credit to [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and, if it ships, to the app's About and credits.
3. Never add leaked builds, files extracted from games, ripped models or audio, other games' assets, or promotional art without written rights.
4. New npm dependencies that end up in the app must be under a licence on the allowlist in `scripts/licenses.mjs`; anything else needs a review first (GPL, AGPL and vendor terms in particular).

## Removing something

Each entry says how. For anything already released, removing it from Git isn't enough: replace the release assets, let the website redeploy, and remember that history, forks and caches keep old copies.

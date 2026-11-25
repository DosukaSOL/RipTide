# Map art: rights decision

**Status: undecided.** The owner, with counsel, decides. Nothing in this repository is a licence or a legal opinion, and nobody may mark the map art as cleared without written permission from the rights holder or a documented, jurisdiction-specific legal analysis.

Last updated 2026-11-25.

## What's at stake

RipTide's Interactive Map can draw the map art of Leonida: 2,011 raster tiles at zoom 0 to 4, made by gtadb.org from the map Rockstar released as a free download on 19 November 2026. The tiles are bundled in the repository, served by the GitHub Pages site under `/app/`, and included in desktop releases from v0.1.0. Exact files and hashes are in [assets.json](assets.json) (`leonida-map-tiles`), and the screenshots and trailer that show the art are listed under `promo-media-with-map-art`.

What RipTide has:

- gtadb.org's licence (CC BY 4.0) for gtadb.org's own contribution, with attribution given and changes stated.
- Rockstar's public policy on fan use of its material. It is discretionary, reserves takedown, and treats commercial uses, advertising and digital publishing as needing a licence request ([policy](https://support.rockstargames.com/articles/7bNaeoMFTV0iUDGhStTXvz/policy-on-posting-copyrighted-rockstar-games-material)). It addresses fan sites and videos and doesn't mention apps.

What RipTide doesn't have: any written permission from Rockstar or Take-Two for the artwork itself. A CC licence from gtadb.org can't grant rights gtadb.org doesn't hold, a free download isn't a redistribution licence, and attribution or a takedown address isn't permission.

## What's built so the decision is easy to carry out

- **A switch.** Builds made with `RIPTIDE_MAP_ART=off` leave the art out entirely: no tiles, no manifest, no requests for them. CI reads the repository variable `RIPTIDE_MAP_ART` (Settings → Secrets and variables → Actions → Variables), so the owner can switch the website and the next desktop release without a code change. The default is `on`, which keeps today's behaviour until a decision is made.
- **A fallback that keeps everyone's data.** The map's places, found progress, playthroughs, favourites and personal markers are stored in in-game coordinates and never depend on the background. Without the art, the map draws RipTide's own schematic grid: a plain coordinate grid and a box for the land area, drawn from coordinates only. Nothing is traced, recoloured or redrawn from the map art.
- **A per-person choice.** Settings → Map background lets anyone use the grid even when the art is built in.
- **Separate credits.** The map credit names Rockstar only while the art is shown; the place data's CC BY credit is always shown, separately.
- **Tests.** A browser test checks that switching the art off keeps the same places, progress and marker coordinates and requests no tiles; another builds without the art and checks that the app works and never asks for it. A unit test fails if anything that contains the art is recorded as licensed.

## Options

| Option | What users see | Risk | What it takes |
| --- | --- | --- | --- |
| A. Keep shipping the art while asking for permission | The map as today | Highest: continues distribution with no licence | Nothing now; act on Rockstar's answer |
| B. Contain now: switch the art off, ask for permission | Schematic grid; same places and progress | Lowest available today | Set `RIPTIDE_MAP_ART=off`, release, clean up old assets (below) |
| C. Website off, desktop on (or the reverse) | Mixed | Still distributes the art | Not supported by one variable; not recommended |
| D. Let people load their own map image, calibrated locally | Their own image under RipTide's markers | Depends on jurisdiction and source | Counsel review of the design first; not built |

## Recommendation for the owner and counsel

Option B. It removes the distribution question while the permission request is open, costs users nothing they've saved, and can be reversed with one variable if Rockstar grants permission. Send the permission request ([draft](PERMISSION_REQUEST_DRAFT.md)) either way.

## If the art is switched off

1. Set the repository variable `RIPTIDE_MAP_ART` to `off`.
2. Push any commit to `main` (or re-run the "Website" workflow) so GitHub Pages redeploys without the tiles.
3. Raise `version` in `desktop/package.json` and push, so a desktop release without the art is published and installed apps update to it.
4. Delete the installers from earlier releases (v0.1.0 at the time of writing) or the releases themselves; their files contain the art.
5. Replace the media marked `mapArt` in assets.json: re-capture with the schematic grid, update the README and `site/index.html`, and change site copy that promises "the official map".
6. Removing files from Git doesn't remove them from history, forks, download caches or copies people already have. Rewriting history is a separate decision for counsel.

## Decision record

Fill in when decided. Keep correspondence privately, outside this repository.

| Date | Decision | Decided by | Basis (permission, legal analysis) | Scope (site, desktop, territories, term) |
| --- | --- | --- | --- | --- |
| | | | | |

## Open questions for counsel

- Does the current distribution need to stop before Rockstar answers?
- Does showing the art in a free, independent app and website fall within Rockstar's fan policy at all, given it addresses fan sites and videos and not apps?
- Is gtadb.org's derived tile set acceptable to Rockstar, or would a licence require a different master?
- Would a future paid feature, sponsorship or hosting change the answer? (Today RipTide is free.)
- Is option D (a person's own image, local only) acceptable in the territories RipTide is offered in?

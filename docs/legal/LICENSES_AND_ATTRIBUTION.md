# Licences and attribution

How each kind of material in RipTide is licensed, and where its credit appears. RipTide's own licence doesn't change anyone else's terms: putting a proprietary `LICENSE` at the root of the repository doesn't relicense third-party code, fonts, data or artwork.

| Material | Licence | Credit shown in |
| --- | --- | --- |
| RipTide code, designs, brand, docs | Proprietary, source-available, all rights reserved ([LICENSE](../../LICENSE)) | README, About and credits |
| Map art of Leonida | © Rockstar Games; **no licence on record** ([decision](MAP_RIGHTS_DECISION.md)) | Map corner and footer while the art is shown, About and credits, site footer, THIRD_PARTY_NOTICES.md |
| Place data | CC BY 4.0, gtadb.org and contributors, changed by RipTide | Map corner and footer (always, separately from the map art), place details, About and credits, THIRD_PARTY_NOTICES.md |
| Fonts | OFL 1.1 (DM Sans, Anonymous Pro), GUST Font License (TeX Gyre Adventor) | Font metadata, THIRD_PARTY_LICENSES.txt, About and credits |
| Bundled npm packages | MIT, ISC, BSD (allowlist in `scripts/licenses.mjs`) | THIRD_PARTY_LICENSES.txt, generated on every build and shown from About and credits |
| Lucide icons (via react-icons) | ISC, with Feather-derived icons under MIT | THIRD_PARTY_LICENSES.txt |
| Electron and electron-updater (desktop) | MIT and the licences of their dependencies | Shipped with the desktop app (`vendor/electron-updater.LICENSES.txt`, Electron's licence files) |

## Wording

- The map art credit is "Map of Leonida © Rockstar Games. Tiles prepared by gtadb.org." It's shown only while the art is shown. It must never say the tiles are CC BY.
- The place data credit names gtadb.org and contributors, links CC BY 4.0, and says RipTide filtered, recategorised and removed addresses.
- RipTide is "independent, not affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive". This appears in the app's sidebar, in Help → About and credits, in the website footer, in THIRD_PARTY_NOTICES.md and in the README.
- "Official" describes a source ("the official map Rockstar released"), never an endorsement. Use game titles as plain names; don't use Rockstar or GTA logos as RipTide's identity.

## Generated files

- `THIRD_PARTY_LICENSES.txt` is written into the built app by `scripts/build-studio.mjs`. The build fails if a bundled package has no licence file or a licence that isn't on the allowlist.
- `docs/INTEGRATIONS.md` is generated from `packages/core/src/capabilities.ts` (`npm run docs:status`).

# Third-party notices

RipTide's own code and brand are covered by [LICENSE](LICENSE). The material below belongs to others and keeps its own terms.

## Leonida map (Interactive Map)

Files: `apps/studio/assets/map/leonida/`

### Map imagery

The map of Leonida is © Rockstar Games, from the official map Rockstar released as a free download on 19 November 2026. The tiles were prepared by [gtadb.org](https://map.gtadb.org) and are bundled unchanged at zoom levels 0 to 4.

RipTide is not affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. If you're a rights holder and want this changed, please open an issue or use the private security report on GitHub to reach the maintainer.

### Place data

GTA VI Landmarks Data (CC BY 4.0), https://map.gtadb.org, by gtadb.org and contributors.

- Source: https://github.com/rolux/gtadb.org (the revision used is recorded in `places.json`)
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- **Changes made by RipTide:** removed entries tagged unconfirmed, demolished, possible duplicate or "may not exist"; removed unnamed buildings that have no known in-game use; sorted places into RipTide's categories; kept only venue names for real-world inspirations and removed every street address and private residence; rounded positions to 0.1 m; converted to a compact file format.

The data is a community effort and may not all be exact. Corrections belong upstream on map.gtadb.org, and RipTide picks them up when the data is refreshed with `scripts/map/import-gtadb.mjs`. RipTide never contacts gtadb.org at runtime: everything is bundled.

## Fonts

Files: `apps/studio/public/fonts/`

- DM Sans and Anonymous Pro: SIL Open Font License 1.1
- TeX Gyre Adventor: GUST Font License

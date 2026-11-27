# What RipTide Studio does with each part of a server

<!-- Generated from packages/core/src/capabilities.ts by `npm run docs:status`. Edit that file, not this one. -->

RipTide Studio designs GTA V servers and exports their FiveM `server.cfg`. It doesn't host servers, and it doesn't run anything inside a game. This page says, for every part of a Blueprint, exactly what happens to it today.

| Status | Meaning |
| --- | --- |
| Works today | Works in RipTide today, inside the app or the CLI. |
| Exported to server.cfg | Written into the FiveM server.cfg that RipTide exports. RipTide doesn't run or host the server. |
| Simulated | Shown as a simulation or estimate. Nothing real happens (no server starts, nothing is posted). |
| Experimental | Produces output, but it isn't ready to rely on. The note says why. |
| Waiting for GTA VI and permission | Needs GTA VI's PC release, official server tooling and the rights to use them. Nothing is built against unreleased or unofficial interfaces. |
| Planned | Not built yet. Where you can already set it in a Blueprint, it's saved but not applied anywhere. |

## Core game setup

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Identity | Name, tagline, tags, language | Exported to server.cfg | Server icon and loading screen aren't exported. |
| Slots | Max players | Exported to server.cfg | Reserved slots and queue priority are saved in the Blueprint but not applied. |
| Game build | Pin a game build | Exported to server.cfg | Scheduled auto-updates aren't built. FiveM for GTA V Enhanced always uses the latest build. |
| FiveM edition | GTA V Legacy, or FiveM for GTA V Enhanced (early access) | Exported to server.cfg | For Enhanced, server.cfg skips the build pin, and RipTide flags graphic mods and Mumble voice and lists what changes (escrow, Cfx Server, .NET). |
| Framework | Qbox, QBCore or ESX Legacy from the catalog | Exported to server.cfg | A framework generated from your Blueprint (Riptide Core) isn't built. |
| Start order | Worked out from what each mod needs | Exported to server.cfg |  |
| Database | Managed database, restore points, preview branches | Planned |  |

## World

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Time and weather | Real time, faster days, locked hour, synced weather | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| Traffic, police and PvP | Densities, police mode, PvP per zone | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| Zones | Safe zones, speed limits, no-weapon areas | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| Map changes | Interiors, add-ons, removed props | Planned |  |
| Seasonal events | Decorations and events on a calendar | Planned |  |

## Economy

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Currency, jobs, costs and taxes | Starting cash, pay per hour, prices, tax rules | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| Forecast | Simulate 30 or 60 days of player wallets before launch | Works today | A model inside Studio, based on your Blueprint's numbers. It isn't data from a real server. |
| Autopilot | Nudges property tax weekly to keep the median wallet steady | Simulated | Only inside the forecast model. |
| Live economy view | Money supply and suspicious spikes on a running server | Planned |  |

## People

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Roles and permissions | Colours, inheritance, permission matrix | Exported to server.cfg | Exported as ACE groups. Slot limits per role aren't applied. |
| Discord role sync | A Discord role grants an in-game role | Planned |  |
| Whitelist and applications | Questions, reviewers, accept from Discord | Planned | The questions can be designed in the Blueprint. |
| Account checks | Minimum account age, Discord membership | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| Staff tools | Reports, spectate, bans, staff audit log | Planned |  |

## Rules

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Rulebook | Write rules in plain English, grouped in sections | Works today | Rules RipTide understands are turned into machine-readable rules; invalid times are refused. |
| Enforcing rules in-game | Zone rules, speed limits, police minimums, time windows, restarts | Planned | Rules are parsed, not enforced. Nothing in a game reads them yet. |
| Rules page | Markdown page and a Discord post preview, always in sync | Works today | RipTide doesn't post to Discord; copy the preview yourself. |
| Rule versions | See which rules changed in each deploy | Planned |  |

## Mods and content

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Catalog | Real, public FiveM resources: Qbox, QBCore, ESX Legacy, ox_lib, oxmysql, ox_inventory, pma-voice | Works today | Each entry gives the resource folder name, source and licence, and the dependencies in its own fxmanifest.lua. |
| Compatibility | Duplicates, missing dependencies, conflicts, wrong-game mods, with one-click fixes | Works today |  |
| Performance budget | Server time, player memory and download size | Planned | RipTide has no measured numbers for these resources, so it doesn't estimate them. |
| Custom resources | Import your own scripts and assets | Planned |  |
| Asset streaming | First-join download size, CDN for large downloads | Planned |  |

## Look and feel

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Visual presets and tuning | Neon Nights, Film Stock, Natural Light; glow, grain, colour | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| HUD theme and loading screen | Styled from your brand colours | Planned |  |

## Community and growth

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Share codes | Publish a Blueprint as a code others can remix | Works today | In the CLI: riptide share and riptide import. |
| Discord | Rules post, applications, role sync, deploy announcements | Planned |  |
| Streamers | Streamer mode, live badges | Planned |  |
| Store | Supporter perks through Tebex, within the platform's rules | Planned |  |
| Template gallery | Start from community Blueprints | Planned |  |

## Running it

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Download server.cfg | The FiveM config for your Blueprint | Works today | From the Deploy screen or riptide build --target fivem. |
| Check and build | Validate the Blueprint and build server.cfg in one step | Works today | On the Deploy screen. You run the file on your own FiveM server. |
| Hosting | Deploy to a region with a cost estimate | Planned | RipTide doesn't host servers, so it shows no prices or regions. |
| Self-hosting | docker-compose stack | Planned | The server images it would need don't exist yet. |
| Preview servers and deploy history | Branch, test with staff, merge, roll back | Planned |  |
| Backups and restarts | Database backup schedule, scheduled restarts with countdown | Planned | You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist. |
| Monitoring and DDoS protection | Tick time, crashes, alerts; protection with hosting | Planned |  |

## Safety and access

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| Secrets | License keys and passwords never stored in Blueprints, only placeholders | Works today |  |
| Anti-cheat checks | Server-side checks on money, teleports and spawned entities | Planned |  |
| Accessibility on the server | Subtitles, colour-blind filters, text scaling | Planned |  |
| Voice captions | Live captions in proximity voice | Waiting for GTA VI and permission |  |

## GTA VI

| Area | What it covers | Status | What happens today |
| --- | --- | --- | --- |
| GTA VI adapter | Move a Blueprint to GTA VI servers | Waiting for GTA VI and permission | For now it's a passive export of your Blueprint, not a connection to any server. Nothing is built until official tooling exists and its terms allow it. |

## Content RipTide won't use

Leaked or stolen assets, files extracted from games, and assets from other games are refused in the catalog and won't be accepted when custom resources arrive.

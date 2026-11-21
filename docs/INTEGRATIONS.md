# Everything a server can plug in

This is the full map of what Riptide aims to manage from one Blueprint. It is a living document: it grows as we learn what GTA VI's PC version and online framework allow.

How to read the status column:

- **Today**: works in the current preview on GTA V (FiveM).
- **Next**: designed and scheduled for the first public builds.
- **GTA VI**: waiting on Rockstar's PC release and server tooling. Designed engine-agnostic so it ports on day one.
- **Exploring**: we want it and are working out how.

## Core game setup

| Area | What you control | Status |
| --- | --- | --- |
| Identity | Name, tagline, tags, language, server icon, loading screen | Today |
| Slots and queue | Max players, reserved slots, queue priority by role, supporter priority | Today |
| Game build | Pin a game build, auto-update on a schedule or hold back | Today |
| Framework | Qbox, QBCore, ESX Legacy, or Riptide Core (generated from your Blueprint) | Today, Riptide Core in GTA VI |
| Database | Managed MariaDB, point-in-time restore, preview branches | Next |
| Start order | Worked out from what each mod needs | Today |

## World

| Area | What you control | Status |
| --- | --- | --- |
| Time | Real time, faster days, locked hour | Today |
| Weather | Dynamic, synced for everyone, locked, scheduled storms | Today |
| Traffic and people | Vehicle and pedestrian density, per zone overrides | Today |
| Police | Off, AI, player-run, or both | Today |
| PvP | On or off, per zone | Today |
| Zones | Safe zones, speed limits, no-weapon areas, custom flags | Today |
| Map changes | Interiors, map add-ons, removed props | Today |
| Seasonal events | Holiday decorations, beach parties, car meets on a calendar | Next |

## Economy

| Area | What you control | Status |
| --- | --- | --- |
| Currency | Name, symbol, starting cash and bank | Today |
| Jobs | Pay per hour, slots, how many players pick each job | Today |
| Costs | Food, fuel, rent, repairs, vehicles and anything else players pay for | Today |
| Taxes | Income, sales and weekly property tax with a threshold | Today |
| Unemployment pay | Hourly support for players without a job | Today |
| Forecast | Simulate 30 or 60 days of player wallets before launch | Today |
| Autopilot | Nudges property tax weekly to keep the median wallet steady | Today |
| Live economy view | Real money supply, top earners and suspicious spikes after launch | Next |

## People

| Area | What you control | Status |
| --- | --- | --- |
| Roles | Colours, inheritance, slot limits | Today |
| Permissions | Visual matrix, inherited permissions shown at a glance | Today |
| Discord role sync | A Discord role grants an in-game role and back | Next |
| Whitelist and applications | Questions, reviewers, accept from Discord | Today (design), Next (Discord flow) |
| Account checks | Minimum account age, Discord membership | Today |
| Staff tools | Reports, spectate, noclip, kicks and bans, audit log of staff actions | Next |

## Rules

| Area | What you control | Status |
| --- | --- | --- |
| Rulebook | Write rules in plain English, grouped in sections | Today |
| Automatic enforcement | Zone rules, speed limits, minimum police online, gang size caps, new player limits, time windows, cooldowns, restarts | Today |
| Rules page | Generated Markdown page and Discord post, always in sync | Today |
| Rule versions | See which rules changed in each deploy | Next |

## Mods and content

| Area | What you control | Status |
| --- | --- | --- |
| Catalog | Frameworks, inventory, voice, phone, HUD, housing, garages, jobs, police and EMS tools, interiors, clothing | Today |
| Compatibility | Spots duplicates, missing dependencies, known conflicts and wrong-game mods, with one-click fixes | Today |
| Performance budget | Server time per tick, player memory and download size before you install | Today |
| Custom resources | Import your own scripts and assets, scanned for obvious malware patterns | Next |
| Asset streaming | CDN for large downloads, first-join time estimate | Today (estimate), Next (CDN) |
| Leaked or stolen assets | Blocked. Riptide refuses assets from other games and leaks | Policy |

## Look and feel

| Area | What you control | Status |
| --- | --- | --- |
| Visual presets | Neon Nights, Film Stock, Natural Light, more to come | Today |
| Fine tuning | Glow, film grain, colour | Today |
| Player opt-out | Players can switch to the default look | Today |
| HUD theme | HUD styled from your brand colours, colour-blind safe mode | Next |
| Loading screen | Built from your server's name, art and rules | Next |

## Community and growth

| Area | What you control | Status |
| --- | --- | --- |
| Discord | Rules post, applications, role sync, log channels, deploy announcements | Next |
| Streamers | Streamer mode that hides IPs and DMs, live badges for Twitch and Kick | Next |
| Store | Supporter perks and queue priority through Tebex, within the platform's rules | Next |
| Share codes | Publish a Blueprint as a code others can remix | Today |
| Template gallery | Start from community Blueprints | Exploring |

## Running it

| Area | What you control | Status |
| --- | --- | --- |
| Hosting | One-click deploy in eight regions, price estimate up front | Today (simulated), Next (live) |
| Region pick | Ranked by where your Discord members are | Today |
| Self-hosting | docker-compose stack from the CLI | Today |
| Preview servers | Branch your server, test changes with staff, merge | Next |
| Deploy history | Every deploy kept, one-click rollback | Next |
| Backups | Schedule and retention | Today |
| Restarts | Scheduled, with in-game countdown | Today |
| Monitoring | Tick time, player count, crashes, alerts to Discord | Next |
| DDoS protection | Included with Riptide hosting | Next |

## Safety and access

| Area | What you control | Status |
| --- | --- | --- |
| Anti-cheat | Server-side checks on money, teleports and spawned entities | Next |
| Secrets | License keys and passwords never stored in Blueprints, only placeholders | Today |
| Accessibility | Subtitles, colour-blind filters, text scaling, one-handed controls | Next |
| Voice captions | Live captions in proximity voice | GTA VI |

## GTA VI

Everything above is designed so it does not depend on GTA V. When Rockstar ships the PC version and its server tooling, the GTA VI adapter learns to speak it and your Blueprint moves over. We track what's known in [`packages/core/src/adapters/gta6.ts`](../packages/core/src/adapters/gta6.ts) and update it as news lands.

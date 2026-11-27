/**
 * The single source of truth for what RipTide Studio actually does with each part of a server.
 * docs/INTEGRATIONS.md is generated from this list (npm run docs:status), and a test fails if
 * the two drift apart. Statuses describe the code that runs today, never plans.
 */

export type CapabilityStatus = "implemented" | "config-only" | "simulated" | "experimental" | "waiting-for-permission" | "future";

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  implemented: "Works today",
  "config-only": "Exported to server.cfg",
  simulated: "Simulated",
  experimental: "Experimental",
  "waiting-for-permission": "Waiting for GTA VI and permission",
  future: "Planned",
};

export const STATUS_MEANING: Record<CapabilityStatus, string> = {
  implemented: "Works in RipTide today, inside the app or the CLI.",
  "config-only": "Written into the FiveM server.cfg that RipTide exports. RipTide doesn't run or host the server.",
  simulated: "Shown as a simulation or estimate. Nothing real happens (no server starts, nothing is posted).",
  experimental: "Produces output, but it isn't ready to rely on. The note says why.",
  "waiting-for-permission": "Needs GTA VI's PC release, official server tooling and the rights to use them. Nothing is built against unreleased or unofficial interfaces.",
  future: "Not built yet. Where you can already set it in a Blueprint, it's saved but not applied anywhere.",
};

export interface Capability {
  area: string;
  what: string;
  status: CapabilityStatus;
  /** What exactly happens today, when the status alone could mislead. */
  note?: string;
}

const NOT_APPLIED = "You can set it in the Blueprint. Nothing applies it in-game yet: that needs a RipTide server runtime, which doesn't exist.";

export const CAPABILITIES: { section: string; items: Capability[] }[] = [
  {
    section: "Core game setup",
    items: [
      { area: "Identity", what: "Name, tagline, tags, language", status: "config-only", note: "Server icon and loading screen aren't exported." },
      { area: "Slots", what: "Max players", status: "config-only", note: "Reserved slots and queue priority are saved in the Blueprint but not applied." },
      { area: "Game build", what: "Pin a game build", status: "config-only", note: "Scheduled auto-updates aren't built. FiveM for GTA V Enhanced always uses the latest build." },
      { area: "FiveM edition", what: "GTA V Legacy, or FiveM for GTA V Enhanced (early access)", status: "config-only", note: "For Enhanced, server.cfg skips the build pin, and RipTide flags graphic mods and Mumble voice and lists what changes (escrow, Cfx Server, .NET)." },
      { area: "Framework", what: "Qbox, QBCore or ESX Legacy from the catalog", status: "config-only", note: "A framework generated from your Blueprint (Riptide Core) isn't built." },
      { area: "Start order", what: "Worked out from what each mod needs", status: "config-only" },
      { area: "Database", what: "Managed database, restore points, preview branches", status: "future" },
    ],
  },
  {
    section: "World",
    items: [
      { area: "Time and weather", what: "Real time, faster days, locked hour, synced weather", status: "future", note: NOT_APPLIED },
      { area: "Traffic, police and PvP", what: "Densities, police mode, PvP per zone", status: "future", note: NOT_APPLIED },
      { area: "Zones", what: "Safe zones, speed limits, no-weapon areas", status: "future", note: NOT_APPLIED },
      { area: "Map changes", what: "Interiors, add-ons, removed props", status: "future" },
      { area: "Seasonal events", what: "Decorations and events on a calendar", status: "future" },
    ],
  },
  {
    section: "Economy",
    items: [
      { area: "Currency, jobs, costs and taxes", what: "Starting cash, pay per hour, prices, tax rules", status: "future", note: NOT_APPLIED },
      { area: "Forecast", what: "Simulate 30 or 60 days of player wallets before launch", status: "implemented", note: "A model inside Studio, based on your Blueprint's numbers. It isn't data from a real server." },
      { area: "Autopilot", what: "Nudges property tax weekly to keep the median wallet steady", status: "simulated", note: "Only inside the forecast model." },
      { area: "Live economy view", what: "Money supply and suspicious spikes on a running server", status: "future" },
    ],
  },
  {
    section: "People",
    items: [
      { area: "Roles and permissions", what: "Colours, inheritance, permission matrix", status: "config-only", note: "Exported as ACE groups. Slot limits per role aren't applied." },
      { area: "Discord role sync", what: "A Discord role grants an in-game role", status: "future" },
      { area: "Whitelist and applications", what: "Questions, reviewers, accept from Discord", status: "future", note: "The questions can be designed in the Blueprint." },
      { area: "Account checks", what: "Minimum account age, Discord membership", status: "future", note: NOT_APPLIED },
      { area: "Staff tools", what: "Reports, spectate, bans, staff audit log", status: "future" },
    ],
  },
  {
    section: "Rules",
    items: [
      { area: "Rulebook", what: "Write rules in plain English, grouped in sections", status: "implemented", note: "Rules RipTide understands are turned into machine-readable rules; invalid times are refused." },
      { area: "Enforcing rules in-game", what: "Zone rules, speed limits, police minimums, time windows, restarts", status: "future", note: "Rules are parsed, not enforced. Nothing in a game reads them yet." },
      { area: "Rules page", what: "Markdown page and a Discord post preview, always in sync", status: "implemented", note: "RipTide doesn't post to Discord; copy the preview yourself." },
      { area: "Rule versions", what: "See which rules changed in each deploy", status: "future" },
    ],
  },
  {
    section: "Mods and content",
    items: [
      { area: "Catalog", what: "Frameworks, inventory, voice, phone, HUD, housing, jobs, interiors", status: "implemented", note: "Unreleased catalog entries are left out of builds." },
      { area: "Compatibility", what: "Duplicates, missing dependencies, conflicts, wrong-game mods, with one-click fixes", status: "implemented" },
      { area: "Performance budget", what: "Server time, player memory and download size", status: "implemented", note: "Estimates from catalog numbers, not measurements." },
      { area: "Custom resources", what: "Import your own scripts and assets", status: "future" },
      { area: "Asset streaming", what: "First-join download estimate, CDN for large downloads", status: "implemented", note: "The estimate works. The CDN isn't built." },
    ],
  },
  {
    section: "Look and feel",
    items: [
      { area: "Visual presets and tuning", what: "Neon Nights, Film Stock, Natural Light; glow, grain, colour", status: "future", note: NOT_APPLIED },
      { area: "HUD theme and loading screen", what: "Styled from your brand colours", status: "future" },
    ],
  },
  {
    section: "Community and growth",
    items: [
      { area: "Share codes", what: "Publish a Blueprint as a code others can remix", status: "implemented", note: "In the CLI: riptide share and riptide import." },
      { area: "Discord", what: "Rules post, applications, role sync, deploy announcements", status: "future" },
      { area: "Streamers", what: "Streamer mode, live badges", status: "future" },
      { area: "Store", what: "Supporter perks through Tebex, within the platform's rules", status: "future" },
      { area: "Template gallery", what: "Start from community Blueprints", status: "future" },
    ],
  },
  {
    section: "Running it",
    items: [
      { area: "Download server.cfg", what: "The FiveM config for your Blueprint", status: "implemented", note: "From the Deploy screen or riptide build --target fivem." },
      { area: "Hosting", what: "Deploy to a region with a cost estimate", status: "simulated", note: "The Deploy screen checks and builds your Blueprint for real, then simulates the hosting steps. No server starts." },
      { area: "Region pick", what: "Ranked by where your Discord members are", status: "simulated", note: "Uses example member locations." },
      { area: "Self-hosting", what: "docker-compose stack from the CLI", status: "experimental", note: "An example file: the Riptide images it names aren't published, so it won't start as-is." },
      { area: "Preview servers and deploy history", what: "Branch, test with staff, merge, roll back", status: "future", note: "The Studio overview shows example data." },
      { area: "Backups and restarts", what: "Database backup schedule, scheduled restarts with countdown", status: "future", note: NOT_APPLIED },
      { area: "Monitoring and DDoS protection", what: "Tick time, crashes, alerts; protection with hosting", status: "future" },
    ],
  },
  {
    section: "Safety and access",
    items: [
      { area: "Secrets", what: "License keys and passwords never stored in Blueprints, only placeholders", status: "implemented" },
      { area: "Anti-cheat checks", what: "Server-side checks on money, teleports and spawned entities", status: "future" },
      { area: "Accessibility on the server", what: "Subtitles, colour-blind filters, text scaling", status: "future" },
      { area: "Voice captions", what: "Live captions in proximity voice", status: "waiting-for-permission" },
    ],
  },
  {
    section: "GTA VI",
    items: [
      { area: "GTA VI adapter", what: "Move a Blueprint to GTA VI servers", status: "waiting-for-permission", note: "For now it's a passive export of your Blueprint, not a connection to any server. Nothing is built until official tooling exists and its terms allow it." },
    ],
  },
];

const cell = (s: string) => s.replace(/\|/g, "\\|");

/** docs/INTEGRATIONS.md, generated from CAPABILITIES. */
export function renderIntegrationsDoc(): string {
  const out: string[] = [
    "# What RipTide Studio does with each part of a server",
    "",
    "<!-- Generated from packages/core/src/capabilities.ts by `npm run docs:status`. Edit that file, not this one. -->",
    "",
    "RipTide Studio designs GTA V servers and exports their FiveM `server.cfg`. It doesn't host servers, and it doesn't run anything inside a game. This page says, for every part of a Blueprint, exactly what happens to it today.",
    "",
    "| Status | Meaning |",
    "| --- | --- |",
    ...(Object.keys(STATUS_LABEL) as CapabilityStatus[]).map((s) => `| ${STATUS_LABEL[s]} | ${STATUS_MEANING[s]} |`),
    "",
  ];
  for (const { section, items } of CAPABILITIES) {
    out.push(`## ${section}`, "", "| Area | What it covers | Status | What happens today |", "| --- | --- | --- | --- |");
    for (const c of items) out.push(`| ${cell(c.area)} | ${cell(c.what)} | ${STATUS_LABEL[c.status]} | ${cell(c.note ?? "")} |`);
    out.push("");
  }
  out.push(
    "## Content RipTide won't use",
    "",
    "Leaked or stolen assets, files extracted from games, and assets from other games are refused in the catalog and won't be accepted when custom resources arrive.",
    "",
  );
  return out.join("\n");
}

/** How many areas have each status. */
export function capabilityCounts(): Record<CapabilityStatus, number> {
  const n = { implemented: 0, "config-only": 0, simulated: 0, experimental: 0, "waiting-for-permission": 0, future: 0 } as Record<CapabilityStatus, number>;
  for (const s of CAPABILITIES) for (const c of s.items) n[c.status]++;
  return n;
}

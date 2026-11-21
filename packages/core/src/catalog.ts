import type { EngineTarget } from "./blueprint";

/**
 * The integration catalog: everything a server can plug in.
 * Costs are Riptide's estimates from profiling typical setups and are
 * shown in the Studio as estimates, never as guarantees.
 */

export type Category =
  | "framework"
  | "inventory"
  | "voice"
  | "phone"
  | "hud"
  | "housing"
  | "vehicles"
  | "jobs"
  | "maps"
  | "clothing"
  | "anticheat"
  | "admin"
  | "database"
  | "community"
  | "streaming"
  | "store"
  | "analytics"
  | "visuals"
  | "accessibility";

export interface Cost {
  /** Server script time per tick, milliseconds. */
  serverMs: number;
  /** Extra server ms per 100 connected players. */
  serverMsPer100: number;
  /** Client memory, MB. */
  clientMB: number;
  /** Streamed assets players download, MB. */
  streamMB: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: Category;
  summary: string;
  /** Capabilities this item provides, e.g. "inventory". */
  provides: string[];
  /** Capabilities this item needs from something else. */
  requires: string[];
  /** Capabilities where only one provider may run. */
  exclusive?: string[];
  conflictsWith?: string[];
  engines: EngineTarget[];
  cost: Cost;
  status: "ready" | "beta" | "planned";
  author: string;
}

const c = (serverMs: number, serverMsPer100: number, clientMB: number, streamMB: number): Cost => ({
  serverMs,
  serverMsPer100,
  clientMB,
  streamMB,
});

const both: EngineTarget[] = ["fivem", "gta6"];
const fivem: EngineTarget[] = ["fivem"];

export const CATALOG: CatalogItem[] = [
  // Frameworks
  { id: "qbox", name: "Qbox", category: "framework", summary: "Modern roleplay core: players, jobs, money, metadata.", provides: ["framework", "money", "jobs-core"], requires: ["database"], exclusive: ["framework"], engines: fivem, cost: c(0.6, 0.35, 40, 2), status: "ready", author: "Qbox Project" },
  { id: "qbcore", name: "QBCore", category: "framework", summary: "The most widely used roleplay framework.", provides: ["framework", "money", "jobs-core"], requires: ["database"], exclusive: ["framework"], engines: fivem, cost: c(0.8, 0.45, 45, 2), status: "ready", author: "QBCore" },
  { id: "esx", name: "ESX Legacy", category: "framework", summary: "Battle-tested economy-first framework.", provides: ["framework", "money", "jobs-core"], requires: ["database"], exclusive: ["framework"], engines: fivem, cost: c(0.9, 0.5, 42, 2), status: "ready", author: "ESX" },
  { id: "riptide-core", name: "Riptide Core", category: "framework", summary: "Engine-agnostic core generated from your Blueprint. Ships with GTA VI support.", provides: ["framework", "money", "jobs-core"], requires: ["database"], exclusive: ["framework"], engines: both, cost: c(0.4, 0.25, 30, 1), status: "planned", author: "Riptide" },

  // Data
  { id: "oxmysql", name: "oxmysql", category: "database", summary: "Fast async MySQL/MariaDB driver.", provides: ["database"], requires: [], exclusive: ["database"], engines: fivem, cost: c(0.1, 0.05, 0, 0), status: "ready", author: "Overextended" },
  { id: "riptide-data", name: "Riptide Data", category: "database", summary: "Managed MariaDB with point-in-time restore and preview branches.", provides: ["database", "backups"], requires: [], exclusive: ["database"], engines: both, cost: c(0.1, 0.05, 0, 0), status: "beta", author: "Riptide" },

  // Inventory
  { id: "ox-inventory", name: "ox_inventory", category: "inventory", summary: "Slot inventory with weights, shops and stashes.", provides: ["inventory", "shops"], requires: ["framework", "database"], exclusive: ["inventory"], engines: fivem, cost: c(0.5, 0.3, 60, 18), status: "ready", author: "Overextended" },
  { id: "qs-inventory", name: "Quasar Inventory", category: "inventory", summary: "Premium inventory with clothing and crafting.", provides: ["inventory", "crafting"], requires: ["framework", "database"], exclusive: ["inventory"], engines: fivem, cost: c(0.7, 0.4, 90, 45), status: "ready", author: "Quasar" },

  // Voice
  { id: "pma-voice", name: "pma-voice", category: "voice", summary: "Proximity voice, radio and phone calls on Mumble.", provides: ["voice", "radio"], requires: [], exclusive: ["voice"], engines: fivem, cost: c(0.3, 0.6, 20, 0), status: "ready", author: "AvarianKnight" },
  { id: "saltychat", name: "SaltyChat", category: "voice", summary: "TeamSpeak-based 3D voice with radio effects.", provides: ["voice", "radio"], requires: [], exclusive: ["voice"], engines: fivem, cost: c(0.3, 0.5, 15, 0), status: "ready", author: "Saltmine" },
  { id: "riptide-voice", name: "Riptide Voice", category: "voice", summary: "Spatial voice with room acoustics and live captions for deaf and hard-of-hearing players.", provides: ["voice", "radio", "captions"], requires: [], exclusive: ["voice"], engines: both, cost: c(0.4, 0.7, 25, 0), status: "planned", author: "Riptide" },

  // Phone
  { id: "lb-phone", name: "LB Phone", category: "phone", summary: "Full smartphone with social apps and camera.", provides: ["phone"], requires: ["framework", "voice"], exclusive: ["phone"], engines: fivem, cost: c(0.6, 0.4, 120, 30), status: "ready", author: "LB Scripts" },
  { id: "npwd", name: "NPWD", category: "phone", summary: "Open-source phone with apps API.", provides: ["phone"], requires: ["framework"], exclusive: ["phone"], engines: fivem, cost: c(0.4, 0.3, 80, 12), status: "ready", author: "Project Error" },

  // HUD
  { id: "minimal-hud", name: "Minimal HUD", category: "hud", summary: "Health, armour, hunger and vehicle info.", provides: ["hud"], requires: ["framework"], exclusive: ["hud"], engines: fivem, cost: c(0.05, 0.02, 15, 1), status: "ready", author: "Community" },
  { id: "riptide-hud", name: "Riptide HUD", category: "hud", summary: "HUD themed from your brand colours, with a colour-blind safe mode.", provides: ["hud"], requires: ["framework"], exclusive: ["hud"], engines: both, cost: c(0.05, 0.02, 12, 1), status: "beta", author: "Riptide" },

  // Gameplay
  { id: "ps-housing", name: "Housing", category: "housing", summary: "Buyable apartments and houses with furniture.", provides: ["housing"], requires: ["framework", "inventory"], engines: fivem, cost: c(0.4, 0.2, 70, 140), status: "ready", author: "Project Sloth" },
  { id: "jg-garages", name: "Advanced Garages", category: "vehicles", summary: "Garages, impound and vehicle ownership.", provides: ["garages"], requires: ["framework"], engines: fivem, cost: c(0.3, 0.2, 25, 4), status: "ready", author: "JG Scripts" },
  { id: "addon-cars-pack", name: "Coastal Car Pack", category: "vehicles", summary: "62 lore-friendly add-on vehicles.", provides: ["vehicles"], requires: [], engines: fivem, cost: c(0, 0, 220, 900), status: "ready", author: "Community" },
  { id: "jobs-pack", name: "Civilian Jobs", category: "jobs", summary: "Taxi, delivery, fishing, mechanic and tow jobs.", provides: ["jobs"], requires: ["framework", "inventory"], engines: fivem, cost: c(0.6, 0.3, 40, 60), status: "ready", author: "Community" },
  { id: "police-mdt", name: "Police MDT", category: "jobs", summary: "Records, warrants, dispatch and evidence.", provides: ["mdt", "dispatch"], requires: ["framework"], engines: fivem, cost: c(0.3, 0.2, 30, 3), status: "ready", author: "Community" },
  { id: "ems-pack", name: "EMS & Hospital", category: "jobs", summary: "Injuries, treatment and hospital check-in.", provides: ["medical"], requires: ["framework", "inventory"], engines: fivem, cost: c(0.3, 0.15, 25, 20), status: "ready", author: "Community" },

  // Maps and clothing
  { id: "beach-club-mlo", name: "Beach Club Interior", category: "maps", summary: "Two-floor neon beach club with rooftop bar.", provides: ["interior"], requires: [], engines: fivem, cost: c(0, 0, 90, 160), status: "ready", author: "Community" },
  { id: "pd-mlo", name: "Downtown Precinct", category: "maps", summary: "Police station interior with cells and garage.", provides: ["interior"], requires: [], engines: fivem, cost: c(0, 0, 80, 140), status: "ready", author: "Community" },
  { id: "eup-pack", name: "Uniform Pack", category: "clothing", summary: "Emergency uniforms for police, EMS and fire.", provides: ["clothing"], requires: [], engines: fivem, cost: c(0, 0, 140, 380), status: "ready", author: "Community" },

  // Safety and admin
  { id: "txadmin", name: "txAdmin", category: "admin", summary: "Official server panel: bans, restarts, live console.", provides: ["admin-panel"], requires: [], engines: fivem, cost: c(0.1, 0.05, 0, 0), status: "ready", author: "Cfx.re" },
  { id: "riptide-guard", name: "Riptide Guard", category: "anticheat", summary: "Server-side sanity checks on money, teleports and spawned entities.", provides: ["anticheat"], requires: ["framework"], exclusive: ["anticheat"], engines: both, cost: c(0.5, 0.4, 0, 0), status: "beta", author: "Riptide" },
  { id: "fiveguard", name: "FiveGuard", category: "anticheat", summary: "Client and server anti-cheat.", provides: ["anticheat"], requires: [], exclusive: ["anticheat"], engines: fivem, cost: c(0.6, 0.5, 10, 0), status: "ready", author: "FiveGuard" },

  // Community
  { id: "discord-bridge", name: "Discord Bridge", category: "community", summary: "Role sync, whitelist, applications and log channels.", provides: ["discord"], requires: [], engines: both, cost: c(0.05, 0.02, 0, 0), status: "ready", author: "Riptide" },
  { id: "stream-mode", name: "Streamer Mode", category: "streaming", summary: "Hides IPs and DMs on stream, adds Twitch and Kick live badges.", provides: ["streaming"], requires: [], engines: both, cost: c(0.02, 0.01, 2, 0), status: "beta", author: "Riptide" },
  { id: "tebex", name: "Tebex Store", category: "store", summary: "Supporter perks and queue priority.", provides: ["store"], requires: [], engines: fivem, cost: c(0.05, 0.02, 0, 0), status: "ready", author: "Tebex" },
  { id: "riptide-pulse", name: "Riptide Pulse", category: "analytics", summary: "Player counts, retention, economy and tick time in one place.", provides: ["analytics"], requires: [], engines: both, cost: c(0.1, 0.05, 0, 0), status: "beta", author: "Riptide" },

  // Visuals
  { id: "graphics-neon", name: "Neon Nights", category: "visuals", summary: "Warm sunsets, wet streets, pink-cyan night glow.", provides: ["timecycle"], requires: [], exclusive: ["timecycle"], engines: both, cost: c(0, 0, 60, 35), status: "ready", author: "Riptide" },
  { id: "graphics-film", name: "Film Stock", category: "visuals", summary: "Muted colour and grain, like a 35mm crime drama.", provides: ["timecycle"], requires: [], exclusive: ["timecycle"], engines: both, cost: c(0, 0, 40, 25), status: "ready", author: "Riptide" },
  { id: "graphics-natural", name: "Natural Light", category: "visuals", summary: "Realistic exposure and softer shadows.", provides: ["timecycle"], requires: [], exclusive: ["timecycle"], engines: both, cost: c(0, 0, 50, 30), status: "ready", author: "Community" },

  // Accessibility
  { id: "a11y-pack", name: "Accessibility Pack", category: "accessibility", summary: "Colour-blind filters, subtitles, text scaling and one-handed controls.", provides: ["accessibility"], requires: [], engines: both, cost: c(0.02, 0.01, 5, 0), status: "beta", author: "Riptide" },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export const CATEGORY_LABELS: Record<Category, string> = {
  framework: "Framework",
  inventory: "Inventory",
  voice: "Voice",
  phone: "Phone",
  hud: "HUD",
  housing: "Housing",
  vehicles: "Vehicles",
  jobs: "Jobs",
  maps: "Maps & interiors",
  clothing: "Clothing",
  anticheat: "Anti-cheat",
  admin: "Admin",
  database: "Database",
  community: "Community",
  streaming: "Streaming",
  store: "Store",
  analytics: "Analytics",
  visuals: "Visuals",
  accessibility: "Accessibility",
};

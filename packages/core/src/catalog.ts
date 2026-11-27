import type { EngineTarget } from "./blueprint";

/**
 * The integration catalog: real, public FiveM resources only. Each entry names the actual
 * resource folder used in server.cfg, where it comes from, its licence, and what its own
 * fxmanifest.lua depends on (checked against each project's repository, 27 November 2026).
 * RipTide has no measured performance numbers for these, so it doesn't estimate any.
 */

export type Category =
  | "framework"
  | "library"
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

export interface CatalogItem {
  id: string;
  name: string;
  /** The resource folder name, as used in `ensure` lines. */
  resource: string;
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
  status: "ready" | "beta" | "planned";
  author: string;
  /** Where to get it. */
  source: string;
  /** SPDX licence id, as the project states it. */
  license: string;
}

const fivem: EngineTarget[] = ["fivem"];

export const CATALOG: CatalogItem[] = [
  // Frameworks
  { id: "qbox", name: "Qbox", resource: "qbx_core", category: "framework", summary: "Roleplay core: players, jobs, money and metadata. Needs OneSync and server build 10731 or newer.", provides: ["framework", "money", "jobs-core", "qb-core"], requires: ["ox_lib", "database"], exclusive: ["framework"], engines: fivem, status: "ready", author: "Qbox Project", source: "https://github.com/Qbox-project/qbx_core", license: "GPL-3.0" },
  { id: "qbcore", name: "QBCore", resource: "qb-core", category: "framework", summary: "Widely used roleplay framework.", provides: ["framework", "money", "jobs-core", "qb-core"], requires: ["database"], exclusive: ["framework"], engines: fivem, status: "ready", author: "QBCore Framework", source: "https://github.com/qbcore-framework/qb-core", license: "GPL-3.0" },
  { id: "esx", name: "ESX Legacy", resource: "es_extended", category: "framework", summary: "Long-running roleplay framework.", provides: ["framework", "money", "jobs-core"], requires: ["esx_lib", "database"], exclusive: ["framework"], engines: fivem, status: "ready", author: "ESX Framework", source: "https://github.com/esx-framework/esx_core", license: "GPL-3.0" },

  // Libraries and database
  { id: "ox-lib", name: "ox_lib", resource: "ox_lib", category: "library", summary: "Shared library many resources build on: UI, callbacks, zones.", provides: ["ox_lib"], requires: [], engines: fivem, status: "ready", author: "Overextended", source: "https://github.com/overextended/ox_lib", license: "LGPL-3.0" },
  { id: "esx-lib", name: "esx_lib", resource: "esx_lib", category: "library", summary: "Library ESX Legacy needs. Ships in the esx_core repository.", provides: ["esx_lib"], requires: [], engines: fivem, status: "ready", author: "ESX Framework", source: "https://github.com/esx-framework/esx_core", license: "GPL-3.0" },
  { id: "oxmysql", name: "oxmysql", resource: "oxmysql", category: "database", summary: "MySQL and MariaDB connector most frameworks use.", provides: ["database"], requires: [], exclusive: ["database"], engines: fivem, status: "ready", author: "Overextended", source: "https://github.com/overextended/oxmysql", license: "LGPL-3.0" },

  // Gameplay
  { id: "ox-inventory", name: "ox_inventory", resource: "ox_inventory", category: "inventory", summary: "Slot-based inventory with shops, stashes and weapons. Needs OneSync and server build 6116 or newer.", provides: ["inventory"], requires: ["database", "ox_lib"], exclusive: ["inventory"], engines: fivem, status: "ready", author: "Overextended", source: "https://github.com/overextended/ox_inventory", license: "GPL-3.0" },
  { id: "pma-voice", name: "pma-voice", resource: "pma-voice", category: "voice", summary: "Proximity voice, radio and calls on Mumble. Needs OneSync.", provides: ["voice"], requires: [], exclusive: ["voice"], engines: fivem, status: "ready", author: "AvarianKnight", source: "https://github.com/AvarianKnight/pma-voice", license: "MIT" },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export const CATEGORY_LABELS: Record<Category, string> = {
  framework: "Framework",
  library: "Library",
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

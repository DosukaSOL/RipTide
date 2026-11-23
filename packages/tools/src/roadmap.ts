/**
 * RipTide Tools roadmap. Every future module lists the gates it must pass before
 * it can ship, so nothing is promised before it can be tested for real.
 */

/**
 * What a module waits for. "buildable" means nothing outside RipTide blocks it: it works for
 * console players today with manual entry, and only needs building.
 */
export type Gate = "buildable" | "gta6-pc" | "gta6-online" | "policy-review" | "data-source" | "research";

export const GATE_LABEL: Record<Gate, string> = {
  buildable: "Buildable now, not built yet",
  "gta6-pc": "GTA VI on PC",
  "gta6-online": "GTA VI Online",
  "policy-review": "Rockstar policy review",
  "data-source": "Verified data source",
  research: "Research",
};

export interface RoadmapItem {
  id: string;
  name: string;
  summary: string;
  gates: Gate[];
}

export const MODULE_STATUS = [
  { id: "studio", name: "RipTide Studio", status: "FiveM config export", detail: "Design and check servers, then export server.cfg with mods, roles and settings. World, economy and rules aren't applied in-game yet, and hosted deploys are a simulation until hosting opens." },
  { id: "vicelab", name: "ViceLab", status: "Working with imported captures", detail: "Analyses frame-time captures from PresentMon, CapFrameX, MangoHud, OCAT and FrameView. GTA VI tests wait for the PC release." },
  { id: "heist", name: "Heist Ops", status: "Working locally", detail: "Plans, roles, phases, checklists and notes on this device, with file sharing. Live crew rooms aren't built yet." },
  { id: "map", name: "Interactive Map", status: "Working with the official map", detail: "Rockstar's map of Leonida with community-mapped places, search, filters, found tracking per playthrough, favourites, your own markers and pop-out. Collectibles aren't mapped yet." },
  { id: "workspaces", name: "Workspaces", status: "Working in the browser", detail: "Detach tools into their own windows, place them on another display and restore layouts, in the browser and the desktop app." },
] as const;

export const ROADMAP: RoadmapItem[] = [
  { id: "patch-tracker", name: "Patch tracker", summary: "What changed in each update, in plain language, with links to the official notes.", gates: ["data-source"] },
  { id: "vehicle-planner", name: "Vehicle and property planner", summary: "Plan purchases and compare options before you spend.", gates: ["gta6-online", "data-source"] },
  { id: "loadout", name: "Loadout builder", summary: "Build and share loadouts for different jobs.", gates: ["gta6-online", "data-source"] },
  { id: "activity-tracker", name: "Mission and activity tracker", summary: "Track what you've done and what's left.", gates: ["gta6-online", "data-source", "policy-review"] },
  { id: "creator", name: "Creator toolkit", summary: "Tools for people who build content and jobs.", gates: ["policy-review"] },
  { id: "clips", name: "Clip organizer", summary: "Sort, tag and find your best moments from your own clip files.", gates: ["buildable"] },
  { id: "journal", name: "Discovery journal", summary: "A personal log of places and finds, linked to the map. Works for console players too.", gates: ["buildable"] },
  { id: "crew-finder", name: "Crew finder", summary: "Find people to play with, safely.", gates: ["gta6-online", "policy-review"] },
  { id: "economy-planner", name: "Economy planner", summary: "Plan in-game income and spending.", gates: ["gta6-online", "data-source"] },
  { id: "routes", name: "Route library", summary: "Save and share routes of map places. Straight-line distances only until there's verified road data.", gates: ["buildable"] },
  { id: "bench-browser", name: "Community benchmark browser", summary: "Compare ViceLab results across hardware.", gates: ["gta6-pc", "research"] },
  { id: "debrief", name: "Multiplayer debrief timelines", summary: "Replay what happened in a session, step by step.", gates: ["gta6-online", "policy-review", "research"] },
];

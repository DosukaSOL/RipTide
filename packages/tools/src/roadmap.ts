/**
 * RipTide Tools roadmap. Every future module lists the gates it must pass before
 * it can ship, so nothing is promised before it can be tested for real.
 */

export type Gate = "gta6-pc" | "gta6-online" | "policy-review" | "data-source" | "research";

export const GATE_LABEL: Record<Gate, string> = {
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
  { id: "studio", name: "RipTide Studio", status: "Working today on GTA V (FiveM)", detail: "Design, check and build servers. Hosted deploys are simulated until hosting opens." },
  { id: "vicelab", name: "ViceLab", status: "Working with imported captures", detail: "Analyses frame-time captures from PresentMon, CapFrameX, MangoHud, OCAT and FrameView. GTA VI tests wait for the PC release." },
  { id: "heist", name: "Heist Ops", status: "Working locally", detail: "Plans, roles, phases, checklists and notes on this device, with file sharing. Live crew rooms aren't built yet." },
  { id: "map", name: "Interactive Map", status: "Engine working, no GTA VI data", detail: "Pan, zoom, filters, search, markers, bookmarks and map-pack import on a schematic canvas." },
  { id: "workspaces", name: "Workspaces", status: "Working in the browser", detail: "Detach tools into their own windows, place them on another display and restore layouts. The native desktop app is planned." },
] as const;

export const ROADMAP: RoadmapItem[] = [
  { id: "patch-tracker", name: "Patch tracker", summary: "What changed in each update, in plain language.", gates: ["gta6-pc", "data-source"] },
  { id: "vehicle-planner", name: "Vehicle and property planner", summary: "Plan purchases and compare options before you spend.", gates: ["gta6-online", "data-source"] },
  { id: "loadout", name: "Loadout builder", summary: "Build and share loadouts for different jobs.", gates: ["gta6-online", "data-source"] },
  { id: "activity-tracker", name: "Mission and activity tracker", summary: "Track what you've done and what's left.", gates: ["gta6-online", "data-source", "policy-review"] },
  { id: "creator", name: "Creator toolkit", summary: "Tools for people who build content and jobs.", gates: ["gta6-pc", "policy-review"] },
  { id: "clips", name: "Clip organizer", summary: "Sort, tag and find your best moments.", gates: ["gta6-pc", "research"] },
  { id: "journal", name: "Discovery journal", summary: "A personal log of places and finds, linked to the map.", gates: ["gta6-pc"] },
  { id: "crew-finder", name: "Crew finder", summary: "Find people to play with, safely.", gates: ["gta6-online", "policy-review"] },
  { id: "economy-planner", name: "Economy planner", summary: "Plan in-game income and spending.", gates: ["gta6-online", "data-source"] },
  { id: "routes", name: "Route library", summary: "Save and share routes on the map.", gates: ["gta6-pc", "data-source"] },
  { id: "bench-browser", name: "Community benchmark browser", summary: "Compare ViceLab results across hardware.", gates: ["gta6-pc", "research"] },
  { id: "debrief", name: "Multiplayer debrief timelines", summary: "Replay what happened in a session, step by step.", gates: ["gta6-online", "policy-review", "research"] },
];

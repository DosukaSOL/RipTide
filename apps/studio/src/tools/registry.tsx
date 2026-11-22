import type { ComponentType } from "react";
import { LuHouse, LuLayoutPanelLeft, LuChartLine, LuUsers, LuMap, LuMonitor, LuBookOpen, LuSettings, LuCircleHelp } from "react-icons/lu";
import type { ToolId } from "@riptide/tools";
import { Home } from "./modules/Home";
import { StudioModule } from "./modules/StudioModule";
import { ViceLab } from "./modules/ViceLab";
import { HeistOps } from "./modules/HeistOps";
import { MapTool } from "./modules/MapTool";
import { Workspaces } from "./modules/Workspaces";
import { Roadmap } from "./modules/Roadmap";
import { SettingsPage } from "./modules/SettingsPage";
import { Help } from "./modules/Help";

export interface ToolModule {
  id: ToolId;
  label: string;
  icon: ComponentType;
  group: "workspace" | "account";
  component: ComponentType;
  /** Tag shown beside the nav item. */
  tag?: string;
  /** Counts as a running tool when mounted (Home's "Running tools"). */
  tool?: boolean;
  /** Module manages its own scrolling (Studio). */
  flush?: boolean;
}

/** Adding a tool means adding one entry here. */
export const MODULES: ToolModule[] = [
  { id: "home", label: "Home", icon: LuHouse, group: "workspace", component: Home },
  { id: "studio", label: "RipTide Studio", icon: LuLayoutPanelLeft, group: "workspace", component: StudioModule, tag: "READY", tool: true, flush: true },
  { id: "vicelab", label: "ViceLab", icon: LuChartLine, group: "workspace", component: ViceLab, tool: true },
  { id: "heist", label: "Heist Ops", icon: LuUsers, group: "workspace", component: HeistOps, tool: true },
  { id: "map", label: "Interactive Map", icon: LuMap, group: "workspace", component: MapTool, tool: true },
  { id: "workspaces", label: "Workspaces", icon: LuMonitor, group: "workspace", component: Workspaces },
  { id: "roadmap", label: "Roadmap", icon: LuBookOpen, group: "workspace", component: Roadmap },
  { id: "settings", label: "Settings", icon: LuSettings, group: "account", component: SettingsPage },
  { id: "help", label: "Help & feedback", icon: LuCircleHelp, group: "account", component: Help },
];

export const moduleById = (id: ToolId) => MODULES.find((m) => m.id === id) ?? MODULES[0]!;

import type { Blueprint } from "../blueprint";
import type { Adapter, BuildResult } from "./types";

/**
 * GTA VI adapter.
 *
 * GTA VI is out on consoles (Nov 19, 2026). The PC version, GTA VI Online and
 * any official server or modding framework have not been announced. This
 * adapter is the landing spot for that work: Blueprints are already
 * engine-agnostic, so when the server framework ships, only this file needs
 * to learn how to speak it.
 *
 * Until then it produces a portable bundle (the Blueprint plus compiled
 * rules) and a report of what's known. RipTide never builds against leaked
 * builds, unofficial PC ports or unannounced interfaces.
 */

export interface Gta6Capability {
  feature: string;
  /** confirmed: Rockstar said so. reported: press reports, not confirmed. unknown: nothing announced. */
  status: "unknown" | "reported" | "confirmed";
  note: string;
}

/** When the facts below were last checked against Rockstar's and Cfx.re's own announcements. */
export const GTA6_CHECKED = "2026-11-27";

export const GTA6_CAPABILITIES: Gta6Capability[] = [
  { feature: "Consoles", status: "confirmed", note: "Out on PlayStation 5 and Xbox Series X|S since 19 November 2026." },
  { feature: "PC release", status: "reported", note: "Not announced by Rockstar. Press reports point to early 2027." },
  { feature: "GTA VI Online", status: "reported", note: "Not announced. Press reports point to 2027." },
  { feature: "Community servers", status: "unknown", note: "Nothing announced by Rockstar or Cfx.re (the FiveM team Rockstar owns), and no server software exists." },
  { feature: "Mods and scripting", status: "unknown", note: "No official mod support or scripting tools announced." },
  { feature: "Unofficial PC ports", status: "unknown", note: "Built from leaked files. RipTide won't support them, and Rockstar is acting against them." },
];

export const gta6Adapter: Adapter = {
  id: "gta6",
  label: "GTA VI",
  status: "waiting",
  build(bp: Blueprint): BuildResult {
    return {
      target: "gta6",
      notes: [
        "GTA VI servers can't be deployed: Rockstar hasn't released a PC version or server tools. Riptide saved your Blueprint as a portable bundle.",
      ],
      files: [
        { path: "bundle/blueprint.json", contents: JSON.stringify(bp, null, 2) },
        { path: "bundle/capabilities.json", contents: JSON.stringify(GTA6_CAPABILITIES, null, 2) },
      ],
    };
  },
};

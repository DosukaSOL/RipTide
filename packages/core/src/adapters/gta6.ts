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
 * rules) and a capability report, so servers can be designed today and
 * migrated on day one.
 */

export interface Gta6Capability {
  feature: string;
  status: "unknown" | "expected" | "confirmed";
  note: string;
}

export const GTA6_CAPABILITIES: Gta6Capability[] = [
  { feature: "PC release", status: "expected", note: "Reported for early 2027. Not confirmed by Rockstar." },
  { feature: "GTA VI Online", status: "expected", note: "No official date. Industry comments point to 2027." },
  { feature: "Community servers", status: "unknown", note: "Rockstar owns Cfx.re (FiveM). An official path is likely but unannounced." },
  { feature: "Server-side scripting", status: "unknown", note: "Riptide Core will target whatever scripting runtime ships." },
  { feature: "Custom assets and streaming", status: "unknown", note: "Mods marked GTA VI in the catalog are designed to port." },
  { feature: "Visual presets", status: "expected", note: "Riptide visual presets are described as parameters, not engine files." },
];

export const gta6Adapter: Adapter = {
  id: "gta6",
  label: "GTA VI",
  status: "waiting",
  build(bp: Blueprint): BuildResult {
    return {
      target: "gta6",
      notes: [
        "GTA VI servers can't be deployed yet. Riptide saved a portable bundle you can deploy the day support lands.",
      ],
      files: [
        { path: "bundle/blueprint.json", contents: JSON.stringify(bp, null, 2) },
        { path: "bundle/capabilities.json", contents: JSON.stringify(GTA6_CAPABILITIES, null, 2) },
      ],
    };
  },
};

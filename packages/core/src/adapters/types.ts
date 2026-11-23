import type { Blueprint, EngineTarget } from "../blueprint";

export interface OutputFile {
  path: string;
  contents: string;
}

export interface BuildResult {
  target: EngineTarget | "docker";
  files: OutputFile[];
  notes: string[];
}

/**
 * An adapter turns a Blueprint into files a specific engine understands.
 * Adding GTA VI support means writing one adapter. Nothing else changes.
 */
export interface Adapter {
  id: string;
  label: string;
  /**
   * config: writes real config files for the engine, but not every Blueprint section is applied
   * (see `capabilities`). waiting: the engine can't be targeted yet.
   */
  status: "config" | "waiting";
  /** What the build actually does with each part of a Blueprint. */
  capabilities?: AdapterCapability[];
  build(bp: Blueprint): BuildResult;
}

export interface AdapterCapability {
  /** Blueprint section, e.g. "mods" or "rulebook". */
  section: string;
  /** applied: written into config the engine reads. ignored: kept in the Blueprint, not applied. */
  support: "applied" | "ignored";
  note: string;
}

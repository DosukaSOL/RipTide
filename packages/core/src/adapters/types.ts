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
  status: "ready" | "waiting";
  build(bp: Blueprint): BuildResult;
}

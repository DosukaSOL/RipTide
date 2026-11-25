import { validateBlueprint } from "./blueprint";
import { fivemAdapter } from "./adapters/fivem";

/**
 * The real part of a deploy: validate the Blueprint and make the FiveM build. Used by the Deploy
 * screen before any simulated hosting step, so it never claims a check or build that didn't run.
 */
export type Preflight =
  | { ok: true; started: number; enabled: number; notes: string[]; serverCfg: string }
  | { ok: false; stage: "check" | "build"; message: string };

export function deployPreflight(input: unknown): Preflight {
  const checked = validateBlueprint(input);
  if (!checked.ok) {
    const n = checked.issues.length;
    const first = checked.issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ");
    return { ok: false, stage: "check", message: `Blueprint check failed (${n} problem${n === 1 ? "" : "s"}): ${first}` };
  }
  try {
    const out = fivemAdapter.build(checked.blueprint);
    const serverCfg = out.files.find((f) => f.path === "server.cfg")?.contents ?? "";
    return {
      ok: true,
      started: (serverCfg.match(/^ensure \S+/gm) ?? []).length,
      enabled: checked.blueprint.mods.filter((m) => m.enabled).length,
      notes: out.notes.slice(1), // the first note is the "configuration only" notice
      serverCfg,
    };
  } catch (e) {
    return { ok: false, stage: "build", message: `FiveM build failed: ${(e as Error).message}` };
  }
}

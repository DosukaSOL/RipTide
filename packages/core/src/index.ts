export * from "./blueprint";
export * from "./catalog";
export * from "./compatibility";
export * from "./economy";
export * from "./rules/rulebook";
export * from "./readiness";
export * from "./hosting";
export * from "./share";
export * from "./diff";
export * from "./adapters/types";
export { fivemAdapter, FIVEM_CAPABILITIES } from "./adapters/fivem";
export { gta6Adapter, GTA6_CAPABILITIES, GTA6_CHECKED } from "./adapters/gta6";

import { fivemAdapter } from "./adapters/fivem";
import { gta6Adapter } from "./adapters/gta6";
export const ADAPTERS = { fivem: fivemAdapter, gta6: gta6Adapter } as const;
export * from "./capabilities";
export * from "./preflight";

export * from "./blueprint";
export * from "./catalog";
export * from "./compatibility";
export * from "./budget";
export * from "./economy";
export * from "./rules/rulebook";
export * from "./readiness";
export * from "./hosting";
export * from "./share";
export * from "./diff";
export * from "./adapters/types";
export { fivemAdapter, FIVEM_CAPABILITIES } from "./adapters/fivem";
export { gta6Adapter, GTA6_CAPABILITIES } from "./adapters/gta6";
export { buildDockerStack } from "./adapters/docker";

import { fivemAdapter } from "./adapters/fivem";
import { gta6Adapter } from "./adapters/gta6";
export const ADAPTERS = { fivem: fivemAdapter, gta6: gta6Adapter } as const;

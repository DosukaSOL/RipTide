import { RouteBase, StoreProvider } from "../../lib/store";
import { App } from "../../App";
import { useShell } from "../ui";

/**
 * RipTide Studio inside RipTide Tools. A bridge, not a rewrite: the same Studio
 * app, store and Blueprint, living under #/studio/... Its shortcuts only act
 * while Studio is the visible tool.
 */
export function StudioModule() {
  const { active } = useShell();
  return (
    <RouteBase.Provider value="studio/">
      <StoreProvider active={active === "studio"}>
        <App embedded />
      </StoreProvider>
    </RouteBase.Provider>
  );
}

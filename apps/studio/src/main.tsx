import "./desktop"; // must run first: makes saved data durable before anything reads it
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./lib/store";
import { App } from "./App";
import { Splash } from "./components/Splash";
import { ToolsApp } from "./tools/ToolsApp";
import { wantsToolsShell } from "./tools/data";
import { KEYS, Settings, readStored } from "@riptide/tools";

const root = createRoot(document.getElementById("root")!);

if (wantsToolsShell()) {
  // RipTide Tools preview shell (feature flag). Detached tool windows skip the splash.
  let settings = Settings.parse({});
  try {
    settings = readStored(localStorage.getItem(KEYS.settings), Settings, settings);
  } catch {
    /* storage blocked: defaults */
  }
  const detached = new URLSearchParams(location.search).has("window");
  root.render(
    <StrictMode>
      <ToolsApp />
      {!detached && settings.splash && <Splash />}
    </StrictMode>,
  );
} else {
  // Classic RipTide Studio: unchanged default until the new shell is accepted.
  root.render(
    <StrictMode>
      <StoreProvider>
        <App />
      </StoreProvider>
      <Splash />
    </StrictMode>,
  );
}

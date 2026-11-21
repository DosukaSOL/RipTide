import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./lib/store";
import { App } from "./App";
import { Splash } from "./components/Splash";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
      <Splash />
    </StoreProvider>
  </StrictMode>,
);

import { useEffect, useState } from "react";
import { LuDownload } from "react-icons/lu";
import { desktopBridge } from "../desktop";

/**
 * Installing the web version as an app (phones and desktop browsers that support it). The service
 * worker keeps the app working offline; it caches only this app's own files, from this site.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

/** Registers the offline service worker on the website (https), never in the desktop app. */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || desktopBridge()) return;
  const forced = new URLSearchParams(location.search).get("sw") === "1"; // tests on localhost
  if (location.protocol !== "https:" && !forced) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
      /* offline support is optional; the app works without it */
    });
  });
}

/** "Install app" in the top bar, shown only when the browser offers it. */
export function InstallButton() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  if (!deferred) return null;
  return (
    <button
      className="rt-btn rt-sm rt-install"
      onClick={async () => {
        const d = deferred;
        if (!d) return;
        await d.prompt();
        await d.userChoice.catch(() => undefined);
        deferred = null;
        listeners.forEach((f) => f());
      }}
    >
      <LuDownload />Install app
    </button>
  );
}

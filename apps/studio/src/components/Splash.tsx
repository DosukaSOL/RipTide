import { useEffect, useMemo, useState } from "react";
import { animatedLogoSvg } from "../lib/animatedLogo";

/**
 * Startup animation. The logo builds itself, holds for a beat, then the
 * splash lifts away. Click or press any key to skip. Skipped entirely for
 * people who prefer reduced motion, and with ?splash=0.
 */
export function Splash() {
  const skip = useMemo(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).get("splash") === "0";
    } catch {
      return false;
    }
  }, []);
  const [phase, setPhase] = useState<"show" | "leave" | "gone">(skip ? "gone" : "show");

  useEffect(() => {
    if (phase !== "show") return;
    const t = setTimeout(() => setPhase("leave"), 2300);
    const dismiss = () => setPhase("leave");
    window.addEventListener("keydown", dismiss, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", dismiss);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "leave") return;
    const t = setTimeout(() => setPhase("gone"), 650);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  // The SVG is generated locally from our own constants, never from user input.
  const svg = animatedLogoSvg({ id: "splash", scale: 0.9 });
  return (
    <div className={`splash ${phase === "leave" ? "leave" : ""}`} onClick={() => setPhase("leave")} role="presentation">
      <div className="splash-logo" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="splash-line" aria-hidden="true" />
    </div>
  );
}

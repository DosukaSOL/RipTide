import { useId } from "react";
import { fnv1a } from "@riptide/core";

/** A small generated sunset that gives every server its own icon. */
export function ServerArt({ seed }: { seed: string }) {
  const id = useId().replace(/:/g, "");
  const h = fnv1a(seed);
  const palettes = [
    ["#FFB36B", "#FF4F9A", "#2A1D55"],
    ["#3DF2D0", "#5AA9FF", "#1D2350"],
    ["#FF6F7D", "#B69CFF", "#241A4A"],
    ["#FFD27A", "#FF6F7D", "#2B1A3F"],
  ];
  const [a, b, sky] = palettes[h % palettes.length]!;
  const sunY = 15 + (h >> 4) % 6;
  return (
    <svg viewBox="0 0 34 34" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="34" height="34" fill={sky} />
      <circle cx={10 + (h % 14)} cy={sunY} r="8" fill={`url(#${id}g)`} />
      <rect y="22" width="34" height="12" fill="#130F26" />
      <path d="M0 25c4 0 6 2 10 2s6-2 10-2 6 2 10 2 4-1 4-1" stroke={b} strokeOpacity=".6" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

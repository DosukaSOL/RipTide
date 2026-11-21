import { useEffect, useId, useState } from "react";

/**
 * Launch readiness as a sunrise: the sun climbs over the horizon as the
 * server gets closer to ready. At 100 it clears the water completely.
 */
export function Sunrise({ score, compact = false }: { score: number; compact?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(t);
  }, [score]);

  const r = 44;
  const horizon = 104;
  const lowY = horizon + r + 4;
  const highY = horizon - r - 8;
  const y = lowY - (shown / 100) * (lowY - highY);
  const glow = 0.15 + (shown / 100) * 0.55;

  return (
    <div className="sunrise">
      <svg viewBox="0 0 300 150" role="img" aria-label={`Launch readiness ${score} out of 100`}>
        <defs>
          <linearGradient id={`${id}sun`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFB36B" />
            <stop offset=".6" stopColor="#FF6F7D" />
            <stop offset="1" stopColor="#FF3D9A" />
          </linearGradient>
          <radialGradient id={`${id}glow`} cx=".5" cy="1" r=".5">
            <stop offset="0" stopColor="#FF4F9A" stopOpacity={glow} />
            <stop offset="1" stopColor="#FF4F9A" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}line`} x1="0" x2="1">
            <stop offset="0" stopColor="#FFB36B" stopOpacity="0" />
            <stop offset=".5" stopColor="#FF6F7D" />
            <stop offset="1" stopColor="#FF4F9A" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}sky`}>
            <rect x="0" y="0" width="300" height={horizon} />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="300" height={horizon} fill={`url(#${id}glow)`} style={{ transition: "all 1s" }} />
        <g clipPath={`url(#${id}sky)`}>
          <circle className="sun" cx="150" cy="0" r={r} fill={`url(#${id}sun)`} style={{ transform: `translateY(${y}px)` }} />
        </g>
        <line x1="10" x2="290" y1={horizon} y2={horizon} stroke={`url(#${id}line)`} strokeWidth="1.5" />
        {!compact &&
          [0, 1, 2, 3].map((i) => {
            const w = (90 - i * 18) * (0.35 + (shown / 100) * 0.65);
            return (
              <line
                key={i}
                x1={150 - w / 2}
                x2={150 + w / 2}
                y1={horizon + 9 + i * 9}
                y2={horizon + 9 + i * 9}
                stroke="#FF6F7D"
                strokeOpacity={(0.55 - i * 0.12) * (shown / 100)}
                strokeWidth="3"
                strokeLinecap="round"
                style={{ transition: "all 1.1s cubic-bezier(.2,.8,.2,1)" }}
              />
            );
          })}
      </svg>
    </div>
  );
}

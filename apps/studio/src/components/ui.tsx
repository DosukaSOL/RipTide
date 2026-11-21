import { useId, type ReactNode } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="32" y1="4" x2="32" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset=".55" stopColor="#FF6F7D" />
          <stop offset="1" stopColor="#FF3D9A" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d="M0 0H64V28.5C57 28.5 53.5 29 49.5 30.5C42 33.5 39 42.5 27 42.5C18 42.5 13 39.5 0 39.5Z" />
        </clipPath>
      </defs>
      <circle cx="31" cy="27" r="23" fill={`url(#${id}s)`} clipPath={`url(#${id}c)`} />
      <path d="M5 46C13 46 18 49.5 27 49.5C40 49.5 42.5 36.5 51.5 36.5C57.8 36.5 60.6 42.6 57 46.4C53.9 49.6 48.6 47.6 49.3 43.6" stroke="#3DF2D0" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const p = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <div className="slider">
      <label className="label" htmlFor={id}>{props.label}</label>
      <span className="val">{props.format ? props.format(props.value) : props.value}</span>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        style={{ ["--p" as string]: `${p}%` }}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="toggle">
      <div>
        <div className="label" id={id}>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <button className="switch" role="switch" aria-checked={checked} aria-labelledby={id} onClick={() => onChange(!checked)} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Meter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  const r = used / limit;
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <span>
          {fmt(used)} / {fmt(limit)} {unit}
        </span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${r > 1 ? "over" : r > 0.8 ? "tight" : ""}`} style={{ width: `${Math.min(100, r * 100)}%` }} />
      </div>
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);
export const Cross = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
);

export const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
export const money = (n: number, sym = "$") => `${n < 0 ? "-" : ""}${sym}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

import { createContext, useCallback, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ToolId } from "@riptide/tools";

/* ---------- shell context ---------- */

export interface ShellApi {
  active: ToolId;
  go: (tool: ToolId) => void;
  mounted: ToolId[];
  unmount: (tool: ToolId) => void;
  toast: (msg: string) => void;
  /** True inside a detached tool window. */
  detached: boolean;
}
export const Shell = createContext<ShellApi>({ active: "home", go: () => {}, mounted: [], unmount: () => {}, toast: () => {}, detached: false });
export const useShell = () => useContext(Shell);

/* ---------- toasts ---------- */

export function useToasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const next = useRef(1);
  const toast = useCallback((msg: string) => {
    const id = next.current++;
    setItems((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  const view = (
    <div className="rt-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div className="rt-toast" key={t.id}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          {t.msg}
        </div>
      ))}
    </div>
  );
  return { toast, view };
}

/* ---------- page header ---------- */

export function PageHeader({ crumb, title, sub, right, aside }: { crumb: string; title: string; sub?: ReactNode; right?: ReactNode; aside?: ReactNode }) {
  return (
    <header>
      <div className="rt-head-row">
        <div className="rt-eyebrow">RIPTIDE TOOLS / {crumb.toUpperCase()}</div>
        <div className="rt-head-right">{right}</div>
      </div>
      <div className="rt-head-body">
        <div>
          <h1 className="rt-title">{title}</h1>
          {sub && <p className="rt-sub">{sub}</p>}
        </div>
        {aside}
      </div>
    </header>
  );
}

/* ---------- tabs with arrow-key navigation ---------- */

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  const base = useId();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + dir + tabs.length) % tabs.length;
    onChange(tabs[n]!.id);
    document.getElementById(`${base}-${tabs[n]!.id}`)?.focus();
  };
  return (
    <div className="rt-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`${base}-${t.id}`}
          role="tab"
          className="rt-tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- small controls ---------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="rt-switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function SettingRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rt-setting">
      <div className="rt-setting-text">
        {title}
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="rt-field">
      <label className="rt-label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <div className="rt-hint">{hint}</div>}
    </div>
  );
}

/** A file picker presented as a drop zone. Files never leave the device. */
export function DropZone({ accept, label, hint, onFile }: { accept: string; label: string; hint?: string; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`rt-drop${over ? " rt-over" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0 4 4m-4-4L8 7M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
      <b style={{ color: "var(--rt-sand)" }}>{label}</b>
      {hint && <span>{hint}</span>}
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

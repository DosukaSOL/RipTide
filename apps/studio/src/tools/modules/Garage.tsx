import { useState } from "react";
import { LuCar, LuHouse, LuPiggyBank, LuPlus, LuStar, LuSunrise, LuTrash2 } from "react-icons/lu";
import {
  GarageState,
  JourneyState,
  KEYS,
  MapState,
  createObjective,
  formatAmount,
  garageTotals,
  newProperty,
  newSavings,
  newVehicle,
  parseAmount,
  type Property,
  type SavingsGoal,
  type Vehicle,
} from "@riptide/tools";
import { usePersisted } from "../persist";
import { PageHeader, useShell } from "../ui";
import { HeaderRight } from "./common";

const garageDefault = () => GarageState.parse({});
const journeyDefault = () => JourneyState.parse({});
const mapDefault = () => MapState.parse({});
type Tab = "vehicles" | "properties" | "savings";
const OWNERSHIP = { owned: "Owned", wanted: "Wanted", sold: "Sold" } as const;
const KIND = { home: "Home", garage: "Garage", business: "Business", other: "Other" } as const;

/** Garage: the vehicles, properties and savings goals you track yourself. */
export function Garage() {
  const { toast } = useShell();
  const [g, setG, err] = usePersisted(KEYS.garage, GarageState, garageDefault);
  const [journey, setJourney] = usePersisted(KEYS.journey, JourneyState, journeyDefault);
  const [m] = usePersisted(KEYS.map, MapState, mapDefault);
  const profileId = m.profiles.some((p) => p.id === m.activeProfile) ? m.activeProfile : m.profiles[0]!.id;
  const [tab, setTab] = useState<Tab>("vehicles");
  const t = garageTotals(g, profileId);

  const hunt = (v: Vehicle) => {
    if (journey.objectives.some((o) => o.title === `Find: ${v.name}` && o.status !== "done" && o.profileId === profileId)) return toast("Already in Today");
    setJourney((d) => void d.objectives.push(createObjective({ title: `Find: ${v.name}`, type: "vehicle", place: v.place, profileId })));
    toast("Added to Today");
  };

  return (
    <div className="rt-page">
      <PageHeader crumb="Garage" title="Your cars, places and plans." sub="Track what you own, what you're after and what you're saving for. RipTide has no car list or prices of its own: every name and number here is yours." right={<HeaderRight />} />
      {err && <div className="rt-banner rt-warn" role="alert" style={{ marginBottom: 16 }}>{err}</div>}
      <div className="rt-stats rt-stats-3">
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Owned</div><div className="rt-stat-v">{t.owned}<small>{t.spacesLeft !== undefined ? `${t.spacesLeft} spaces left` : "vehicles"}</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Wanted</div><div className="rt-stat-v">{t.wanted}<small>vehicles</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Wish list cost</div><div className="rt-stat-v">{formatAmount(t.wantedCost)}<small>{t.unpriced ? `${t.unpriced} without a price` : "your prices"}</small></div></div>
      </div>
      <div className="rt-tabs" role="tablist" aria-label="Garage">
        {([["vehicles", "Vehicles"], ["properties", "Properties"], ["savings", "Savings"]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className="rt-tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        {tab === "vehicles" && <Vehicles list={g.vehicles.filter((v) => v.profileId === profileId)} profileId={profileId} setG={setG} onHunt={hunt} />}
        {tab === "properties" && <Properties list={g.properties.filter((p) => p.profileId === profileId)} profileId={profileId} setG={setG} />}
        {tab === "savings" && <Savings list={g.savings.filter((s) => s.profileId === profileId)} profileId={profileId} g={g} setG={setG} />}
      </div>
    </div>
  );
}

type SetG = (fn: (d: GarageState) => void) => void;

function Vehicles({ list, profileId, setG, onHunt }: { list: Vehicle[]; profileId: string; setG: SetG; onHunt: (v: Vehicle) => void }) {
  const [name, setName] = useState("");
  const [ownership, setOwnership] = useState<Vehicle["ownership"]>("wanted");
  const [price, setPrice] = useState("");
  const [filter, setFilter] = useState<"all" | Vehicle["ownership"]>("all");
  const [openId, setOpenId] = useState("");
  const [mod, setMod] = useState("");
  const edit = (id: string, fn: (v: Vehicle) => void) => setG((d) => { const v = d.vehicles.find((x) => x.id === id); if (v) { fn(v); v.revision++; } });
  const priceOk = !price.trim() || parseAmount(price) !== null;
  const add = () => {
    if (!name.trim() || !priceOk) return;
    const p = price.trim() ? parseAmount(price)! : undefined;
    setG((d) => void d.vehicles.push(newVehicle({ name: name.trim(), ownership, price: p, profileId })));
    setName("");
    setPrice("");
  };
  const shown = list.filter((v) => filter === "all" || v.ownership === filter).sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.createdAt - a.createdAt);
  return (
    <section className="rt-panel rt-pad" aria-label="Vehicles">
      <form className="rt-gr-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="rt-sr" htmlFor="rt-gr-name">Vehicle name</label>
        <input id="rt-gr-name" className="rt-input" maxLength={80} placeholder="Vehicle, like 'Red convertible'" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="rt-sr" htmlFor="rt-gr-own">Status</label>
        <select id="rt-gr-own" className="rt-select" value={ownership} onChange={(e) => setOwnership(e.target.value as Vehicle["ownership"])}>
          <option value="wanted">Wanted</option><option value="owned">Owned</option><option value="sold">Sold</option>
        </select>
        <label className="rt-sr" htmlFor="rt-gr-price">Price</label>
        <input id="rt-gr-price" className="rt-input" inputMode="decimal" placeholder="Price (optional)" aria-invalid={!priceOk} value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="rt-btn rt-primary" type="submit" disabled={!name.trim() || !priceOk}><LuPlus />Add</button>
      </form>
      {!priceOk && <p className="rt-hint" role="alert">Prices look like 250000, 250k or 1.5m.</p>}
      <div className="rt-pill-row" style={{ marginTop: 14 }} role="group" aria-label="Show">
        {(["all", "owned", "wanted", "sold"] as const).map((f) => <button key={f} className={`rt-td-chip${filter === f ? " rt-on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? `All ${list.length}` : `${OWNERSHIP[f]} ${list.filter((v) => v.ownership === f).length}`}</button>)}
      </div>
      {shown.length === 0 ? (
        <div className="rt-td-empty" style={{ marginTop: 14 }}><LuCar /> {list.length ? "None with this status." : "No vehicles yet. Add one you own or one you're hunting."}</div>
      ) : (
        <ul className="rt-td-goals">
          {shown.map((v) => (
            <li key={v.id} style={{ flexWrap: "wrap" }}>
              <button className="rt-iconbtn" aria-label={v.favourite ? `Unfavourite ${v.name}` : `Favourite ${v.name}`} aria-pressed={v.favourite} onClick={() => edit(v.id, (x) => void (x.favourite = !x.favourite))}><LuStar style={v.favourite ? { color: "var(--rt-sun)", fill: "var(--rt-sun)" } : undefined} /></button>
              <button className="rt-td-routename" style={{ flex: 1 }} aria-expanded={openId === v.id} onClick={() => setOpenId(openId === v.id ? "" : v.id)}>
                <b>{v.name}</b>
                <span>{OWNERSHIP[v.ownership]}{v.price !== undefined ? ` · ${formatAmount(v.price)}` : ""}{v.mods.length ? ` · ${v.mods.length} mod${v.mods.length === 1 ? "" : "s"}` : ""}</span>
              </button>
              {v.ownership === "wanted" && <button className="rt-btn rt-sm" onClick={() => onHunt(v)}><LuSunrise />Hunt in Today</button>}
              <button className="rt-iconbtn" aria-label={`Delete ${v.name}`} onClick={() => setG((d) => void (d.vehicles = d.vehicles.filter((x) => x.id !== v.id)))}><LuTrash2 /></button>
              {openId === v.id && (
                <div className="rt-gr-detail">
                  <label className="rt-label" htmlFor={`rt-v-own-${v.id}`}>Status</label>
                  <select id={`rt-v-own-${v.id}`} className="rt-select" value={v.ownership} onChange={(e) => edit(v.id, (x) => void (x.ownership = e.target.value as Vehicle["ownership"]))}>
                    <option value="wanted">Wanted</option><option value="owned">Owned</option><option value="sold">Sold</option>
                  </select>
                  <div className="rt-label" style={{ marginTop: 12 }}>Mods</div>
                  <div className="rt-pill-row">
                    {v.mods.map((x, i) => <span key={`${x}-${i}`} className="rt-badge">{x}<button className="rt-link" aria-label={`Remove ${x}`} onClick={() => edit(v.id, (y) => void y.mods.splice(i, 1))}>×</button></span>)}
                  </div>
                  <form className="rt-inline-row" onSubmit={(e) => { e.preventDefault(); const t = mod.trim().slice(0, 60); if (t && v.mods.length < 30) edit(v.id, (y) => void y.mods.push(t)); setMod(""); }}>
                    <label className="rt-sr" htmlFor={`rt-v-mod-${v.id}`}>Add a mod</label>
                    <input id={`rt-v-mod-${v.id}`} className="rt-input" maxLength={60} placeholder="Add a mod, like 'Turbo'" value={mod} onChange={(e) => setMod(e.target.value)} />
                    <button className="rt-btn rt-sm" type="submit">Add</button>
                  </form>
                  <label className="rt-label" htmlFor={`rt-v-notes-${v.id}`} style={{ marginTop: 12 }}>Notes</label>
                  <textarea id={`rt-v-notes-${v.id}`} className="rt-textarea" maxLength={1000} value={v.notes} onChange={(e) => { const t = e.target.value.slice(0, 1000); edit(v.id, (x) => void (x.notes = t)); }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Properties({ list, profileId, setG }: { list: Property[]; profileId: string; setG: SetG }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Property["kind"]>("home");
  const [price, setPrice] = useState("");
  const [spaces, setSpaces] = useState("");
  const priceOk = !price.trim() || parseAmount(price) !== null;
  const edit = (id: string, fn: (p: Property) => void) => setG((d) => { const p = d.properties.find((x) => x.id === id); if (p) { fn(p); p.revision++; } });
  const add = () => {
    if (!name.trim() || !priceOk) return;
    const n = Math.round(Number(spaces));
    setG((d) => void d.properties.push(newProperty({ name: name.trim(), kind, price: price.trim() ? parseAmount(price)! : undefined, spaces: spaces && n >= 0 && n <= 500 ? n : undefined, profileId })));
    setName("");
    setPrice("");
    setSpaces("");
  };
  return (
    <section className="rt-panel rt-pad" aria-label="Properties">
      <form className="rt-gr-add rt-gr-add5" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="rt-sr" htmlFor="rt-pr-name">Property name</label>
        <input id="rt-pr-name" className="rt-input" maxLength={80} placeholder="Property, like 'Beach apartment'" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="rt-sr" htmlFor="rt-pr-kind">Kind</label>
        <select id="rt-pr-kind" className="rt-select" value={kind} onChange={(e) => setKind(e.target.value as Property["kind"])}>
          {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="rt-sr" htmlFor="rt-pr-price">Price</label>
        <input id="rt-pr-price" className="rt-input" inputMode="decimal" placeholder="Price" aria-invalid={!priceOk} value={price} onChange={(e) => setPrice(e.target.value)} />
        <label className="rt-sr" htmlFor="rt-pr-spaces">Vehicle spaces</label>
        <input id="rt-pr-spaces" className="rt-input" type="number" min={0} max={500} placeholder="Spaces" value={spaces} onChange={(e) => setSpaces(e.target.value)} />
        <button className="rt-btn rt-primary" type="submit" disabled={!name.trim() || !priceOk}><LuPlus />Add</button>
      </form>
      {list.length === 0 ? (
        <div className="rt-td-empty" style={{ marginTop: 14 }}><LuHouse /> No properties yet. Add places you own or want, with vehicle spaces if you'd like RipTide to count them.</div>
      ) : (
        <ul className="rt-td-goals">
          {list.map((p) => (
            <li key={p.id}>
              <label className="rt-check"><input type="checkbox" checked={p.owned} aria-label={`${p.name} owned`} onChange={(e) => edit(p.id, (x) => void (x.owned = e.target.checked))} /></label>
              <div className="rt-td-body">
                <div className="rt-td-title">{p.name}</div>
                <div className="rt-pill-row" style={{ marginTop: 6 }}>
                  <span className="rt-badge">{KIND[p.kind]}</span>
                  <span className={`rt-badge${p.owned ? " rt-sea" : ""}`}>{p.owned ? "Owned" : "Wanted"}</span>
                  {p.price !== undefined && <span className="rt-badge">{formatAmount(p.price)}</span>}
                  {p.spaces !== undefined && <span className="rt-badge">{p.spaces} spaces</span>}
                </div>
              </div>
              <button className="rt-iconbtn" aria-label={`Delete ${p.name}`} onClick={() => setG((d) => void (d.properties = d.properties.filter((x) => x.id !== p.id)))}><LuTrash2 /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Savings({ list, profileId, g, setG }: { list: SavingsGoal[]; profileId: string; g: GarageState; setG: SetG }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [forId, setForId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const targetN = parseAmount(target);
  const candidates = [...g.vehicles.filter((v) => v.profileId === profileId && v.ownership === "wanted"), ...g.properties.filter((p) => p.profileId === profileId && !p.owned)];
  const add = () => {
    if (!name.trim() || !targetN) return;
    setG((d) => void d.savings.push(newSavings({ name: name.trim(), target: targetN, forId: forId || undefined, profileId })));
    setName("");
    setTarget("");
    setForId("");
  };
  const change = (s: SavingsGoal, sign: 1 | -1) => {
    const n = parseAmount(amounts[s.id] ?? "");
    if (!n) return;
    setG((d) => { const x = d.savings.find((y) => y.id === s.id); if (x) { x.saved = Math.max(0, Math.min(1e12, x.saved + sign * n)); x.revision++; } });
    setAmounts((a) => ({ ...a, [s.id]: "" }));
  };
  return (
    <section className="rt-panel rt-pad" aria-label="Savings">
      <form className="rt-gr-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="rt-sr" htmlFor="rt-sv-name">Saving for</label>
        <input id="rt-sv-name" className="rt-input" maxLength={80} placeholder="Saving for, like 'Penthouse'" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="rt-sr" htmlFor="rt-sv-for">Linked to</label>
        <select id="rt-sv-for" className="rt-select" value={forId} onChange={(e) => { setForId(e.target.value); const c = candidates.find((x) => x.id === e.target.value); if (c) { if (!name.trim()) setName(c.name); if (!target.trim() && c.price) setTarget(String(c.price)); } }}>
          <option value="">Not linked</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="rt-sr" htmlFor="rt-sv-target">Target amount</label>
        <input id="rt-sv-target" className="rt-input" inputMode="decimal" placeholder="Target, like 1.5m" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="rt-btn rt-primary" type="submit" disabled={!name.trim() || !targetN}><LuPlus />Add</button>
      </form>
      {list.length === 0 ? (
        <div className="rt-td-empty" style={{ marginTop: 14 }}><LuPiggyBank /> No savings goals yet. Set a target and log what you put aside.</div>
      ) : (
        <ul className="rt-td-goals">
          {list.map((s) => {
            const pct = Math.min(100, (s.saved / s.target) * 100);
            return (
              <li key={s.id} style={{ flexWrap: "wrap" }}>
                <div className="rt-td-body">
                  <div className="rt-td-title">{s.name}</div>
                  <div className="rt-td-why">{formatAmount(s.saved)} of {formatAmount(s.target)}{s.saved >= s.target ? " · reached" : ` · ${formatAmount(s.target - s.saved)} to go`}</div>
                  <div className="rt-td-bar" role="progressbar" aria-label={`${s.name} progress`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                </div>
                <form className="rt-inline-row rt-gr-amt" onSubmit={(e) => { e.preventDefault(); change(s, 1); }}>
                  <label className="rt-sr" htmlFor={`rt-sv-a-${s.id}`}>Amount</label>
                  <input id={`rt-sv-a-${s.id}`} className="rt-input" inputMode="decimal" placeholder="Amount" value={amounts[s.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))} />
                  <button className="rt-btn rt-sm" type="submit">Add</button>
                  <button className="rt-btn rt-sm rt-ghost" type="button" onClick={() => change(s, -1)}>Take out</button>
                </form>
                <button className="rt-iconbtn" aria-label={`Delete ${s.name}`} onClick={() => setG((d) => void (d.savings = d.savings.filter((x) => x.id !== s.id)))}><LuTrash2 /></button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { LuArrowDown, LuArrowUp, LuCheck, LuDownload, LuMapPin, LuPlay, LuPlus, LuRoute, LuTrash2, LuX } from "react-icons/lu";
import {
  GOAL_TYPES,
  JourneyState,
  KEYS,
  MapState,
  ROUTE_METHOD,
  createObjective,
  debrief,
  exportRoute,
  formatDistance,
  goalType,
  lastFinishedPlace,
  optimiseRoute,
  pathLength,
  suggest,
  uid,
  type GoalType,
  type Objective,
  type PlaceRef,
  type Route,
} from "@riptide/tools";
import { downloadText, usePersisted } from "../persist";
import { PageHeader, useShell } from "../ui";
import { HeaderRight } from "./common";

const journeyDefault = () => JourneyState.parse({});
const mapDefault = () => MapState.parse({});
const BUDGETS = [15, 30, 60, 120];
const PRIORITY_LABEL = { high: "High", normal: "Normal", low: "Low" } as const;

/** Today: plan a session from your own goals, tick them off, and see what you did. */
export function Today() {
  const { go, toast } = useShell();
  const [j, setJ, jErr] = usePersisted(KEYS.journey, JourneyState, journeyDefault);
  const [m, setMap] = usePersisted(KEYS.map, MapState, mapDefault);
  const profileId = m.profiles.some((p) => p.id === m.activeProfile) ? m.activeProfile : m.profiles[0]!.id;
  const profile = m.profiles.find((p) => p.id === profileId)!;
  const found = useMemo(() => new Set(profile.found), [profile.found]);
  const active = j.sessions.find((s) => s.id === j.activeSessionId && !s.endedAt);
  const [summaryId, setSummaryId] = useState("");
  const summary = j.sessions.find((s) => s.id === summaryId && s.endedAt);

  const start = lastFinishedPlace(j.objectives, profileId);
  const plan = useMemo(
    () => suggest(j.objectives, { profileId, budgetMin: j.plan.budgetMin, focus: j.plan.focus, from: start, fromLabel: "your last finished goal", found }),
    [j.objectives, j.plan.budgetMin, j.plan.focus, profileId, start, found],
  );
  const goals = j.objectives.filter((o) => o.profileId === profileId);
  const open = goals.filter((o) => o.status !== "done");

  /** Select a place on the map and open it there. */
  const showOnMap = (p: PlaceRef) => {
    setMap((d) => {
      d.selectedId = p.placeId;
      d.view = { x: p.x, y: p.y, z: Math.max(d.view.z, 3.2) };
    });
    go("map");
  };

  const setStatus = (id: string, done: boolean) =>
    setJ((d) => {
      const o = d.objectives.find((x) => x.id === id);
      if (!o) return;
      o.status = done ? "done" : "planned";
      o.completedAt = done ? Date.now() : undefined;
      o.revision++;
      const s = d.sessions.find((x) => x.id === d.activeSessionId && !x.endedAt);
      if (s) {
        s.completed = done ? [...new Set([...s.completed, id])] : s.completed.filter((x) => x !== id);
        s.revision++;
      }
    });

  const startSession = () => {
    if (!plan.picks.length) return;
    const id = uid();
    setJ((d) => {
      d.sessions.push({ id, profileId, budgetMin: d.plan.budgetMin, startedAt: Date.now(), queue: plan.picks.map((p) => p.objective.id), completed: [], notes: "", revision: 0 });
      if (d.sessions.length > 200) d.sessions.splice(0, d.sessions.length - 200);
      d.activeSessionId = id;
      for (const p of plan.picks) {
        const o = d.objectives.find((x) => x.id === p.objective.id);
        if (o && o.status === "planned") o.status = "in-progress";
      }
    });
    setSummaryId("");
  };

  const finishSession = () => {
    if (!active) return;
    setJ((d) => {
      const s = d.sessions.find((x) => x.id === active.id);
      if (!s) return;
      s.endedAt = Date.now();
      s.revision++;
      d.activeSessionId = "";
      // Goals that weren't finished go back to planned, unless they were started before.
      for (const id of s.queue) {
        const o = d.objectives.find((x) => x.id === id);
        if (o && o.status === "in-progress" && !s.completed.includes(id)) o.status = "planned";
      }
    });
    setSummaryId(active.id);
  };

  const saveRoute = () => {
    const stops = plan.picks.filter((p) => p.objective.place).map((p) => p.objective.place!);
    if (stops.length < 2) return toast("A route needs at least two goals with places.");
    const id = uid();
    setJ((d) => {
      d.routes.push({ id, profileId, name: `Session route ${d.routes.length + 1}`, stops, method: ROUTE_METHOD, map: stops[0]!.map, createdAt: Date.now(), revision: 0 });
      d.shownRouteId = id;
    });
    toast("Route saved and shown on the map");
  };

  return (
    <div className="rt-page">
      <PageHeader
        crumb="Today"
        title="Plan your next session."
        sub="Say how long you've got. RipTide picks from goals you set yourself and tells you why. You tick things off; nothing reads the game."
        right={<HeaderRight />}
      />
      {jErr && <div className="rt-banner rt-warn" role="alert" style={{ marginBottom: 16 }}>{jErr}</div>}
      <div className="rt-today">
        <section className="rt-panel rt-pad" aria-labelledby="rt-td-plan">
          {active ? (
            <ActiveSession
              session={active}
              objectives={j.objectives}
              onToggle={setStatus}
              onNotes={(v) => setJ((d) => { const s = d.sessions.find((x) => x.id === active.id); if (s) s.notes = v; })}
              onFinish={finishSession}
              onMap={showOnMap}
            />
          ) : summary ? (
            <Debrief session={summary} objectives={j.objectives} onDone={() => setSummaryId("")} />
          ) : (
            <>
              <h2 id="rt-td-plan">How long have you got?</h2>
              <div className="rt-td-budget" role="group" aria-label="Time for this session">
                {BUDGETS.map((b) => (
                  <button key={b} className="rt-td-min" aria-pressed={j.plan.budgetMin === b} onClick={() => setJ((d) => void (d.plan.budgetMin = b))}>
                    <b>{b}</b><span>min</span>
                  </button>
                ))}
                <label className="rt-td-min rt-td-custom">
                  <span className="rt-sr">Other length in minutes</span>
                  <input
                    className="rt-input"
                    type="number"
                    min={5}
                    max={720}
                    placeholder="Other"
                    value={BUDGETS.includes(j.plan.budgetMin) ? "" : j.plan.budgetMin}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (Number.isFinite(n) && n >= 5 && n <= 720) setJ((d) => void (d.plan.budgetMin = n));
                    }}
                  />
                </label>
              </div>
              <div className="rt-label" style={{ marginTop: 18 }}>Focus on</div>
              <div className="rt-pill-row" role="group" aria-label="Focus on">
                {GOAL_TYPES.map((t) => {
                  const on = j.plan.focus.includes(t.id);
                  return (
                    <button key={t.id} className={`rt-td-chip${on ? " rt-on" : ""}`} aria-pressed={on} onClick={() => setJ((d) => void (d.plan.focus = on ? d.plan.focus.filter((x) => x !== t.id) : [...d.plan.focus, t.id]))}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {m.profiles.length > 1 && (
                <div style={{ marginTop: 16 }}>
                  <label className="rt-label" htmlFor="rt-td-prof">Playthrough</label>
                  <select id="rt-td-prof" className="rt-select" value={profileId} onChange={(e) => setMap((d) => void (d.activeProfile = e.target.value))}>
                    {m.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              <div className="rt-td-head">
                <h3>Suggested for {j.plan.budgetMin} minutes</h3>
                {plan.picks.length > 0 && <span className="rt-hint" style={{ margin: 0 }}>{plan.totalMin} min{plan.routeM > 0 ? ` · ${formatDistance(plan.routeM)} in straight lines` : ""}</span>}
              </div>
              {plan.picks.length === 0 ? (
                <div className="rt-td-empty">
                  {open.length ? "Every open goal is in a session already." : "No goals yet. Add one on the right, or pick a place on the map and choose Add to Today."}
                </div>
              ) : (
                <ol className="rt-td-queue">
                  {plan.picks.map((p, i) => (
                    <li key={p.objective.id} className={i < 3 ? "rt-top3" : ""}>
                      <span className="rt-td-n" aria-hidden="true">{i + 1}</span>
                      <div className="rt-td-body">
                        <div className="rt-td-title">{p.objective.title}</div>
                        <div className="rt-td-why">{p.reasons.join(" · ")}</div>
                      </div>
                      <div className="rt-td-meta">
                        <span title={p.minutesFrom === "yours" ? "Your estimate" : "A rough default for this kind of goal. Set your own on the goal."}>
                          {p.minutes} min{p.minutesFrom === "rough" ? " (rough)" : ""}
                        </span>
                        {p.objective.place && <button className="rt-iconbtn" aria-label={`Show ${p.objective.title} on the map`} onClick={() => showOnMap(p.objective.place!)}><LuMapPin /></button>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {plan.leftOut > 0 && <p className="rt-hint">{plan.leftOut} more open goal{plan.leftOut === 1 ? "" : "s"} didn't fit in {j.plan.budgetMin} minutes.</p>}
              <div className="rt-td-actions">
                <button className="rt-btn rt-primary" disabled={!plan.picks.length} onClick={startSession}><LuPlay />Start session</button>
                <button className="rt-btn" disabled={plan.picks.filter((p) => p.objective.place).length < 2} onClick={saveRoute}><LuRoute />Save as route</button>
              </div>
              <p className="rt-hint">Minutes marked rough are RipTide's guess for that kind of goal, not game data. Distances are straight lines on the map, not driving distances.</p>
            </>
          )}
        </section>

        <div className="rt-today-side">
          <Goals goals={goals} profileId={profileId} found={found} setJ={setJ} onMap={showOnMap} locked={new Set(active?.queue ?? [])} />
          <Routes routes={j.routes.filter((r) => r.profileId === profileId)} shownId={j.shownRouteId} setJ={setJ} onMap={showOnMap} toast={toast} />
        </div>
      </div>
    </div>
  );
}

function ActiveSession(props: {
  session: JourneyState["sessions"][number];
  objectives: Objective[];
  onToggle: (id: string, done: boolean) => void;
  onNotes: (v: string) => void;
  onFinish: () => void;
  onMap: (p: PlaceRef) => void;
}) {
  const { session } = props;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.max(0, Math.floor((now - session.startedAt) / 60000));
  const byId = new Map(props.objectives.map((o) => [o.id, o]));
  const items = session.queue.map((id) => byId.get(id)).filter((o): o is Objective => !!o);
  const done = items.filter((o) => o.status === "done").length;
  return (
    <>
      <div className="rt-td-head" style={{ marginTop: 0 }}>
        <h2 id="rt-td-plan">Session in progress</h2>
        <span className="rt-badge rt-sea">{done} of {items.length} done</span>
      </div>
      <div className="rt-td-clock" aria-live="polite">
        <b>{mins}</b><span>of {session.budgetMin} min</span>
        <div className="rt-td-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (mins / session.budgetMin) * 100)}%` }} /></div>
      </div>
      <ol className="rt-td-queue rt-td-check">
        {items.map((o, i) => (
          <li key={o.id} className={o.status === "done" ? "rt-done" : ""}>
            <label className="rt-check" style={{ flex: 1 }}>
              <input type="checkbox" checked={o.status === "done"} onChange={(e) => props.onToggle(o.id, e.target.checked)} />
              <span className="rt-td-n" aria-hidden="true">{i + 1}</span>
              <span className="rt-td-title">{o.title}</span>
            </label>
            {o.place && <button className="rt-iconbtn" aria-label={`Show ${o.title} on the map`} onClick={() => props.onMap(o.place!)}><LuMapPin /></button>}
          </li>
        ))}
      </ol>
      <label className="rt-label" htmlFor="rt-td-notes" style={{ marginTop: 18 }}>Notes</label>
      <textarea id="rt-td-notes" className="rt-textarea" maxLength={2000} placeholder="Anything to remember for next time" value={session.notes} onChange={(e) => props.onNotes(e.target.value.slice(0, 2000))} />
      <div className="rt-td-actions">
        <button className="rt-btn rt-primary" onClick={props.onFinish}><LuCheck />Finish session</button>
      </div>
      <p className="rt-hint">The clock is real time since you pressed Start. RipTide only counts what you tick.</p>
    </>
  );
}

function Debrief({ session, objectives, onDone }: { session: JourneyState["sessions"][number]; objectives: Objective[]; onDone: () => void }) {
  const d = debrief(session, objectives);
  return (
    <>
      <h2 id="rt-td-plan">Session finished</h2>
      <div className="rt-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Done</div><div className="rt-stat-v">{d.done.length}<small>of {session.queue.length}</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Time</div><div className="rt-stat-v">{d.minutes}<small>min</small></div></div>
        <div className="rt-panel rt-stat"><div className="rt-stat-label">Planned</div><div className="rt-stat-v">{session.budgetMin}<small>min</small></div></div>
      </div>
      {d.done.length > 0 && (<><h3 style={{ marginTop: 20 }}>You finished</h3><ul className="rt-list">{d.done.map((o) => <li key={o.id}><span>{o.title}</span></li>)}</ul></>)}
      {d.open.length > 0 && (<><h3 style={{ marginTop: 20 }}>Still open</h3><ul className="rt-list">{d.open.map((o) => <li key={o.id}><span>{o.title}</span></li>)}</ul></>)}
      {session.notes && (<><h3 style={{ marginTop: 20 }}>Notes</h3><p className="rt-td-notes">{session.notes}</p></>)}
      <div className="rt-td-actions"><button className="rt-btn rt-primary" onClick={onDone}>Plan the next one</button></div>
    </>
  );
}

function Goals(props: { goals: Objective[]; profileId: string; found: ReadonlySet<string>; setJ: (fn: (d: JourneyState) => void) => void; onMap: (p: PlaceRef) => void; locked: ReadonlySet<string> }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<GoalType>("other");
  const [priority, setPriority] = useState<Objective["priority"]>("normal");
  const [minutes, setMinutes] = useState("");
  const [showDone, setShowDone] = useState(false);
  const open = props.goals.filter((o) => o.status !== "done");
  const done = props.goals.filter((o) => o.status === "done");
  const add = () => {
    const t = title.trim();
    if (!t) return;
    const n = Math.round(Number(minutes));
    props.setJ((d) => void d.objectives.push(createObjective({ title: t, type, priority, estimateMin: minutes && n >= 1 && n <= 600 ? n : undefined, profileId: props.profileId })));
    setTitle("");
    setMinutes("");
  };
  const edit = (id: string, fn: (o: Objective) => void) => props.setJ((d) => { const o = d.objectives.find((x) => x.id === id); if (o) { fn(o); o.revision++; } });
  const list = showDone ? done : open;
  return (
    <section className="rt-panel rt-pad" aria-labelledby="rt-td-goals">
      <div className="rt-td-head" style={{ marginTop: 0 }}>
        <h2 id="rt-td-goals">Your goals</h2>
        <button className="rt-linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? `Open (${open.length})` : `Done (${done.length})`}</button>
      </div>
      <form className="rt-td-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="rt-sr" htmlFor="rt-td-new">New goal</label>
        <input id="rt-td-new" className="rt-input" maxLength={120} placeholder="Add a goal, like 'Find every garage in Vice City'" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="rt-td-addrow">
          <label className="rt-sr" htmlFor="rt-td-type">Kind</label>
          <select id="rt-td-type" className="rt-select" value={type} onChange={(e) => setType(e.target.value as GoalType)}>
            {GOAL_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label className="rt-sr" htmlFor="rt-td-prio">Priority</label>
          <select id="rt-td-prio" className="rt-select" value={priority} onChange={(e) => setPriority(e.target.value as Objective["priority"])}>
            <option value="high">High priority</option>
            <option value="normal">Normal priority</option>
            <option value="low">Low priority</option>
          </select>
          <label className="rt-sr" htmlFor="rt-td-mins">Your estimate in minutes</label>
          <input id="rt-td-mins" className="rt-input" type="number" min={1} max={600} placeholder="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <button className="rt-btn" type="submit" disabled={!title.trim()}><LuPlus />Add</button>
        </div>
      </form>
      {list.length === 0 ? (
        <p className="rt-hint">{showDone ? "Nothing finished yet." : "No open goals. Places from the map can be added with Add to Today."}</p>
      ) : (
        <ul className="rt-td-goals">
          {list.map((o) => (
            <li key={o.id}>
              <label className="rt-check">
                <input type="checkbox" checked={o.status === "done"} aria-label={`${o.title} done`} onChange={(e) => edit(o.id, (x) => { x.status = e.target.checked ? "done" : "planned"; x.completedAt = e.target.checked ? Date.now() : undefined; })} />
              </label>
              <div className="rt-td-body">
                <div className="rt-td-title">{o.title}</div>
                <div className="rt-pill-row">
                  <span className="rt-badge">{goalType(o.type).label}</span>
                  {o.priority !== "normal" && <span className={`rt-badge${o.priority === "high" ? " rt-pink" : ""}`}>{PRIORITY_LABEL[o.priority]}</span>}
                  {o.status === "in-progress" && <span className="rt-badge rt-sea">In a session</span>}
                  {o.estimateMin && <span className="rt-badge">{o.estimateMin} min</span>}
                  {o.place && props.found.has(o.place.placeId) && <span className="rt-badge rt-sun" title="Marked found on the map. RipTide doesn't tick goals off for you.">Found on map</span>}
                </div>
              </div>
              {o.place && <button className="rt-iconbtn" aria-label={`Show ${o.title} on the map`} onClick={() => props.onMap(o.place!)}><LuMapPin /></button>}
              <button className="rt-iconbtn" aria-label={`Delete ${o.title}`} disabled={props.locked.has(o.id)} title={props.locked.has(o.id) ? "In the current session" : undefined} onClick={() => props.setJ((d) => void (d.objectives = d.objectives.filter((x) => x.id !== o.id)))}><LuTrash2 /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Routes(props: { routes: Route[]; shownId: string; setJ: (fn: (d: JourneyState) => void) => void; onMap: (p: PlaceRef) => void; toast: (m: string) => void }) {
  const [openId, setOpenId] = useState("");
  const edit = (id: string, fn: (r: Route) => void) => props.setJ((d) => { const r = d.routes.find((x) => x.id === id); if (r) { fn(r); r.revision++; } });
  const move = (r: Route, i: number, by: number) => edit(r.id, (x) => { const [s] = x.stops.splice(i, 1); x.stops.splice(i + by, 0, s!); });
  return (
    <section className="rt-panel rt-pad" aria-labelledby="rt-td-routes">
      <div className="rt-td-head" style={{ marginTop: 0 }}>
        <h2 id="rt-td-routes">Routes</h2>
        <span className="rt-hint" style={{ margin: 0 }}>Straight-line distances</span>
      </div>
      {props.routes.length === 0 ? (
        <p className="rt-hint">Save a route from a suggested session, or use Add to route on a place in the map.</p>
      ) : (
        <ul className="rt-td-routes">
          {props.routes.map((r) => {
            const isOpen = openId === r.id;
            const shown = props.shownId === r.id;
            return (
              <li key={r.id}>
                <div className="rt-td-route">
                  <button className="rt-td-routename" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? "" : r.id)}>
                    <b>{r.name}</b>
                    <span>{r.stops.length} stop{r.stops.length === 1 ? "" : "s"} · {formatDistance(pathLength(r.stops))}</span>
                  </button>
                  <button className={`rt-btn rt-sm${shown ? " rt-sea-btn" : ""}`} aria-pressed={shown} onClick={() => props.setJ((d) => void (d.shownRouteId = shown ? "" : r.id))}>{shown ? "On the map" : "Show on map"}</button>
                </div>
                {isOpen && (
                  <div className="rt-td-routebody">
                    <label className="rt-sr" htmlFor={`rt-rn-${r.id}`}>Route name</label>
                    <input id={`rt-rn-${r.id}`} className="rt-input" maxLength={80} value={r.name} onChange={(e) => { const v = e.target.value.slice(0, 80); edit(r.id, (x) => void (x.name = v || "Route")); }} />
                    <ol className="rt-td-stops">
                      {r.stops.map((s, i) => (
                        <li key={`${s.placeId}-${i}`}>
                          <span className="rt-td-n" aria-hidden="true">{i + 1}</span>
                          <button className="rt-link rt-td-stop" onClick={() => props.onMap(s)}>{s.label}</button>
                          <button className="rt-iconbtn" aria-label={`Move ${s.label} up`} disabled={i === 0} onClick={() => move(r, i, -1)}><LuArrowUp /></button>
                          <button className="rt-iconbtn" aria-label={`Move ${s.label} down`} disabled={i === r.stops.length - 1} onClick={() => move(r, i, 1)}><LuArrowDown /></button>
                          <button className="rt-iconbtn" aria-label={`Remove ${s.label} from the route`} onClick={() => edit(r.id, (x) => void x.stops.splice(i, 1))}><LuX /></button>
                        </li>
                      ))}
                    </ol>
                    <div className="rt-td-actions">
                      <button className="rt-btn rt-sm" disabled={r.stops.length < 3} onClick={() => { const before = pathLength(r.stops); const next = optimiseRoute(r); props.setJ((d) => { const i = d.routes.findIndex((x) => x.id === r.id); if (i >= 0) d.routes[i] = next; }); props.toast(`Reordered: ${formatDistance(before)} → ${formatDistance(pathLength(next.stops))} in straight lines`); }}>Shorten the order</button>
                      <button className="rt-btn rt-sm" onClick={() => downloadText(`${r.name.replace(/[^\w-]+/g, "-").slice(0, 40) || "route"}.riptide-route.json`, exportRoute(r))}><LuDownload />Download</button>
                      <button className="rt-btn rt-sm rt-ghost rt-danger" onClick={() => props.setJ((d) => { d.routes = d.routes.filter((x) => x.id !== r.id); if (d.shownRouteId === r.id) d.shownRouteId = ""; })}><LuTrash2 />Delete</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { useId, useRef, useState } from "react";
import { LuPencil, LuPlus, LuDownload, LuUpload, LuTrash2, LuChevronDown, LuChevronRight, LuX, LuCheck } from "react-icons/lu";
import { KEYS, HeistState, TEMPLATES, createPlan, exportPlan, nextStatus, parsePlanFile, progress, uid, type Plan, type PhaseStatus } from "@riptide/tools";
import { usePersisted, downloadText, readFileText } from "../persist";
import { PageHeader, useShell } from "../ui";
import { DetachedGuard, HeaderRight } from "./common";

const hoDefault = () => HeistState.parse({});
const STATUS_LABEL: Record<PhaseStatus, string> = { "not-started": "Not started", "in-progress": "In progress", done: "Done" };
const clean = (s: string, max: number) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);

export function HeistOps() {
  return (
    <DetachedGuard tool="heist">
      <div className="rt-page">
        <PageHeader crumb="Heist Ops" title="The plan is half the win." sub="A quiet command center for your crew, from first briefing to final debrief." right={<HeaderRight />} />
        <HeistBody />
      </div>
    </DetachedGuard>
  );
}

function HeistBody() {
  const { toast } = useShell();
  const [s, set, storageError] = usePersisted(KEYS.heist, HeistState, hoDefault);
  const plan = s.plans.find((p) => p.id === s.activeId) ?? s.plans[0];
  const preview = plan ?? previewPlan;
  const editing = !!plan;
  const fileInput = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [template, setTemplate] = useState(TEMPLATES[0]!.id);

  const update = (fn: (p: Plan) => void) =>
    set((d) => {
      const p = d.plans.find((x) => x.id === (plan?.id ?? ""));
      if (!p) return;
      fn(p);
      p.updatedAt = Date.now();
    });

  const create = (tid = template) => {
    const p = createPlan(tid);
    set((d) => {
      d.plans.unshift(p);
      d.plans = d.plans.slice(0, 50);
      d.activeId = p.id;
    });
    toast("Plan created");
  };

  const importFile = async (f: File) => {
    setErr("");
    try {
      const p = parsePlanFile(await readFileText(f, 2 * 1024 * 1024));
      set((d) => {
        d.plans.unshift(p);
        d.plans = d.plans.slice(0, 50);
        d.activeId = p.id;
      });
      toast(`Imported ${p.name}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "This file couldn't be imported.");
    }
  };

  const p = progress(preview);

  return (
    <>
      {storageError && <div className="rt-banner rt-warn" role="alert">{storageError}</div>}
      <div className="rt-ho-grid">
        <div className="rt-ho-left">
          <PlanCard plan={plan} preview={preview} update={update} plans={s.plans} select={(id) => set((d) => void (d.activeId = id))} />
          <section className="rt-panel" aria-labelledby="rt-roles">
            <div className="rt-panel-head">
              <h2 id="rt-roles">Crew roles</h2>
              <span className="rt-meta">{p.assigned} of {p.roles} assigned</span>
            </div>
            <div style={{ padding: "6px 22px 10px" }}>
              {preview.roles.map((r) => (
                <RoleRow key={r.id} id={r.id} name={r.name} assignee={r.assignee} disabled={!editing} onAssign={(v) => update((pl) => void (pl.roles.find((x) => x.id === r.id)!.assignee = clean(v, 40)))} onRemove={() => update((pl) => void (pl.roles = pl.roles.filter((x) => x.id !== r.id)))} />
              ))}
              {preview.roles.length === 0 && <p style={{ color: "var(--rt-muted)", fontSize: 14 }}>No roles yet.</p>}
              {editing && preview.roles.length < 16 && <AddRow placeholder="Add a role, like 'Hacker'" max={40} onAdd={(v) => update((pl) => void pl.roles.push({ id: uid(), name: v, assignee: "" }))} />}
            </div>
          </section>
        </div>

        <div className="rt-ho-right">
          <section className="rt-panel" aria-labelledby="rt-timeline">
            <div className="rt-panel-head">
              <h2 id="rt-timeline">Operation timeline</h2>
              <span className="rt-meta">{editing ? `${p.phasesDone} of ${p.phases} done` : "Customizable template"}</span>
            </div>
            <div>
              {preview.phases.map((ph, i) => (
                <PhaseRow key={ph.id} index={i} phase={ph} editing={editing} update={update} />
              ))}
              {editing && preview.phases.length < 12 && (
                <div style={{ padding: "6px 24px 18px" }}>
                  <AddRow placeholder="Add a phase" max={60} onAdd={(v) => update((pl) => void pl.phases.push({ id: uid(), title: v, summary: "", status: "not-started", checklist: [] }))} />
                </div>
              )}
            </div>
          </section>

          <section className="rt-panel rt-pad" aria-labelledby="rt-notes" style={{ paddingTop: 26 }}>
            <div className="rt-notes-row">
              <div style={{ minWidth: 0 }}>
                <div className="rt-kicker" id="rt-notes">SHARED NOTES</div>
                {editing ? (
                  <>
                    <label className="rt-sr" htmlFor="rt-plan-notes">Shared notes</label>
                    <textarea id="rt-plan-notes" className="rt-textarea" style={{ marginTop: 12 }} maxLength={8000} placeholder="Decisions, reminders, meeting points…" value={plan!.notes} onChange={(e) => {
                      const v = clean(e.target.value, 8000);
                      update((pl) => void (pl.notes = v));
                    }} />
                    <p className="rt-hint">Notes stay on this device. Live crew rooms will connect everyone when online sync launches; until then, export the plan and share the file.</p>
                  </>
                ) : (
                  <p style={{ margin: "12px 0 0", color: "var(--rt-sub)", maxWidth: "60ch" }}>Give the team one place for decisions and reminders. Live crew rooms will connect everyone when online sync launches.</p>
                )}
              </div>
              {!editing && (
                <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
                  <label className="rt-sr" htmlFor="rt-template">Template</label>
                  <select id="rt-template" className="rt-select" style={{ height: 38, width: 230 }} value={template} onChange={(e) => setTemplate(e.target.value)}>
                    {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button className="rt-btn rt-primary" onClick={() => create()}>Create plan</button>
                </div>
              )}
            </div>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {editing && <button className="rt-btn rt-sm" onClick={() => create("crew-four")}><LuPlus />New plan</button>}
            {editing && <button className="rt-btn rt-sm" onClick={() => downloadText(`${plan!.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "plan"}.riptide-plan.json`, exportPlan(plan!))}><LuDownload />Export plan</button>}
            <button className="rt-btn rt-sm" onClick={() => fileInput.current?.click()}><LuUpload />Import plan</button>
            <input ref={fileInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
            {editing && <DeletePlan name={plan!.name} onDelete={() => set((d) => {
              d.plans = d.plans.filter((x) => x.id !== plan!.id);
              d.activeId = d.plans[0]?.id ?? "";
            })} />}
            {err && <span className="rt-error" role="alert" style={{ margin: 0 }}>{err}</span>}
          </div>
        </div>
      </div>
      <p className="rt-foot-note"><span>No GTA VI Online mechanics, missions or rewards are assumed. Plans are templates you fill in.</span></p>
    </>
  );
}

const previewPlan: Plan = { ...createPlan("crew-four", 0), id: "preview" };

function PlanCard({ plan, preview, update, plans, select }: { plan?: Plan; preview: Plan; update: (fn: (p: Plan) => void) => void; plans: Plan[]; select: (id: string) => void }) {
  const [edit, setEdit] = useState(false);
  return (
    <section className="rt-panel rt-pad" aria-labelledby="rt-plan" style={{ paddingTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="rt-kicker">CURRENT PLAN</div>
        {plans.length > 1 && (
          <>
            <label className="rt-sr" htmlFor="rt-plan-pick">Switch plan</label>
            <select id="rt-plan-pick" className="rt-select" style={{ height: 32, width: "auto", marginLeft: "auto", fontSize: 13 }} value={plan?.id} onChange={(e) => select(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        )}
      </div>
      {edit && plan ? (
        <form onSubmit={(e) => (e.preventDefault(), setEdit(false))} style={{ marginTop: 12 }}>
          <label className="rt-label" htmlFor="rt-pn">Name</label>
          <input id="rt-pn" className="rt-input" maxLength={80} value={plan.name} autoFocus onChange={(e) => { const v = clean(e.target.value, 80); update((p) => void (p.name = v)); }} />
          <label className="rt-label" htmlFor="rt-pd" style={{ marginTop: 14 }}>Description</label>
          <textarea id="rt-pd" className="rt-textarea" style={{ minHeight: 80 }} maxLength={400} value={plan.description} onChange={(e) => { const v = clean(e.target.value, 400); update((p) => void (p.description = v)); }} />
          <button className="rt-btn rt-sm" type="submit" style={{ marginTop: 12 }}><LuCheck />Done</button>
        </form>
      ) : (
        <>
          <h2 className="rt-plan-name" id="rt-plan">{preview.name || "Untitled operation"}</h2>
          <p style={{ margin: "0 0 20px", color: "var(--rt-sub)", fontSize: 14.5 }}>{preview.description || "No description yet."}</p>
          <button className="rt-btn" onClick={() => setEdit(true)} disabled={!plan} title={plan ? undefined : "Create a plan first"}><LuPencil />Edit operation</button>
        </>
      )}
    </section>
  );
}

function RoleRow({ id, name, assignee, disabled, onAssign, onRemove }: { id: string; name: string; assignee: string; disabled: boolean; onAssign: (v: string) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(assignee);
  return (
    <div className="rt-role">
      <span className={`rt-avatar${assignee ? " rt-filled" : ""}`} aria-hidden="true">{(assignee || name).charAt(0).toUpperCase()}</span>
      <div style={{ minWidth: 0 }}>
        <b>{name}</b>
        {open ? (
          <form className="rt-inline-row" style={{ marginTop: 6 }} onSubmit={(e) => (e.preventDefault(), onAssign(v.trim()), setOpen(false))}>
            <label className="rt-sr" htmlFor={`rt-as-${id}`}>Teammate for {name}</label>
            <input id={`rt-as-${id}`} className="rt-input" autoFocus maxLength={40} placeholder="Teammate's name" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
            <button className="rt-btn rt-sm" type="submit">Save</button>
          </form>
        ) : (
          <small>{assignee || "Choose a teammate"}</small>
        )}
      </div>
      {!open && (
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="rt-status" disabled={disabled} onClick={() => (setV(assignee), setOpen(true))} aria-label={`${assignee ? "Change" : "Assign"} ${name}`}>{assignee ? "Change" : "Assign +"}</button>
          {!disabled && <button className="rt-iconbtn" style={{ width: 28, height: 28 }} aria-label={`Remove role ${name}`} onClick={onRemove}><LuX /></button>}
        </div>
      )}
    </div>
  );
}

function PhaseRow({ index, phase, editing, update }: { index: number; phase: Plan["phases"][number]; editing: boolean; update: (fn: (p: Plan) => void) => void }) {
  const [open, setOpen] = useState(false);
  const tone = phase.status === "done" ? " rt-done" : phase.status === "in-progress" ? " rt-going" : "";
  const done = phase.checklist.filter((c) => c.done).length;
  const mut = (fn: (ph: Plan["phases"][number]) => void) => update((p) => { const ph = p.phases.find((x) => x.id === phase.id); if (ph) fn(ph); });
  return (
    <div className="rt-phase">
      <div className="rt-phase-row">
        <span className={`rt-num${tone}`}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ minWidth: 0 }}>
          {editing ? (
            <button className="rt-link" style={{ color: "var(--rt-sand)", gap: 8 }} aria-expanded={open} onClick={() => setOpen(!open)}>
              <h3>{phase.title}</h3>
              {open ? <LuChevronDown /> : <LuChevronRight />}
            </button>
          ) : (
            <h3>{phase.title}</h3>
          )}
          <p>{phase.summary || (phase.checklist.length ? `${done} of ${phase.checklist.length} checklist items done` : "Add a summary and checklist")}</p>
        </div>
        <button className={`rt-status${tone}`} disabled={!editing} onClick={() => mut((ph) => void (ph.status = nextStatus(ph.status)))} aria-label={`${phase.title}: ${STATUS_LABEL[phase.status]}. Change status`}>
          {STATUS_LABEL[phase.status]}
        </button>
      </div>
      {editing && open && (
        <div className="rt-phase-body">
          <label className="rt-label" htmlFor={`rt-ps-${phase.id}`}>Summary</label>
          <input id={`rt-ps-${phase.id}`} className="rt-input" maxLength={160} value={phase.summary} onChange={(e) => { const v = clean(e.target.value, 160); mut((ph) => void (ph.summary = v)); }} />
          <div className="rt-label" style={{ marginTop: 16 }}>Checklist</div>
          {phase.checklist.map((c) => (
            <div className={`rt-todo${c.done ? " rt-checked" : ""}`} key={c.id}>
              <label className="rt-check" style={{ minHeight: 0, flex: 1 }}>
                <input type="checkbox" checked={c.done} onChange={() => mut((ph) => { const it = ph.checklist.find((x) => x.id === c.id); if (it) it.done = !it.done; })} />
                <span>{c.text}</span>
              </label>
              <button className="rt-iconbtn" aria-label={`Remove ${c.text}`} onClick={() => mut((ph) => void (ph.checklist = ph.checklist.filter((x) => x.id !== c.id)))}><LuX /></button>
            </div>
          ))}
          {phase.checklist.length < 40 && <AddRow placeholder="Add a checklist item" max={160} onAdd={(v) => mut((ph) => void ph.checklist.push({ id: uid(), text: v, done: false }))} />}
          <button className="rt-btn rt-sm rt-danger" style={{ marginTop: 14 }} onClick={() => update((p) => void (p.phases = p.phases.filter((x) => x.id !== phase.id)))}><LuTrash2 />Remove phase</button>
        </div>
      )}
    </div>
  );
}

function AddRow({ placeholder, max, onAdd }: { placeholder: string; max: number; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  const id = useId();
  return (
    <form className="rt-inline-row" onSubmit={(e) => { e.preventDefault(); const t = clean(v.trim(), max); if (t) { onAdd(t); setV(""); } }}>
      <label className="rt-sr" htmlFor={id}>{placeholder}</label>
      <input id={id} className="rt-input" style={{ height: 38 }} placeholder={placeholder} maxLength={max} value={v} onChange={(e) => setV(e.target.value)} />
      <button className="rt-btn rt-sm" type="submit" disabled={!v.trim()}><LuPlus />Add</button>
    </form>
  );
}

function DeletePlan({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      Delete “{name}”?
      <button className="rt-btn rt-sm rt-danger" onClick={onDelete}>Delete</button>
      <button className="rt-btn rt-sm rt-ghost" onClick={() => setConfirm(false)}>Keep</button>
    </span>
  ) : (
    <button className="rt-btn rt-sm rt-ghost" onClick={() => setConfirm(true)}><LuTrash2 />Delete plan</button>
  );
}

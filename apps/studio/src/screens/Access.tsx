import { useState } from "react";
import { LuPlus, LuX, LuGripVertical } from "react-icons/lu";
import { useStore } from "../lib/store";
import { PageHead, Slider, Toggle } from "../components/ui";

export function Access() {
  const { bp, edit } = useStore();
  const a = bp.access;
  const [draft, setDraft] = useState("");
  const questions = a.application?.questions ?? [];

  const addQuestion = () => {
    const q = draft.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
    if (!q) return;
    edit((d) => {
      d.access.application ??= { questions: [], reviewers: ["admin"] };
      d.access.application.questions.push(q);
    });
    setDraft("");
  };

  return (
    <>
      <PageHead title="Joining" sub="Plan who gets in and how. This is saved in your Blueprint, but nothing applies it on a server yet, and applications don't reach Discord yet." />
      <div className="grid g-main">
        <section className="panel">
          <div className="panel-head"><h2>Application</h2><span className="meta">{questions.length} questions</span></div>
          <div className="panel-pad grid" style={{ gap: 10 }}>
            {questions.map((q, i) => (
              <div key={`${i}-${q}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--night)", border: "1px solid var(--line)", borderRadius: 10 }}>
                <LuGripVertical className="muted" aria-hidden="true" />
                <span className="muted small num" style={{ width: 18 }}>{i + 1}</span>
                <span style={{ flex: 1 }}>{q}</span>
                <button className="btn ghost small" aria-label={`Remove question ${i + 1}`} onClick={() => edit((d) => void d.access.application!.questions.splice(i, 1))}><LuX /></button>
              </div>
            ))}
            <form style={{ display: "flex", gap: 8, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); addQuestion(); }}>
              <input className="input" placeholder="Add a question, like 'Why do you want to join?'" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} aria-label="New question" />
              <button className="btn" type="submit" disabled={!draft.trim()}><LuPlus />Add</button>
            </form>
          </div>
        </section>

        <aside className="grid">
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 4 }}>Who can join</h2>
            <Toggle label="Whitelist" hint="Only approved players can connect" checked={a.whitelist} onChange={(v) => edit((d) => void (d.access.whitelist = v))} />
            <Toggle label="Require Discord" hint="Players must be in your server to connect" checked={a.discordRequired} onChange={(v) => edit((d) => void (d.access.discordRequired = v))} />
            <div style={{ paddingTop: 12 }}>
              <Slider label="Minimum account age" value={a.minAccountAgeDays} min={0} max={90} format={(v) => (v ? `${v} days` : "Any")} onChange={(v) => edit((d) => void (d.access.minAccountAgeDays = v))} />
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Queue priority</h2><span className="meta">Higher joins first</span></div>
            {a.queuePriority.map((q) => {
              const role = bp.roles.find((r) => r.id === q.role);
              return (
                <div className="role-card" key={q.role}>
                  <span className="bar" style={{ background: role?.color }} />
                  <span style={{ fontWeight: 500 }}>{role?.name ?? q.role}</span>
                  <span className="chip dim num">{q.priority}</span>
                </div>
              );
            })}
          </section>
        </aside>
      </div>
    </>
  );
}

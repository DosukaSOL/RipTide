import { useMemo, type ReactNode } from "react";
import { LuPlus } from "react-icons/lu";
import { effectivePermissions } from "@riptide/core";
import { useStore } from "../lib/store";
import { Check, PageHead } from "../components/ui";

const GROUPS: { label: string; perms: { id: string; label: string }[] }[] = [
  { label: "Everyone", perms: [{ id: "chat.ooc", label: "Out-of-character chat" }, { id: "vehicle.own", label: "Own vehicles" }] },
  { label: "Law", perms: [{ id: "mdt.read", label: "Read records" }, { id: "mdt.write", label: "Write records" }, { id: "cuff", label: "Restrain players" }, { id: "impound", label: "Impound vehicles" }] },
  { label: "Medical", perms: [{ id: "revive", label: "Revive players" }] },
  { label: "Staff", perms: [{ id: "tickets", label: "Handle reports" }, { id: "spectate", label: "Spectate" }, { id: "noclip", label: "Fly through walls" }, { id: "kick", label: "Kick players" }, { id: "admin.*", label: "Full admin" }] },
];

export function Roles() {
  const { bp, edit, toast } = useStore();
  const effective = useMemo(() => new Map(bp.roles.map((r) => [r.id, effectivePermissions(bp.roles, r.id)])), [bp.roles]);

  const toggle = (roleIdx: number, perm: string) =>
    edit((d) => {
      const r = d.roles[roleIdx]!;
      r.permissions = r.permissions.includes(perm) ? r.permissions.filter((p) => p !== perm) : [...r.permissions, perm];
    });

  return (
    <>
      <PageHead
        title="Roles"
        sub="Who can do what. Roles inherit from each other, so a moderator gets everything a citizen has. Dashed boxes are inherited."
        actions={<button className="btn" onClick={() => toast("Adding roles here isn't built yet. You can add them in the Blueprint file.")}><LuPlus />New role</button>}
      />
      <div className="grid g-main">
        <section className="panel" style={{ overflowX: "auto" }}>
          <table className="matrix">
            <thead>
              <tr>
                <th>Permission</th>
                {bp.roles.map((r) => (
                  <th key={r.id}>
                    <span className="role-head"><span className="role-sw" style={{ background: r.color }} />{r.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <FragmentGroup key={g.label} label={g.label} span={bp.roles.length + 1}>
                  {g.perms.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div>{p.label}</div>
                        <div className="perm small muted">{p.id}</div>
                      </td>
                      {bp.roles.map((r, i) => {
                        const own = r.permissions.includes(p.id);
                        const has = effective.get(r.id)?.has(p.id) ?? false;
                        const state = own ? "on" : has ? "inh" : "";
                        return (
                          <td key={r.id}>
                            <button
                              className={`cell ${state}`}
                              style={{ ["--c" as string]: r.color }}
                              aria-pressed={own}
                              aria-label={`${r.name}: ${p.label}${has && !own ? " (inherited)" : ""}`}
                              onClick={() => toggle(i, p.id)}
                            >
                              {has && <Check />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </FragmentGroup>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="panel">
          <div className="panel-head"><h2>Roles</h2><span className="meta">Top inherits from below</span></div>
          {[...bp.roles].reverse().map((r) => {
            const parent = bp.roles.find((x) => x.id === r.inherits);
            return (
              <div className="role-card" key={r.id}>
                <span className="bar" style={{ background: r.color }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="muted small">
                    {parent ? `Inherits ${parent.name}` : "Base role"}
                    {r.limit ? `, max ${r.limit}` : ""}
                  </div>
                </div>
                {r.discordRole ? <span className="chip dim">@{r.discordRole}</span> : <span className="muted small">{effective.get(r.id)?.size ?? 0} perms</span>}
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}

function FragmentGroup({ label, span, children }: { label: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr className="group"><td colSpan={span}>{label}</td></tr>
      {children}
    </>
  );
}

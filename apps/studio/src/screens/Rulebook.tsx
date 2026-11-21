import { useDeferredValue, useMemo } from "react";
import { LuCog, LuUserRound, LuCopy } from "react-icons/lu";
import { compileRulebook, renderDiscordEmbed, renderRulesMarkdown } from "@riptide/core";
import { useStore } from "../lib/store";
import { Logo, PageHead } from "../components/ui";

export function Rulebook() {
  const { bp, edit, toast } = useStore();
  const source = useDeferredValue(bp.rulebook);
  const compiled = useMemo(() => compileRulebook(source), [source]);
  const embed = useMemo(() => renderDiscordEmbed(bp.meta.name, compiled).embeds[0]!, [bp.meta.name, compiled]);

  const sections = useMemo(() => {
    const m = new Map<string, typeof compiled.rules>();
    compiled.rules.forEach((r) => m.set(r.section, [...(m.get(r.section) ?? []), r]));
    return [...m];
  }, [compiled]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(renderRulesMarkdown(bp.meta.name, compiled));
      toast("Rules page copied as Markdown");
    } catch {
      toast("Couldn't reach the clipboard");
    }
  };

  return (
    <>
      <PageHead
        title="Rulebook"
        sub="Write rules the way you'd explain them to a new player. Riptide enforces the ones it understands and leaves the rest to your staff."
        actions={<button className="btn" onClick={copy}><LuCopy />Copy rules page</button>}
      />
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h2>Your rules</h2>
          <span className="chip sea" style={{ marginLeft: 8 }}>{compiled.enforced} automatic</span>
          <span className="chip dim">{compiled.guidance} for staff</span>
          <span className="meta">Start a line with # to make a section</span>
        </div>
        <div className="rule-editor">
          <div className="src">
            <label htmlFor="rulebook-src" className="sr-only" style={{ position: "absolute", left: -9999 }}>Rulebook</label>
            <textarea
              id="rulebook-src"
              value={bp.rulebook}
              spellCheck
              maxLength={20000}
              onChange={(e) => {
                const v = e.target.value;
                edit((d) => void (d.rulebook = v));
              }}
            />
          </div>
          <div className="compiled" aria-live="polite">
            {sections.map(([name, rules]) => (
              <div key={name}>
                <h3>{name}</h3>
                {rules.map((r) => (
                  <div className={`rule ${r.enforcement ? "auto" : "staff"}`} key={`${r.line}-${r.text}`}>
                    <span className="ric">{r.enforcement ? <LuCog /> : <LuUserRound />}</span>
                    <div>
                      <div className="rt">{r.text}</div>
                      <div className="re">{r.effect}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Discord post</h2><span className="meta">Posted to #rules on every deploy</span></div>
        <div className="panel-pad">
          <div className="discord">
            <div className="av"><Logo size={26} /></div>
            <div>
              <div className="nm">Riptide<span className="bot">APP</span></div>
              <div className="embed">
                <div className="et">{embed.title}</div>
                {embed.fields.slice(0, 3).map((f) => (
                  <div className="ef" key={f.name}>
                    <b>{f.name}</b>
                    {f.value.split("\n").slice(0, 3).map((l, i) => <div key={i}>{l.replace(/\*\*/g, "")}</div>)}
                  </div>
                ))}
                <div className="foot">{embed.footer.text}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

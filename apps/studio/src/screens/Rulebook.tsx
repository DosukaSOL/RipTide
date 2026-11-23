import { useDeferredValue, useMemo } from "react";
import { LuCog, LuUserRound, LuCopy, LuTriangleAlert } from "react-icons/lu";
import { compileRulebook, renderDiscordMessages, renderRulesMarkdown } from "@riptide/core";
import { useStore } from "../lib/store";
import { Logo, PageHead } from "../components/ui";

export function Rulebook() {
  const { bp, edit, toast } = useStore();
  const source = useDeferredValue(bp.rulebook);
  const compiled = useMemo(() => compileRulebook(source), [source]);
  const messages = useMemo(() => renderDiscordMessages(bp.meta.name, compiled), [bp.meta.name, compiled]);
  const embed = messages[0]!.embeds[0]!;
  const embedCount = messages.reduce((n, m) => n + m.embeds.length, 0);

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
        sub="Write rules the way you'd explain them to a new player. Riptide marks the ones it can read as machine-readable rules. Nothing enforces them in-game yet: no Riptide server runtime ships today."
        actions={<button className="btn" onClick={copy}><LuCopy />Copy rules page</button>}
      />
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h2>Your rules</h2>
          <span className="chip sea" style={{ marginLeft: 8 }} title="Riptide understood these. They aren't enforced in-game until a server runtime ships.">{compiled.enforced} parsed, not yet enforced</span>
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
                    <span className="ric">{r.enforcement ? <LuCog /> : r.warning ? <LuTriangleAlert /> : <LuUserRound />}</span>
                    <div>
                      <div className="rt">{r.text}</div>
                      <div className="re">{r.warning ?? (r.enforcement ? `Parsed: ${r.effect}` : r.effect)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Discord post</h2><span className="meta">Preview. Riptide doesn't post to Discord yet{embedCount > 1 ? `. Long rulebooks are split over ${embedCount} embeds` : ""}</span></div>
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
                {embedCount > 1 && <div className="foot">Continued in {embedCount - 1} more embed{embedCount > 2 ? "s" : ""}</div>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import { LuExternalLink } from "react-icons/lu";
import { GATE_LABEL, MODULE_STATUS, ROADMAP } from "@riptide/tools";
import { PageHeader } from "../ui";
import { HeaderRight } from "./common";

export function Roadmap() {
  return (
    <div className="rt-page">
      <PageHeader crumb="Roadmap" title="What's coming, honestly." sub="Every future tool lists what it waits for. Nothing ships until it can be tested on the real game." right={<HeaderRight />} />
      <div className="rt-two">
        <section className="rt-panel" aria-labelledby="rt-now">
          <div className="rt-panel-head"><h2 id="rt-now">Where each tool is today</h2></div>
          <ul className="rt-list">
            {MODULE_STATUS.map((m) => (
              <li key={m.id}>
                <div>
                  <b>{m.name}</b>
                  <p>{m.detail}</p>
                </div>
                <span className={`rt-badge${m.id === "studio" ? " rt-sea" : ""}`}>{m.status}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rt-panel" aria-labelledby="rt-next">
          <div className="rt-panel-head"><h2 id="rt-next">On the horizon</h2><span className="rt-meta">{ROADMAP.length} tools</span></div>
          <ul className="rt-list">
            {ROADMAP.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.name}</b>
                  <p>{r.summary}</p>
                </div>
                <div className="rt-pill-row" style={{ justifyContent: "flex-end", maxWidth: 260 }}>
                  {r.gates.map((g) => <span key={g} className={`rt-badge${g.startsWith("gta6") ? " rt-sun" : ""}`}>Needs {GATE_LABEL[g]}</span>)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="rt-horizon-row">
        <div>
          <h3>Have an idea?</h3>
          <p>Suggest a tool or vote on what comes next in the project's issues.</p>
        </div>
        <a className="rt-link" href="https://github.com/DosukaSOL/RipTide/issues" target="_blank" rel="noopener noreferrer">Open GitHub issues<LuExternalLink /></a>
      </div>
    </div>
  );
}

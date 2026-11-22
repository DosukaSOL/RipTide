import { LuExternalLink } from "react-icons/lu";
import { PageHeader } from "../ui";
import { HeaderRight } from "./common";

const SHORTCUTS: [string, string][] = [
  ["Alt + 1–9", "Jump to a tool in the sidebar"],
  ["Ctrl + B", "Collapse or expand the sidebar"],
  ["/", "Search the map"],
  ["Arrow keys", "Pan the map, move between tabs, move the compare slider"],
  ["+ / −  and  0", "Zoom the map, reset the view"],
  ["Ctrl + Z", "Undo in RipTide Studio"],
  ["Esc", "Cancel placing a marker"],
];

export function Help() {
  return (
    <div className="rt-page">
      <PageHeader crumb="Help & feedback" title="Help & feedback" sub="Short answers, keyboard shortcuts and a place to report problems." right={<HeaderRight />} />
      <div className="rt-two">
        <section className="rt-panel" aria-labelledby="rt-kb">
          <div className="rt-panel-head"><h2 id="rt-kb">Keyboard</h2></div>
          <ul className="rt-list">
            {SHORTCUTS.map(([k, d]) => (
              <li key={k}><span>{d}</span><span className="rt-kbd">{k}</span></li>
            ))}
          </ul>
        </section>
        <div style={{ display: "grid", gap: 24 }}>
          <section className="rt-panel rt-pad" aria-labelledby="rt-faq">
            <h2 id="rt-faq">Good to know</h2>
            <ul className="rt-steps" style={{ marginTop: 12 }}>
              <li>RipTide is independent and isn't affiliated with Rockstar Games or Take-Two Interactive.</li>
              <li>Nothing is uploaded. Captures, screenshots, plans and markers stay on this device.</li>
              <li>GTA VI features that need the game on PC, like ViceLab tests and server support, wait for the PC release and Rockstar's server tools.</li>
              <li>The Interactive Map uses Rockstar's official map of Leonida. Its places come from the gtadb.org community (CC BY 4.0) and may not all be exact yet.</li>
              <li>RipTide never reads game memory, injects into game processes or automates gameplay.</li>
              <li>Studio deploys are simulated until RipTide hosting opens. Building FiveM server files works today.</li>
            </ul>
          </section>
          <section className="rt-panel rt-pad" aria-labelledby="rt-fb">
            <h2 id="rt-fb">Feedback</h2>
            <p style={{ color: "var(--rt-sub)", fontSize: 14.5, margin: "8px 0 16px" }}>Found a bug or want a feature? Open an issue. Security problems go through the private report button instead.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="rt-btn rt-sm" href="https://github.com/DosukaSOL/RipTide/issues/new" target="_blank" rel="noopener noreferrer"><LuExternalLink />Report a problem</a>
              <a className="rt-btn rt-sm rt-ghost" href="https://github.com/DosukaSOL/RipTide/security" target="_blank" rel="noopener noreferrer">Report a security issue</a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

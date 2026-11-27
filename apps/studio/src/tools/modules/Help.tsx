import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { PageHeader } from "../ui";
import { HeaderRight } from "./common";
import { useToolsData } from "../data";
import { MAP_ART_BUILT } from "../mapdata";

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
              <li>The Interactive Map's places come from the gtadb.org community (CC BY 4.0) and may not all be exact yet. You can switch the map background between the map art and RipTide's own grid in Settings.</li>
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
      <section className="rt-panel rt-pad" aria-labelledby="rt-phone" style={{ marginTop: 24 }}>
        <h2 id="rt-phone">Use it on your phone</h2>
        <ul className="rt-steps" style={{ marginTop: 12 }}>
          <li>Open the RipTide website on your phone and add it to your home screen: on iPhone, Share → Add to Home Screen; on Android, Install app.</li>
          <li>After the first visit it works offline, including Today, the Journal and the Garage. Map tiles you've looked at are kept for offline use too.</li>
          <li>Each device keeps its own data. To move it, use Settings → Export on one device and Restore on the other.</li>
        </ul>
      </section>
      <About />
    </div>
  );
}

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

/** Who made what. The map art, the place data and the software each get their own credit. */
function About() {
  const { settings } = useToolsData();
  const [licenses, setLicenses] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const art = MAP_ART_BUILT && settings.basemap === "official";
  const showLicenses = async () => {
    try {
      const r = await fetch("./THIRD_PARTY_LICENSES.txt", { credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      setLicenses(await r.text());
    } catch {
      setErr("The licence list couldn't be opened. It's also in THIRD_PARTY_LICENSES.txt next to the app.");
    }
  };
  return (
    <section className="rt-panel rt-pad" aria-labelledby="rt-about" style={{ marginTop: 24 }}>
      <h2 id="rt-about">About and credits</h2>
      <p className="rt-notice" style={{ margin: "10px 0 16px" }}>
        RipTide is independent software. It isn't affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. "Official" in RipTide only says where something comes from, not that Rockstar approved RipTide. RipTide doesn't include, unlock or run GTA VI, and it won't work with leaked builds or unofficial PC ports.
      </p>
      <dl className="rt-credits">
        <dt>Map background</dt>
        <dd>
          {MAP_ART_BUILT
            ? <>The map art of Leonida is © Rockstar Games; the tiles were prepared by gtadb.org. {art ? "It's shown now." : settings.basemap === "custom" ? "You're using your own map image instead; it stays on this device." : "It's switched off in Settings, so RipTide's own grid is shown."}</>
            : <>This copy of RipTide doesn't include map art. The grid is RipTide's own drawing.</>}
        </dd>
        <dt>Places</dt>
        <dd>GTA VI Landmarks Data by <a href="https://map.gtadb.org" target="_blank" rel="noopener noreferrer">gtadb.org</a> and contributors, under <a href={CC_BY} target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Changed by RipTide: unconfirmed and duplicate entries removed, sorted into RipTide's categories, street addresses and private homes removed, positions rounded.</dd>
        <dt>Software, fonts and icons</dt>
        <dd>
          React, Zod, d3, Lucide icons (through react-icons), DM Sans, Anonymous Pro and TeX Gyre Adventor, each under its own licence.{" "}
          {licenses === null && <button className="rt-linkbtn" onClick={showLicenses}>Show licences</button>}
        </dd>
        <dt>RipTide</dt>
        <dd>Code, name and logo © 2026 Dosuka. Source available at <a href="https://github.com/DosukaSOL/RipTide" target="_blank" rel="noopener noreferrer">github.com/DosukaSOL/RipTide</a>, all rights reserved.</dd>
      </dl>
      {err && <p className="rt-hint" role="alert">{err}</p>}
      {licenses !== null && <pre className="rt-licenses" tabIndex={0} aria-label="Third-party licences">{licenses}</pre>}
    </section>
  );
}

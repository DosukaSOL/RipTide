import { LuLayoutPanelLeft, LuChartLine, LuUsers, LuMap, LuArrowRight, LuMonitor, LuX, LuExternalLink } from "react-icons/lu";
import type { ToolId } from "@riptide/tools";
import { PageHeader, useShell } from "../ui";
import { HeaderRight } from "./common";
import { moduleById } from "../registry";
import { useOpenWindowsList } from "../ToolsApp";
import { focusTool } from "../windows";
import { RestoreBanner } from "./Workspaces";

const CARDS: { id: ToolId; icon: typeof LuMap; title: string; body: string; badge: string; tone?: "sea"; cta: string; feature?: boolean }[] = [
  { id: "studio", icon: LuLayoutPanelLeft, title: "RipTide Studio", body: "Design, validate and deploy your community server without writing code.", badge: "FiveM ready", tone: "sea", cta: "Open Studio", feature: true },
  { id: "vicelab", icon: LuChartLine, title: "ViceLab", body: "Measure performance and compare visual quality on your own hardware.", badge: "Preview", cta: "Open ViceLab" },
  { id: "heist", icon: LuUsers, title: "Heist Ops", body: "Build a plan, assign roles and coordinate with your crew.", badge: "Preview", cta: "Open Heist Ops" },
  { id: "map", icon: LuMap, title: "Interactive Map", body: "Explore the official map of Leonida, track what you've found and add your own markers.", badge: "Official map", cta: "Open the map" },
];

function Sunset() {
  return (
    <svg className="rt-home-sun" viewBox="0 0 290 130" aria-hidden="true">
      <defs>
        <linearGradient id="rt-hs" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset=".75" stopColor="#FF6F7D" />
          <stop offset="1" stopColor="#FF4F9A" stopOpacity=".15" />
        </linearGradient>
        <linearGradient id="rt-hw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1f4a" stopOpacity=".85" />
          <stop offset="1" stopColor="#130F26" stopOpacity="0" />
        </linearGradient>
        <clipPath id="rt-hc"><rect width="290" height="58" /></clipPath>
      </defs>
      <circle cx="145" cy="68" r="66" fill="url(#rt-hs)" clipPath="url(#rt-hc)" />
      <rect y="58" width="290" height="72" fill="url(#rt-hw)" />
      <circle cx="145" cy="68" r="66" fill="url(#rt-hs)" opacity=".18" />
      <line x1="0" x2="290" y1="58" y2="58" stroke="#FF6F7D" strokeOpacity=".55" />
    </svg>
  );
}

export function Home() {
  const { mounted, go, unmount, active } = useShell();
  const windows = useOpenWindowsList();
  const running = mounted.filter((t) => moduleById(t).tool && t !== active);
  const total = running.length + windows.length;

  return (
    <div className="rt-page">
      <PageHeader crumb="Home" title="Your city. Your setup. Your way." sub="Everything you need to plan, build and get more from GTA, thoughtfully organized in one place." right={<HeaderRight />} aside={<Sunset />} />
      <RestoreBanner />

      <div className="rt-home-grid">
        <section aria-labelledby="rt-explore">
          <div className="rt-section-title">
            <h2 id="rt-explore">Explore tools</h2>
            <span>All tools, one workspace</span>
          </div>
          <div className="rt-cards">
            {CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <a key={c.id} className={`rt-card${c.feature ? " rt-feature" : ""}`} href={c.id === "studio" ? "#/studio" : `#/${c.id}`} onClick={(e) => (e.preventDefault(), go(c.id))}>
                  <div className="rt-card-top">
                    <span className="rt-card-ic"><Icon /></span>
                    <span className={`rt-badge${c.tone ? ` rt-${c.tone}` : ""}`}>{c.badge}</span>
                  </div>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                  <div className="rt-card-foot">
                    <span>{c.cta}</span>
                    <LuArrowRight />
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        <aside style={{ display: "grid", gap: 18, alignContent: "start", marginTop: 38 }}>
          <section className="rt-panel" aria-labelledby="rt-running">
            <div className="rt-panel-head">
              <h2 id="rt-running">Running tools</h2>
              <span className="rt-meta">{total} active</span>
            </div>
            {total === 0 ? (
              <div className="rt-running-empty">
                <LuMonitor />
                <b>Nothing running yet</b>
                Open any tool to see it here.
                <br />
                Detach it to another display at any time.
              </div>
            ) : (
              <div>
                {running.map((t) => {
                  const m = moduleById(t);
                  const Icon = m.icon;
                  return (
                    <div className="rt-running-item" key={t}>
                      <Icon />
                      <button className="rt-link" style={{ color: "var(--rt-sand)", fontWeight: 600 }} onClick={() => go(t)}>
                        {m.label}
                        <small style={{ display: "inline", marginLeft: 8, fontWeight: 400 }}>In this window</small>
                      </button>
                      <button className="rt-iconbtn" aria-label={`Close ${m.label}`} title="Close tool" onClick={() => unmount(t)}><LuX /></button>
                    </div>
                  );
                })}
                {windows.map((w) => {
                  const m = moduleById(w.tool);
                  const Icon = m.icon;
                  return (
                    <div className="rt-running-item" key={`w-${w.tool}`}>
                      <Icon />
                      <span>
                        {m.label}
                        <small>In its own window</small>
                      </span>
                      <button className="rt-iconbtn" aria-label={`Show ${m.label} window`} title="Show window" onClick={() => focusTool(w.tool)}><LuExternalLink /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="rt-panel rt-pad">
            <h2>Build your workspace</h2>
            <p style={{ margin: "8px 0 20px", color: "var(--rt-sub)", fontSize: 14.5 }}>Use ViceLab on one monitor and the map on another. Every layout is yours to save.</p>
            <button className="rt-btn" onClick={() => go("workspaces")}>Manage workspaces<LuArrowRight /></button>
          </section>
        </aside>
      </div>

      <div className="rt-horizon-row">
        <div>
          <h3>More tools are on the horizon.</h3>
          <p>Explore what's coming, suggest a feature and track development.</p>
        </div>
        <button className="rt-link" onClick={() => go("roadmap")}>View roadmap<LuArrowRight /></button>
      </div>
      <div className="rt-foot-note"><span /><span>Preview build · no live game data</span></div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { forecastEconomy, type Forecast } from "@riptide/core";
import { useStore } from "../lib/store";
import { PageHead, Segmented, Slider, Toggle, money } from "../components/ui";

const W = 760;
const H = 300;
const M = { t: 16, r: 16, b: 28, l: 56 };

function ForecastChart({ f, sym }: { f: Forecast; sym: string }) {
  const x = scaleLinear().domain([1, f.days.length]).range([M.l, W - M.r]);
  const max = Math.max(...f.days.map((d) => d.p90), 1);
  const y = scaleLinear().domain([0, max * 1.1]).nice().range([H - M.b, M.t]);
  const med = line<(typeof f.days)[number]>().x((d) => x(d.day)).y((d) => y(d.median)).curve(curveMonotoneX)(f.days) ?? "";
  const p90 = line<(typeof f.days)[number]>().x((d) => x(d.day)).y((d) => y(d.p90)).curve(curveMonotoneX)(f.days) ?? "";
  const fill = area<(typeof f.days)[number]>().x((d) => x(d.day)).y0(H - M.b).y1((d) => y(d.median)).curve(curveMonotoneX)(f.days) ?? "";
  const ticks = y.ticks(4);
  const short = (v: number) => (v >= 1000 ? `${sym}${Math.round(v / 1000)}k` : `${sym}${v}`);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Median wallet over ${f.days.length} days, ${f.verdict}`}>
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF4F9A" stopOpacity=".28" />
            <stop offset="1" stopColor="#FF4F9A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="axis">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
              <text x={M.l - 10} y={y(t) + 4} textAnchor="end">{short(t)}</text>
            </g>
          ))}
          {[1, 15, 30, 45, 60].filter((d) => d <= f.days.length).map((d) => (
            <text key={d} x={x(d)} y={H - 8} textAnchor={d === 1 ? "start" : d === f.days.length ? "end" : "middle"}>Day {d}</text>
          ))}
        </g>
        <path className="area" d={fill} />
        <path className="p90 draw" d={p90} style={{ ["--len" as string]: 2400 }} />
        <path className="median draw" d={med} style={{ ["--len" as string]: 2400 }} />
      </svg>
    </div>
  );
}

export function Economy() {
  const { bp, edit } = useStore();
  const e = bp.economy;
  const [members, setMembers] = useState(Math.max(50, bp.meta.maxPlayers * 3));
  const [horizon, setHorizon] = useState<"30" | "60">("60");
  const f = useMemo(() => forecastEconomy(e, { members, days: Number(horizon) }), [e, members, horizon]);
  const sym = e.currency.symbol;
  const last = f.days[f.days.length - 1]!;
  const tone = f.verdict === "stable" ? "sea" : f.verdict === "inflating" ? "sun" : "pink";
  const title =
    f.verdict === "stable" && last.gini > 0.6
      ? "Steady for most, the top is pulling away"
      : { stable: "Holding steady", inflating: "Money is piling up", deflating: "Players are going broke" }[f.verdict];
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const maxShare = Math.max(...e.jobs.map((j) => j.share), 0.01);

  return (
    <>
      <PageHead
        title="Economy"
        sub="Riptide simulates your players' wallets day by day, so you find inflation before your community does. The forecast is a model; these values aren't applied in-game yet."
        actions={<Segmented label="Forecast length" value={horizon} onChange={setHorizon} options={[{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }]} />}
      />
      <div className="grid g-main">
        <div className="grid">
          <section className="panel">
            <div className="panel-head">
              <h2>Forecast</h2>
              <div className="legend" style={{ marginLeft: 16 }}>
                <span><i style={{ background: "var(--flamingo)" }} />Median wallet</span>
                <span><i style={{ background: "var(--sunset)" }} />Top 10%</span>
              </div>
              <span className="meta">{members} members, about {last.active} online daily</span>
            </div>
            <div style={{ padding: "12px 12px 4px" }} key={`${horizon}`}>
              <ForecastChart f={f} sym={sym} />
            </div>
            <div className="verdict">
              <span className={`chip ${tone}`}>{f.verdict}</span>
              <span className="verdict-title">{title}</span>
              <span className="muted small" style={{ marginLeft: "auto" }}>
                Median {money(last.median, sym)}, top 10% {money(last.p90, sym)}, Gini {last.gini.toFixed(2)}
              </span>
            </div>
            <ul className="advice">
              {f.advice.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Jobs</h2><span className="meta">Pay per hour, and how many players pick each job</span></div>
            <div style={{ padding: "6px 20px 12px" }}>
              {e.jobs.map((j, i) => (
                <div className="job-row" key={j.id}>
                  <Slider
                    label={j.label}
                    value={j.payPerHour}
                    min={0}
                    max={4000}
                    step={50}
                    format={(v) => `${money(v, sym)}/h`}
                    onChange={(v) => edit((d) => void (d.economy.jobs[i]!.payPerHour = v))}
                  />
                  <div className="bar" title={`${Math.round(j.share * 100)}% of players`}>
                    <i style={{ width: `${(j.share / maxShare) * 100}%` }} />
                  </div>
                  <span className="muted small num" style={{ textAlign: "right" }}>{Math.round(j.share * 100)}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid">
          <section className="panel panel-pad grid" style={{ gap: 18 }}>
            <h2>Taxes</h2>
            <Slider label="Income tax" value={e.taxes.income} min={0} max={0.4} step={0.01} format={pct} onChange={(v) => edit((d) => void (d.economy.taxes.income = v))} />
            <Slider label="Sales tax" value={e.taxes.sales} min={0} max={0.25} step={0.01} format={pct} onChange={(v) => edit((d) => void (d.economy.taxes.sales = v))} />
            <Slider label="Weekly property tax" value={e.taxes.property} min={0} max={0.1} step={0.005} format={pct} onChange={(v) => edit((d) => void (d.economy.taxes.property = v))} />
            <Toggle label="Autopilot" hint="Nudges property tax each week to keep the median wallet steady" checked={e.autopilot} onChange={(v) => edit((d) => void (d.economy.autopilot = v))} />
          </section>
          <section className="panel panel-pad grid" style={{ gap: 18 }}>
            <h2>New players</h2>
            <Slider label="Starting money" value={e.startingCash + e.startingBank} min={0} max={20000} step={250} format={(v) => money(v, sym)} onChange={(v) => edit((d) => { d.economy.startingCash = Math.round(v * 0.2); d.economy.startingBank = v - Math.round(v * 0.2); })} />
            <Slider label="Unemployment pay" value={e.welfarePerHour} min={0} max={1000} step={25} format={(v) => `${money(v, sym)}/h`} onChange={(v) => edit((d) => void (d.economy.welfarePerHour = v))} />
            <Slider label="Community size" value={members} min={50} max={1500} step={10} format={(v) => `${v}`} onChange={setMembers} />
          </section>
          <section className="panel panel-pad">
            <h2 style={{ marginBottom: 10 }}>Biggest costs</h2>
            {[...e.sinks].sort((a, b) => b.avgCost * b.perDay - a.avgCost * a.perDay).slice(0, 5).map((s) => (
              <div className="cost-line" key={s.id}>
                <span>{s.label}</span>
                <span className="num">{money(s.avgCost * s.perDay, sym)}/day</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}

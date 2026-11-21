import type { Economy } from "./blueprint";

/**
 * Economy forecast: an agent-based simulation of your server's money supply
 * before a single player joins. Deterministic for a given seed so results
 * are reproducible and diffable between preview servers.
 */

export interface ForecastOptions {
  days: number;
  /** Community size (people who play at least occasionally). */
  members: number;
  /** Share of members who play on a given day. */
  dailyActive: number;
  /** Mean hours played by an active member per day. */
  meanHours: number;
  /** Share of wealth above the comfort line that active players spend per day (cars, houses, toys). */
  lifestyleRate: number;
  /** Wealth players keep before lifestyle spending kicks in, as a multiple of starting money. */
  comfortMultiple: number;
  seed: number;
}

export interface ForecastDay {
  day: number;
  active: number;
  supply: number;
  median: number;
  p90: number;
  gini: number;
  minted: number;
  burned: number;
  propertyTaxRate: number;
}

export interface Forecast {
  days: ForecastDay[];
  verdict: "stable" | "inflating" | "deflating";
  /** Avg daily change in median wealth over the second half, as a fraction. */
  drift: number;
  advice: string[];
  /** Days until the median player could afford the most expensive sink. */
  daysToLuxury: number | null;
}

export const DEFAULT_FORECAST: ForecastOptions = { days: 60, members: 400, dailyActive: 0.4, meanHours: 2.5, lifestyleRate: 0.04, comfortMultiple: 4, seed: 1337 };

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Agent {
  balance: number;
  job: number; // -1 = no job
  engagement: number; // multiplier on hours
  thrift: number; // multiplier on spending
  played: boolean;
}

export function forecastEconomy(econ: Economy, opts: Partial<ForecastOptions> = {}): Forecast {
  const o = { ...DEFAULT_FORECAST, ...opts };
  const rand = mulberry32(o.seed);
  const jobs = econ.jobs;
  const cumulative: number[] = [];
  jobs.reduce((s, j, i) => ((cumulative[i] = s + j.share), s + j.share), 0);

  const agents: Agent[] = Array.from({ length: o.members }, () => {
    const r = rand();
    const job = cumulative.findIndex((c) => r < c);
    return {
      balance: econ.startingCash + econ.startingBank,
      job,
      engagement: Math.exp(gaussian(rand) * 0.6 - 0.18),
      thrift: Math.exp(gaussian(rand) * 0.35),
      played: false,
    };
  });

  let propertyTax = econ.taxes.property;
  const out: ForecastDay[] = [];

  for (let day = 1; day <= o.days; day++) {
    let minted = 0;
    let burned = 0;
    let active = 0;
    for (const a of agents) {
      if (rand() > o.dailyActive * Math.min(1.6, a.engagement)) continue;
      active++;
      a.played = true;
      const hours = Math.max(0.25, o.meanHours * a.engagement * (0.6 + rand() * 0.8));
      const rate = a.job >= 0 ? jobs[a.job]!.payPerHour : econ.welfarePerHour;
      if (rate > 0) {
        const gross = rate * hours;
        const net = gross * (1 - econ.taxes.income);
        minted += gross;
        burned += gross - net;
        a.balance += net;
      }
      const sessionFactor = hours / o.meanHours;
      for (const s of econ.sinks) {
        const times = s.perDay * sessionFactor * (0.5 + rand());
        let spend = s.avgCost * times * a.thrift * (1 + econ.taxes.sales);
        spend = Math.min(spend, a.balance * 0.85);
        a.balance -= spend;
        burned += spend;
      }
      // Lifestyle creep: richer players buy bigger things.
      const comfort = Math.max(1000, (econ.startingCash + econ.startingBank) * o.comfortMultiple);
      if (a.balance > comfort) {
        const spend = (a.balance - comfort) * o.lifestyleRate * a.thrift * sessionFactor;
        a.balance -= spend;
        burned += spend;
      }
    }
    if (day % 7 === 0) {
      for (const a of agents) {
        const over = a.balance - econ.taxes.propertyThreshold;
        if (over > 0) {
          const t = over * propertyTax;
          a.balance -= t;
          burned += t;
        }
      }
    }

    // Wallet stats only count people who have actually played; untouched starter balances would pin the median.
    const supply = agents.reduce((s, a) => s + a.balance, 0);
    const players = agents.filter((a) => a.played);
    const sorted = (players.length ? players : agents).map((a) => a.balance).sort((x, y) => x - y);
    out.push({
      day,
      active,
      supply: Math.round(supply),
      median: Math.round(sorted[Math.floor(sorted.length / 2)]!),
      p90: Math.round(sorted[Math.floor(sorted.length * 0.9)]!),
      gini: round(gini(sorted), 3),
      minted: Math.round(minted),
      burned: Math.round(burned),
      propertyTaxRate: round(propertyTax, 4),
    });

    if (econ.autopilot && day % 7 === 0 && out.length >= 7) {
      const weekAgo = out[out.length - 7]!.median || 1;
      const growth = (out[out.length - 1]!.median - weekAgo) / weekAgo / 7;
      if (growth > 0.02) propertyTax = Math.min(0.1, propertyTax + 0.005);
      if (growth < -0.005) propertyTax = Math.max(0, propertyTax - 0.005);
    }
  }

  return summarize(out, econ);
}

const rate = (a: number, b: number, n: number) => (n > 0 ? Math.pow(Math.max(b, 1) / Math.max(a, 1), 1 / n) - 1 : 0);

function summarize(days: ForecastDay[], econ: Economy): Forecast {
  const half = days.slice(Math.floor(days.length / 2));
  const last = half[half.length - 1]!.median;
  const drift = rate(half[0]!.median, last, half.length - 1);
  const supplyDrift = rate(half[0]!.supply, half[half.length - 1]!.supply, half.length - 1);
  // A median that collapses far below what players started with is deflation,
  // even if it then flatlines near zero (players can't spend what they don't have).
  const start = econ.startingCash + econ.startingBank;
  const collapsed = start > 0 && last < start * 0.25;
  const verdict: Forecast["verdict"] =
    drift < -0.01 || collapsed ? "deflating" : drift > 0.02 || supplyDrift > 0.015 ? "inflating" : "stable";
  const sym = econ.currency.symbol;

  const advice: string[] = [];
  const tail = days.slice(-7);
  const avgActive = tail.reduce((s, d) => s + d.active, 0) / tail.length || 1;
  const net = tail.reduce((s, d) => s + d.minted - d.burned, 0) / tail.length;
  const perPlayer = Math.round(net / avgActive);

  if (verdict === "inflating" && drift <= 0.02) {
    advice.push(`The typical player is fine, but the total money supply grows ${(supplyDrift * 100).toFixed(1)}% a day as top earners pile up cash. Add expensive things worth buying, or raise the property tax.`);
  } else if (verdict === "inflating") {
    advice.push(`Players gain about ${sym}${fmt(perPlayer)} more than they spend each day. Add a recurring cost around that size, like rent or vehicle upkeep.`);
    if (econ.taxes.property < 0.03) advice.push(`Raising the weekly property tax to 3% would slow the richest players down without touching new ones.`);
  } else if (verdict === "deflating") {
    advice.push(`Players lose about ${sym}${fmt(-perPlayer)} a day on average. Raise job pay or lower a few costs so new players can keep up.`);
  } else {
    advice.push("Money in and money out are balanced. Good place to launch.");
  }
  const g = days[days.length - 1]!.gini;
  if (g > 0.6) advice.push(`Wealth is concentrating fast (Gini ${g.toFixed(2)}). Consider a progressive property tax or caps on passive income.`);

  const luxury = Math.max(0, ...econ.sinks.map((s) => s.avgCost));
  const hit = days.find((d) => d.median >= luxury);
  return { days, verdict, drift: round(drift, 4), advice, daysToLuxury: luxury ? (hit?.day ?? null) : null };
}

export function gini(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (!n) return 0;
  const min = Math.min(0, sortedAsc[0]!);
  const vals = sortedAsc.map((v) => v - min);
  const total = vals.reduce((s, v) => s + v, 0);
  if (!total) return 0;
  let acc = 0;
  vals.forEach((v, i) => (acc += (2 * (i + 1) - n - 1) * v));
  return acc / (n * total);
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const fmt = (n: number) => Math.abs(n).toLocaleString("en-US");

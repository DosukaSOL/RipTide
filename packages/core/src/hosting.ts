import type { Blueprint } from "./blueprint";
import { estimateBudget } from "./budget";

export interface Region {
  id: string;
  label: string;
  city: string;
  /** Price multiplier vs. baseline. */
  priceFactor: number;
  lat: number;
  lon: number;
}

export const REGIONS: Region[] = [
  { id: "eu-ams", label: "Europe West", city: "Amsterdam", priceFactor: 1, lat: 52.37, lon: 4.9 },
  { id: "eu-fra", label: "Europe Central", city: "Frankfurt", priceFactor: 1.02, lat: 50.11, lon: 8.68 },
  { id: "us-mia", label: "US East", city: "Miami", priceFactor: 1.08, lat: 25.76, lon: -80.19 },
  { id: "us-dal", label: "US Central", city: "Dallas", priceFactor: 1.04, lat: 32.78, lon: -96.8 },
  { id: "us-lax", label: "US West", city: "Los Angeles", priceFactor: 1.1, lat: 34.05, lon: -118.24 },
  { id: "sa-sao", label: "South America", city: "São Paulo", priceFactor: 1.3, lat: -23.55, lon: -46.63 },
  { id: "ap-sin", label: "Asia Pacific", city: "Singapore", priceFactor: 1.25, lat: 1.35, lon: 103.82 },
  { id: "oc-syd", label: "Oceania", city: "Sydney", priceFactor: 1.35, lat: -33.87, lon: 151.21 },
];

export interface HostingPlan {
  vcpu: number;
  ramGB: number;
  diskGB: number;
  monthlyUsd: number;
  breakdown: { label: string; usd: number }[];
}

/** Rough sizing from player count and mod load. Prices are estimates, shown as such. */
export function estimateHosting(bp: Pick<Blueprint, "mods" | "meta" | "ops">, regionId = bp.meta.region): HostingPlan {
  const region = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0]!;
  const budget = estimateBudget(bp);
  const players = bp.meta.maxPlayers;
  const vcpu = Math.max(2, Math.ceil(players / 48 + budget.totals.serverMs / 4));
  const ramGB = Math.max(4, Math.ceil(2 + players / 32 + budget.totals.streamMB / 1500));
  const diskGB = Math.ceil(20 + budget.totals.streamMB / 1024 * 2 + bp.ops.backups.keep * 1.5);
  const breakdown = [
    { label: `${vcpu} vCPU`, usd: vcpu * 6.5 },
    { label: `${ramGB} GB memory`, usd: ramGB * 1.6 },
    { label: `${diskGB} GB storage`, usd: diskGB * 0.08 },
    { label: "Database", usd: 6 },
    { label: "DDoS protection", usd: 4 },
  ].map((b) => ({ ...b, usd: round(b.usd * region.priceFactor) }));
  return { vcpu, ramGB, diskGB, monthlyUsd: round(breakdown.reduce((s, b) => s + b.usd, 0)), breakdown };
}

/** Pick the region with the lowest average distance to where members are. */
export function bestRegion(members: { lat: number; lon: number; weight?: number }[]): { region: Region; avgKm: number }[] {
  return REGIONS.map((region) => {
    let w = 0;
    let d = 0;
    for (const m of members) {
      const wt = m.weight ?? 1;
      d += haversine(region.lat, region.lon, m.lat, m.lon) * wt;
      w += wt;
    }
    return { region, avgKm: Math.round(d / (w || 1)) };
  }).sort((a, b) => a.avgKm - b.avgKm);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const round = (n: number) => Math.round(n * 100) / 100;

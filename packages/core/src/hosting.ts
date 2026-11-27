import type { Blueprint } from "./blueprint";

export interface Region {
  id: string;
  label: string;
  city: string;
  lat: number;
  lon: number;
}

export const REGIONS: Region[] = [
  { id: "eu-ams", label: "Europe West", city: "Amsterdam", lat: 52.37, lon: 4.9 },
  { id: "eu-fra", label: "Europe Central", city: "Frankfurt", lat: 50.11, lon: 8.68 },
  { id: "us-mia", label: "US East", city: "Miami", lat: 25.76, lon: -80.19 },
  { id: "us-dal", label: "US Central", city: "Dallas", lat: 32.78, lon: -96.8 },
  { id: "us-lax", label: "US West", city: "Los Angeles", lat: 34.05, lon: -118.24 },
  { id: "sa-sao", label: "South America", city: "São Paulo", lat: -23.55, lon: -46.63 },
  { id: "ap-sin", label: "Asia Pacific", city: "Singapore", lat: 1.35, lon: 103.82 },
  { id: "oc-syd", label: "Oceania", city: "Sydney", lat: -33.87, lon: 151.21 },
];

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

/**
 * Preview data for the design build. The hosted control plane replaces
 * these with real deploys and preview servers.
 */

export const DEPLOY_HISTORY = [
  { id: "d7", title: "Rulebook update", detail: "Added beachfront speed limit, 2 more rules parsed", when: "12 min ago" },
  { id: "d6", title: "Economy rebalance", detail: "Rent 900 → 550, unemployment pay added", when: "Yesterday" },
  { id: "d5", title: "Added Beach Club Interior", detail: "+160 MB download, merged from preview", when: "3 days ago" },
  { id: "d4", title: "First launch", detail: "128 slots, Miami", when: "Nov 2" },
];

export const PREVIEWS = [
  { branch: "storm-season", summary: "Weekly storms, flooded beachfront zone, 4 changes", state: "live" as const, players: 6 },
  { branch: "gang-turf", summary: "Turf wars mod, gang cap 8 → 10", state: "paused" as const, players: 0 },
];

/** Where Discord members are, for the region picker. Aggregated, no personal data. */
export const MEMBER_SPREAD = [
  { lat: 25.8, lon: -80.2, weight: 120 },
  { lat: 40.7, lon: -74.0, weight: 80 },
  { lat: 41.9, lon: -87.6, weight: 40 },
  { lat: 29.8, lon: -95.4, weight: 35 },
  { lat: 51.5, lon: -0.1, weight: 25 },
  { lat: 19.4, lon: -99.1, weight: 20 },
];
